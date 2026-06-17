import os

from app.pipelines.extract_images import extract_images


def test_extracts_and_saves_embedded_image(pdf_with_image, tmp_path):
    result = extract_images(pdf_with_image, out_dir=str(tmp_path))
    images = result["images"]
    assert len(images) == 1

    img = images[0]
    assert img["page"] == 0
    assert img["index"] == 0
    assert os.path.exists(img["path"])
    assert os.path.getsize(img["path"]) > 0
    # bbox should be near where we placed it: Rect(100, 100, 180, 180)
    assert img["bbox"][0] == 100 and img["bbox"][1] == 100


def test_returns_empty_when_no_images(pdf_text_and_link, tmp_path):
    result = extract_images(pdf_text_and_link, out_dir=str(tmp_path))
    assert result["images"] == []
