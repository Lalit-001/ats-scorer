from app.pipelines.extract_text import extract_text


def test_extracts_body_text(pdf_text_and_link):
    result = extract_text(pdf_text_and_link)
    assert "Jane Developer" in result["text"]


def test_captures_explicit_uri_link(pdf_text_and_link):
    result = extract_text(pdf_text_and_link)
    uris = [l["uri"] for l in result["links"]]
    assert "https://github.com/jane" in uris
    link = next(l for l in result["links"] if l["uri"] == "https://github.com/jane")
    assert link["page"] == 0


def test_excludes_links_that_sit_over_an_image(pdf_text_and_link):
    # If the link rect is reported as overlapping an image, it belongs to Pipeline C, not A.
    image_rects_by_page = {0: [[50, 150, 250, 170]]}
    result = extract_text(pdf_text_and_link, image_rects_by_page=image_rects_by_page)
    assert result["links"] == []
