from app.pipelines.extract_images import extract_images
from app.pipelines.extract_links import extract_icon_links


def test_detects_hyperlink_over_image_icon(pdf_icon_link, tmp_path):
    images = extract_images(pdf_icon_link, out_dir=str(tmp_path))["images"]
    result = extract_icon_links(pdf_icon_link, images)

    icon_links = result["icon_links"]
    assert len(icon_links) == 1
    assert icon_links[0]["uri"] == "https://linkedin.com/in/jane"
    assert icon_links[0]["matched_image_index"] == images[0]["index"]
    assert icon_links[0]["page"] == 0


def test_plain_text_link_is_not_an_icon_link(pdf_text_and_link, tmp_path):
    images = extract_images(pdf_text_and_link, out_dir=str(tmp_path))["images"]
    result = extract_icon_links(pdf_text_and_link, images)
    assert result["icon_links"] == []
