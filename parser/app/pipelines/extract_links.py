"""Pipeline C: hyperlinks hidden behind image icons (e.g. a LinkedIn icon).

Matches each URI link annotation against the image bounding boxes found by
Pipeline B; a link whose rectangle sits on top of an image is an "icon link".
"""
import fitz

from .geometry import overlap_ratio

OVERLAP_THRESHOLD = 0.5


def extract_icon_links(doc: fitz.Document, images) -> dict:
    images_by_page = {}
    for img in images:
        images_by_page.setdefault(img["page"], []).append(img)

    icon_links = []
    for pno, page in enumerate(doc):
        page_images = images_by_page.get(pno, [])
        for link in page.get_links():
            if link.get("kind") != fitz.LINK_URI or not link.get("uri"):
                continue
            rect = link["from"]
            box = [rect.x0, rect.y0, rect.x1, rect.y1]
            best, best_ratio = None, OVERLAP_THRESHOLD
            for img in page_images:
                ratio = overlap_ratio(box, img["bbox"])
                if ratio >= best_ratio:
                    best, best_ratio = img, ratio
            if best is not None:
                icon_links.append({
                    "uri": link["uri"],
                    "page": pno,
                    "bbox": box,
                    "matched_image_index": best["index"],
                })
    return {"icon_links": icon_links}
