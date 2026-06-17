"""FastAPI parser service: PDF in -> raw A/B/C extraction out. No LLM, no DB."""
import os

import fitz
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .extract import run_extraction

app = FastAPI(title="ATS Parser", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/extract")
async def extract(file: UploadFile = File(...), app_id: str = Form(...)):
    pdf_bytes = await file.read()
    data_dir = os.environ.get("DATA_DIR", "/data")
    out_dir = os.path.join(data_dir, "images", app_id)

    try:
        return run_extraction(pdf_bytes, out_dir=out_dir)
    except fitz.FileDataError as exc:
        raise HTTPException(status_code=400, detail=f"Not a valid PDF: {exc}")
