"""Combine the extraction pipelines into a single raw-extraction result."""
import fitz

from .pipelines.basic_details import extract_basic_details
from .pipelines.extract_images import extract_images, annotate_image_flags
from .pipelines.extract_links import extract_icon_links
from .pipelines.extract_text import extract_text
from .pipelines.links_categorize import categorize_links, find_plaintext_urls
from .pipelines.structure import build_structured, parse_quality


def run_extraction(pdf_bytes: bytes, out_dir: str) -> dict:
    """Open a PDF (bytes) and run extraction.

    Image extraction runs first so its bounding boxes can (a) exclude icon links
    from the text links and (b) be matched against icon-embedded links.

    On top of the raw pipelines we now derive (deterministically, no AI):
      * ``structured`` — sections, normalized skills, experience years, education,
        certifications — so the worker rarely needs an LLM to structure a resume;
      * ``links`` — every link (text + icon) categorized by domain, with an
        ``other`` bucket for unrecognized ones;
      * per-image ``is_icon`` / ``likely_certificate`` flags to gate vision calls;
      * ``parse_quality`` so the worker knows when to fall back to an LLM.

    The legacy ``pipeline_a/b/c`` + ``basic_details`` fields are kept so existing
    consumers keep working while the backend is migrated.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        images = extract_images(doc, out_dir)["images"]

        image_rects_by_page = {}
        for img in images:
            image_rects_by_page.setdefault(img["page"], []).append(img["bbox"])

        pipeline_a = extract_text(doc, image_rects_by_page)
        pipeline_c = extract_icon_links(doc, images)

        annotate_image_flags(images, pipeline_c["icon_links"])
        # Include bare/plain-text URLs (not clickable) alongside hyperlink and
        # icon-embedded links so every link in the resume reaches the dashboard.
        plain_urls = find_plaintext_urls(pipeline_a["text"])
        links = categorize_links(pipeline_a["links"], pipeline_c["icon_links"], plain_urls)
        structured = build_structured(doc, pipeline_a["text"])

        link_uris = [link["uri"] for link in pipeline_a["links"]]
        link_uris += [link["uri"] for link in pipeline_c["icon_links"]]

        return {
            "pipeline_a": pipeline_a,
            "pipeline_b": {"images": images},
            "pipeline_c": pipeline_c,
            "basic_details": extract_basic_details(pipeline_a["text"], link_uris),
            "structured": structured,
            "links": links,
            "parse_quality": parse_quality(structured, pipeline_a["text"]),
        }
    finally:
        doc.close()
