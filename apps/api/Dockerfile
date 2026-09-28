FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
RUN addgroup --system opsweave && adduser --system --ingroup opsweave opsweave
COPY pyproject.toml ./
COPY src ./src
RUN python -m pip install .
USER opsweave
EXPOSE 8000
CMD ["uvicorn", "opsweave_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
