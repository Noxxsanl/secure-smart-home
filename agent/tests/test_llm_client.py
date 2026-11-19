import os

import pytest

from smarthome_agent.config import get_settings
from smarthome_agent.planner.llm import OPENAI_DEFAULT_BASE_URL, get_openai_client

SDK_ENV = ("OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID")


@pytest.fixture(autouse=True)
def _fresh_client():
    get_openai_client.cache_clear()
    yield
    get_openai_client.cache_clear()


def test_blank_sdk_env_from_compose_does_not_break_client(monkeypatch):
    # compose env_file: "OPENAI_BASE_URL=" → biến môi trường rỗng; SDK coi "" là base URL thật
    # → mọi lời gọi APIConnectionError (UnsupportedProtocol). Phải về mặc định api.openai.com.
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    for name in SDK_ENV:
        monkeypatch.setenv(name, "")
    get_settings.cache_clear()

    client = get_openai_client()

    assert str(client.base_url).rstrip("/") == OPENAI_DEFAULT_BASE_URL
    # Không gửi header OpenAI-Organization / OpenAI-Project rỗng
    assert client.organization is None and client.project is None
    assert not any(name in os.environ for name in SDK_ENV)


def test_explicit_sdk_settings_are_kept(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("OPENAI_ORG_ID", "org-test")
    monkeypatch.setenv("OPENAI_PROJECT_ID", "proj_test")
    get_settings.cache_clear()

    client = get_openai_client()

    assert str(client.base_url).rstrip("/") == "http://localhost:11434/v1"
    assert (client.organization, client.project) == ("org-test", "proj_test")
