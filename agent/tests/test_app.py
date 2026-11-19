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
    assert res.json() == {
        "status": "ok",
        "llm_configured": False,
        "stt_ready": False,
        "backend_configured": False,
    }


def test_health_stt_ready_needs_provider_and_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    monkeypatch.setenv("STT_PROVIDER", "openai")
    assert TestClient(create_app()).get("/health").json()["stt_ready"] is True


def test_messages_requires_credential():
    res = TestClient(create_app()).post("/v1/homes/1/messages", json={"text": "bật đèn"})
    assert res.status_code == 401
    assert res.json()["error"] == "NO_TOKEN"


def test_production_requires_key():
    with pytest.raises(ValueError):
        Settings(_env_file=None, AGENT_ENV="production", OPENAI_API_KEY="")


def test_development_without_key_does_not_crash_even_with_stt_openai():
    settings = Settings(_env_file=None, AGENT_ENV="development", STT_PROVIDER="openai")
    assert settings.llm_configured is False and settings.stt_ready is False


def test_secret_not_in_repr():
    s = Settings(_env_file=None, OPENAI_API_KEY="sk-test-not-real", BACKEND_SERVICE_TOKEN="t" * 40)
    assert "sk-test" not in repr(s) and "tttt" not in repr(s)


def test_reasoning_effort_default_is_low():
    assert Settings(_env_file=None).openai_reasoning_effort == "low"


@pytest.mark.parametrize("value", ["default", "none", "minimal", "low", "medium", "high"])
def test_reasoning_effort_accepts_valid_values(value):
    assert Settings(_env_file=None, OPENAI_REASONING_EFFORT=value).openai_reasoning_effort == value


@pytest.mark.parametrize("value", ["ultra", "LOW", "xhigh", "1"])
def test_reasoning_effort_rejects_invalid_values(value):
    with pytest.raises(ValueError):
        Settings(_env_file=None, OPENAI_REASONING_EFFORT=value)


def test_reasoning_effort_blank_falls_back_to_default_low():
    assert Settings(_env_file=None, OPENAI_REASONING_EFFORT="").openai_reasoning_effort == "low"
