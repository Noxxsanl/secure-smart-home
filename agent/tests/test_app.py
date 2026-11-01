import pytest
from fastapi.testclient import TestClient

from smarthome_agent.config import Settings
from smarthome_agent.main import create_app


def test_health_does_not_leak_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    res = TestClient(create_app()).get("/health")
    assert res.status_code == 200
    assert res.json()["llm_configured"] is True
    assert "sk-test" not in res.text


def test_health_without_key():
    res = TestClient(create_app()).get("/health")
    assert res.json()["llm_configured"] is False


def test_messages_requires_authorization_header():
    res = TestClient(create_app()).post("/v1/homes/1/messages", json={"text": "bật đèn"})
    assert res.status_code == 422


def test_production_requires_key():
    with pytest.raises(ValueError):
        Settings(_env_file=None, AGENT_ENV="production", OPENAI_API_KEY="")


def test_secret_not_in_repr():
    s = Settings(_env_file=None, OPENAI_API_KEY="sk-test-not-real")
    assert "sk-test" not in repr(s)
