# Backend image. Build from the backend/ folder. All settings come from environment variables.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite:////data/workbench.db

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY app app
COPY migrations migrations
# The pricing mock ships in the image so a demo can run before the pricing service delivers the proposed contract (task 19).
COPY tests/__init__.py tests/__init__.py
COPY tests/pricing_mock tests/pricing_mock

RUN useradd --create-home --uid 10002 backend && mkdir /data && chown backend /data
USER backend
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/health')"

# Migrate, then serve.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
