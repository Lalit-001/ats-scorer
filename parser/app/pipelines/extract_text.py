"""Pipeline A: extract full text and explicit/clickable text hyperlinks."""
import fitz

from .geometry import boxes_overlap


def extract_text(doc: fitz.Document, image_rects_by_page=None) -> dict:
    """Return the document text plus URI links that are NOT sitting over an image.

    Links overlapping an image icon are intentionally left out — they belong to
    Pipeline C (icon-embedded hyperlinks). Pass ``image_rects_by_page`` as a
    ``{page_number: [bbox, ...]}`` map to enable that exclusion.
    """
    image_rects_by_page = image_rects_by_page or {}
    text_parts = []
    links = []
    for pno, page in enumerate(doc):
        text_parts.append(page.get_text())
        page_image_rects = image_rects_by_page.get(pno, [])
        for link in page.get_links():
            if link.get("kind") != fitz.LINK_URI or not link.get("uri"):
                continue
            rect = link["from"]
            box = [rect.x0, rect.y0, rect.x1, rect.y1]
            if any(boxes_overlap(box, img) for img in page_image_rects):
                continue
            links.append({
                "uri": link["uri"],
                "text": page.get_textbox(rect).strip(),
                "page": pno,
            })
    return {"text": "\n".join(text_parts), "links": links}
