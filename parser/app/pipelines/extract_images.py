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
