"""Fixture PDFs built in-memory with PyMuPDF, so tests are self-contained."""
import fitz
import pytest


@pytest.fixture
def pdf_text_and_link():
    """A page with body text and one clickable text hyperlink (no images)."""
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    page.insert_text((50, 100), "Jane Developer")
    link_rect = fitz.Rect(50, 150, 250, 170)
    page.insert_text((50, 165), "github.com/jane")
    page.insert_link({"kind": fitz.LINK_URI, "from": link_rect, "uri": "https://github.com/jane"})
    return doc


@pytest.fixture
def pdf_with_image():
    """A page with one embedded raster image and no links."""
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 80, 80))
    pix.clear_with(128)
    page.insert_image(fitz.Rect(100, 100, 180, 180), stream=pix.tobytes("png"))
    return doc


@pytest.fixture
def pdf_icon_link():
    """A page with an image icon that has a hyperlink annotation over it."""
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 40))
    pix.clear_with(40)
    icon_rect = fitz.Rect(100, 100, 140, 140)
    page.insert_image(icon_rect, stream=pix.tobytes("png"))
    page.insert_link({"kind": fitz.LINK_URI, "from": icon_rect, "uri": "https://linkedin.com/in/jane"})
    return doc
