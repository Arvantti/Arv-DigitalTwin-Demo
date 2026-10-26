# Build context: repository root. Kept aligned with apps/twin-emulator-api/Containerfile.
FROM python:3.12-slim-bookworm

WORKDIR /app
RUN pip install --no-cache-dir uv==0.12.5
COPY . .
RUN uv sync --frozen --no-dev --package twin-emulator-api

ENV PATH="/app/.venv/bin:$PATH"
ENV TWIN_MODELS="/app/industrial-models"
EXPOSE 8000
CMD ["uvicorn", "twin_emulator_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
