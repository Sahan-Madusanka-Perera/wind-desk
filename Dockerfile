# syntax=docker/dockerfile:1.7
# WindDesk: one image serving the FastAPI backend and the built React frontend.

# ---------------------------------------------------------------- frontend build
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    WINDDESK_STATIC_DIR=/app/static \
    PORT=8000

WORKDIR /app
COPY requirements.txt ./
RUN pip install --requirement requirements.txt

COPY backend/app ./app
COPY --from=frontend /build/dist ./static

RUN useradd --create-home --uid 10001 winddesk
USER winddesk

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"

# PORT is honoured so the same image runs on any container host (Heroku sets it).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
