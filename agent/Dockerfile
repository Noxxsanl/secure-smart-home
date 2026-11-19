FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Cài phụ thuộc trước để cache layer — chỉ build lại bước này khi requirements.txt đổi.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY pyproject.toml ./
COPY src ./src
COPY prompts ./prompts
RUN pip install --no-deps .

# Không copy agent/.env vào image — biến môi trường truyền lúc chạy (compose env_file / -e).
RUN useradd --create-home --uid 10001 agent
USER agent

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["uvicorn", "smarthome_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
