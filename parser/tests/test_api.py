from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_extract_endpoint_returns_all_pipelines(pdf_icon_link, tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    pdf_bytes = pdf_icon_link.tobytes()

    resp = client.post(
        "/extract",
        files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
        data={"app_id": "app-123"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["pipeline_a"]["text"] is not None
    assert body["pipeline_c"]["icon_links"][0]["uri"] == "https://linkedin.com/in/jane"


def test_extract_rejects_non_pdf(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    resp = client.post(
        "/extract",
        files={"file": ("note.txt", b"not a pdf", "text/plain")},
        data={"app_id": "app-x"},
    )
    assert resp.status_code == 400
