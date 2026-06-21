FROM python:3.12-slim

WORKDIR /app

# Install the package + dependencies. Copy the source first since the build
# (setuptools find packages = app*) needs it.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

# Alembic lives outside the package; run via the CLI (imports the installed app).
COPY alembic ./alembic
COPY alembic.ini ./

# Entrypoint chosen per service via compose `command` (uvicorn / arq).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000"]
