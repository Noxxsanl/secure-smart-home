import json
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx
import pytest

from smarthome_agent.config import Settings
from smarthome_agent.usage import (
    UsageRecord,
    UsageReporter,
    anthropic_usage,
    openai_usage,
    track_llm_call,
)

TOKEN = "t" * 40


def _record(**overrides) -> UsageRecord:
    data = {
        "provider": "openai",
        "model": "gpt-5-mini",
        "purpose": "planner",
        "latency_ms": 820,
        "input_tokens": 1200,
        "cached_input_tokens": 1000,
        "output_tokens": 150,
        "occurred_at": datetime(2026, 11, 13, tzinfo=UTC),
    }
    data.update(overrides)
    return UsageRecord(**data)


def test_openai_chat_completions_usage():
    usage = SimpleNamespace(
        prompt_tokens=1200,
        completion_tokens=300,
        prompt_tokens_details=SimpleNamespace(cached_tokens=1024),
        completion_tokens_details=SimpleNamespace(reasoning_tokens=200),
    )
    tokens = openai_usage(usage)
    assert (tokens.input_tokens, tokens.cached_input_tokens) == (1200, 1024)
    assert (tokens.output_tokens, tokens.reasoning_tokens) == (300, 200)
    assert tokens.cache_write_tokens == 0


def test_openai_responses_api_usage_dict():
    usage = {
        "input_tokens": 500,
        "output_tokens": 80,
        "input_tokens_details": {"cached_tokens": 0},
        "output_tokens_details": {"reasoning_tokens": 64},
    }
    tokens = openai_usage(usage)
    assert (tokens.input_tokens, tokens.output_tokens, tokens.reasoning_tokens) == (500, 80, 64)


def test_anthropic_usage_is_normalized_to_total_input():
    usage = SimpleNamespace(
        input_tokens=100,
        cache_read_input_tokens=2000,
        cache_creation_input_tokens=300,
        output_tokens=50,
    )
    tokens = anthropic_usage(usage)
    assert tokens.input_tokens == 2400
    assert (tokens.cached_input_tokens, tokens.cache_write_tokens) == (2000, 300)


def test_record_rejects_content_fields_and_bad_tokens():
    with pytest.raises(ValueError):
        _record(prompt="bật đèn phòng khách")
    with pytest.raises(ValueError):
        _record(cached_input_tokens=5000)


async def test_reporter_disabled_without_token():
    calls = []
    transport = httpx.MockTransport(lambda request: calls.append(request) or httpx.Response(201))
    async with httpx.AsyncClient(transport=transport) as client:
        reporter = UsageReporter(Settings(_env_file=None), client)
        assert reporter.enabled is False
        assert await reporter.send([_record()]) is False
    assert calls == []


async def test_reporter_posts_records_with_bearer_token():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(201, json={"accepted": 1})

    settings = Settings(
        _env_file=None,
        BACKEND_URL="http://backend:5000/",
        BACKEND_SERVICE_TOKEN=TOKEN,
        OPENAI_API_KEY="sk-test-not-real",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UsageReporter(settings, client).send([_record()]) is True

    assert seen["url"] == "http://backend:5000/api/service/ai-usage"
    assert seen["auth"] == f"Bearer {TOKEN}"
    record = seen["body"]["records"][0]
    assert record["model"] == "gpt-5-mini" and record["input_tokens"] == 1200
    # Không gửi key LLM, không có trường nội dung
    assert "sk-test" not in json.dumps(seen["body"])
    assert not {"prompt", "messages", "text", "content"} & record.keys()


async def test_reporter_swallows_network_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    settings = Settings(_env_file=None, BACKEND_SERVICE_TOKEN=TOKEN)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UsageReporter(settings, client).send([_record()]) is False


class _Sink:
    def __init__(self) -> None:
        self.records: list[UsageRecord] = []

    def report(self, record: UsageRecord) -> None:
        self.records.append(record)


async def test_track_llm_call_records_success_with_usage():
    sink = _Sink()
    async with track_llm_call(
        sink,
        provider="openai",
        model="gpt-5-mini",
        purpose="planner",
        home_id=3,
        request_id="req-1",
    ) as call:
        call.set_usage(openai_usage({"prompt_tokens": 900, "completion_tokens": 120}))
    [record] = sink.records
    assert record.status == "success" and record.error_code is None
    assert (record.input_tokens, record.output_tokens, record.home_id) == (900, 120, 3)
    assert record.latency_ms >= 0


async def test_track_llm_call_records_timeout_and_reraises():
    sink = _Sink()
    with pytest.raises(TimeoutError):
        async with track_llm_call(sink, provider="openai", model="gpt-5-mini", purpose="clarify"):
            raise TimeoutError("quá thời gian")
    [record] = sink.records
    assert record.status == "timeout" and record.error_code == "TimeoutError"


async def test_track_llm_call_error_code_is_class_name_only():
    sink = _Sink()

    class RateLimitError(Exception):
        pass

    with pytest.raises(RateLimitError):
        async with track_llm_call(
            sink, provider="anthropic", model="claude-haiku-5-5", purpose="summary"
        ):
            raise RateLimitError("chi tiết có thể chứa nội dung người dùng")
    [record] = sink.records
    assert record.status == "error" and record.error_code == "RateLimitError"
    assert "nội dung" not in record.model_dump_json()
