from app.extract import run_extraction


def test_combines_all_three_pipelines(pdf_icon_link, tmp_path):
    pdf_bytes = pdf_icon_link.tobytes()
    result = run_extraction(pdf_bytes, out_dir=str(tmp_path))

    assert "pipeline_a" in result
    assert result["pipeline_b"]["images"], "should find the embedded icon image"
    assert result["pipeline_c"]["icon_links"][0]["uri"] == "https://linkedin.com/in/jane"
    # The icon link belongs to Pipeline C and must not leak into Pipeline A.
    assert result["pipeline_a"]["links"] == []


def test_handles_plain_text_resume(pdf_text_and_link, tmp_path):
    pdf_bytes = pdf_text_and_link.tobytes()
    result = run_extraction(pdf_bytes, out_dir=str(tmp_path))

    assert "Jane Developer" in result["pipeline_a"]["text"]
    assert result["pipeline_a"]["links"][0]["uri"] == "https://github.com/jane"
    assert result["pipeline_b"]["images"] == []
    assert result["pipeline_c"]["icon_links"] == []
