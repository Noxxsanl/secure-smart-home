import pytest

from smarthome_agent.config import get_settings


@pytest.fixture(autouse=True)
def _isolated_settings(monkeypatch):
    # Biến môi trường thắng agent/.env: test không phụ thuộc .env trên máy dev,
    # không gọi OpenAI thật.
    monkeypatch.setenv("AGENT_ENV", "development")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("STT_PROVIDER", "none")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
