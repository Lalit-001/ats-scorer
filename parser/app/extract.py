"""Combine the three extraction pipelines into a single raw-extraction result."""
import fitz

from .pipelines.extract_images import extract_images
from .pipelines.extract_links import extract_icon_links
from .pipelines.extract_text import extract_text


def run_extraction(pdf_bytes: bytes, out_dir: str) -> dict:
    """Open a PDF (bytes) and run Pipelines A, B and C.

    Pipeline B runs first so its image bounding boxes can (a) exclude icon links
    from Pipeline A and (b) be matched against links in Pipeline C.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        images = extract_images(doc, out_dir)["images"]

        image_rects_by_page = {}
        for img in images:
            image_rects_by_page.setdefault(img["page"], []).append(img["bbox"])

        return {
            "pipeline_a": extract_text(doc, image_rects_by_page),
            "pipeline_b": {"images": images},
            "pipeline_c": extract_icon_links(doc, images),
        }
    finally:
        doc.close()
