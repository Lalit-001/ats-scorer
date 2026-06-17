FROM python:3.12-slim

# PyMuPDF wheels are self-contained; tesseract only needed if OCR fallback is enabled.
WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.110" "uvicorn[standard]>=0.29" "python-multipart>=0.0.9" "PyMuPDF>=1.24"

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
