"""Pipeline B: extract embedded raster images and save them to disk.

Classification (certificate vs photo vs logo) is NOT done here — that is the
worker's LLM vision job. This pipeline only pulls the bytes out and records
where each image sits on the page (bbox), so Pipeline C can match icon links.
"""
import os

import fitz


def extract_images(doc: fitz.Document, out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    images = []
    index = 0
    for pno, page in enumerate(doc):
        for info in page.get_image_info(xrefs=True):
            xref = info.get("xref")
            if not xref:
                continue
            extracted = doc.extract_image(xref)
            ext = extracted.get("ext", "png")
            path = os.path.join(out_dir, f"img-{index}.{ext}")
            with open(path, "wb") as fh:
                fh.write(extracted["image"])
            bbox = info["bbox"]
            images.append({
                "index": index,
                "page": pno,
                "path": path,
                "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
                "width": extracted.get("width"),
                "height": extracted.get("height"),
            })
            index += 1
    return {"images": images}


# Bounding boxes are in PDF points (1/72 inch).
_ICON_MAX_PT = 60      # icons/logos are small
_CERT_MIN_W_PT = 150   # certificates occupy a sizable region
_CERT_MIN_H_PT = 100


def annotate_image_flags(images, icon_links):
    """Tag each image so the worker can skip icons/logos and target certificates.

    ``is_icon``: matched to a link OR physically tiny (logo/social icon).
    ``likely_certificate``: not an icon and large enough to be a document scan.
    """
    icon_indices = {l.get("matched_image_index") for l in (icon_links or [])}
    for img in images:
        x0, y0, x1, y1 = img["bbox"]
        w, h = x1 - x0, y1 - y0
        is_icon = img["index"] in icon_indices or (w <= _ICON_MAX_PT and h <= _ICON_MAX_PT)
        img["is_icon"] = bool(is_icon)
        img["likely_certificate"] = bool(
            not is_icon and w >= _CERT_MIN_W_PT and h >= _CERT_MIN_H_PT
        )
    return images
