"""Đồ giả dùng chung cho test: OpenAI giả, backend giả (httpx.MockTransport), runtime + client."""

import json
from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

import httpx
from fastapi.testclient import TestClient

from smarthome_agent.api.deps import get_runtime
from smarthome_agent.config import Settings
from smarthome_agent.conversation import ConversationStore
from smarthome_agent.main import create_app
from smarthome_agent.planner import Planner
from smarthome_agent.ratelimit import RateLimiter
from smarthome_agent.service import Runtime
from smarthome_agent.stt import OpenAiTranscriber

SERVICE_TOKEN = "s" * 40
USER_COOKIE = "user-cookie-value-123"
FAKE_KEY = "sk-test-not-real"


def make_context(**overrides: Any) -> dict[str, Any]:
    """Context backend (hợp đồng §2.2): nhà 3, người dùng 7, 1 phòng, vài thiết bị."""
    data: dict[str, Any] = {
        "home": {
            "id": 3,
            "timezone": "Asia/Ho_Chi_Minh",
            "local_now": "2026-11-14T19:10:05+07:00",
            "iso_weekday": 6,
            "status": "active",
        },
        "actor": {"user_id": 7, "home_role": "OWNER"},
        "rooms": [
            {"id": 5, "name": "Phòng khách", "climate": {"temperature": 29.4, "humidity": 70.1}}
        ],
        "devices": [
            {
                "id": 41,
                "name": "Đèn",
                "room_id": 5,
                "appliance": "lamp",
                "power": False,
                "level": None,
                "online": True,
                "can_control": True,
                "actions": ["turn_on", "turn_off"],
            },
            {
                "id": 42,
                "name": "Quạt",
                "room_id": 5,
                "appliance": "fan",
                "power": True,
                "level": None,
                "online": True,
                "can_control": True,
                "actions": ["turn_on", "turn_off"],
            },
            {
                "id": 44,
                "name": "Điều hoà",
                "room_id": 5,
                "appliance": "ac",
                "power": False,
                "level": 26,
                "online": True,
                "can_control": True,
                "actions": ["turn_on", "turn_off", "set_temp"],
            },
            {
                "id": 45,
                "name": "Rèm",
                "room_id": 5,
                "appliance": "curtain",
                "power": False,
                "level": 0,
                "online": True,
                "can_control": False,
                "actions": [],
            },
        ],
    }
    data.update(overrides)
    return data


# ---------- OpenAI giả ----------


def tool_call(name: str, args: dict[str, Any] | str) -> SimpleNamespace:
    arguments = args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)
    return SimpleNamespace(type="function_call", name=name, arguments=arguments, call_id="c1")


def text_item(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="message", content=[SimpleNamespace(type="output_text", text=text)])


def response(*items: SimpleNamespace) -> SimpleNamespace:
    usage = SimpleNamespace(input_tokens=100, output_tokens=20)
    return SimpleNamespace(output=list(items), usage=usage)


def step(
    device_ref: str,
    action: str = "turn_on",
    *,
    when: dict[str, Any] | None = None,
    evidence: str = "bật đèn",
    temperature: int | None = None,
    position: int | None = None,
) -> dict[str, Any]:
    return {
        "device_ref": device_ref,
        "action": action,
        "temperature": temperature,
        "position": position,
        "when": when or {"kind": "now", "at": None, "day_offset": None, "after_minutes": None},
        "reason": "Theo yêu cầu",
        "evidence_span": evidence,
    }


def at(hhmm: str, day_offset: int | None = None) -> dict[str, Any]:
    return {"kind": "at", "at": hhmm, "day_offset": day_offset, "after_minutes": None}


def after(minutes: int) -> dict[str, Any]:
    return {"kind": "after", "at": None, "day_offset": None, "after_minutes": minutes}


def plan_args(*steps: dict[str, Any], summary: str = "Yêu cầu của bạn") -> dict[str, Any]:
    return {"summary": summary, "steps": list(steps)}


class FakeOpenAI:
    """Có `.responses.create` (kịch bản có sẵn) và `.audio.transcriptions.create`."""

    def __init__(self, *scripted: SimpleNamespace, transcript: str = "bật đèn") -> None:
        self._scripted = list(scripted)
        self.calls: list[dict[str, Any]] = []
        self.stt_calls: list[dict[str, Any]] = []
        self.events: list[str] = []
        self.transcript = transcript
        self.responses = SimpleNamespace(create=self._create)
        self.audio = SimpleNamespace(transcriptions=SimpleNamespace(create=self._transcribe))

    async def _create(self, **kwargs: Any) -> SimpleNamespace:
        self.events.append("llm")
        self.calls.append(kwargs)
        if not self._scripted:
            raise AssertionError("FakeOpenAI hết kịch bản")
        return self._scripted.pop(0)

    async def _transcribe(self, **kwargs: Any) -> SimpleNamespace:
        self.events.append("stt")
        self.stt_calls.append(kwargs)
        return SimpleNamespace(text=self.transcript)


class Sink:
    def __init__(self) -> None:
        self.records: list[Any] = []

    def report(self, record: Any) -> None:
        self.records.append(record)


# ---------- backend giả ----------


class FakeBackend:
    """Ghi lại request, trả lời theo đường dẫn. Ghi thứ tự gọi vào `events` (nếu có)."""

    def __init__(self, llm: FakeOpenAI | None = None) -> None:
        self.requests: list[httpx.Request] = []
        self.context: dict[str, Any] = make_context()
        self.context_status = 200
        self.context_code = "X"  # trường `error` trong body khi context_status != 200
        self.create_status = 201
        self.create_body: dict[str, Any] = {
            "request_id": None,
            "status": "completed",
            "scheduled": [],
            "pending": None,
            "rejected": [],
        }
        self.raise_error: Exception | None = None
        self._llm = llm

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self._llm is not None:
            self._llm.events.append("backend")
        if self.raise_error is not None:
            raise self.raise_error
        if request.url.path.endswith("/context"):
            if self.context_status != 200:
                return httpx.Response(self.context_status, json={"error": self.context_code})
            return httpx.Response(200, json=self.context)
        if request.url.path.endswith("/requests"):
            return httpx.Response(self.create_status, json=self.create_body)
        return httpx.Response(404)

    def creates(self) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.path.endswith("/requests")]


def make_settings(**env: Any) -> Settings:
    values: dict[str, Any] = {
        "OPENAI_API_KEY": FAKE_KEY,
        "BACKEND_SERVICE_TOKEN": SERVICE_TOKEN,
        "STT_PROVIDER": "openai",
        "BACKEND_URL": "http://backend:5000",
    }
    values.update(env)
    return Settings(_env_file=None, **values)


def make_runtime(
    llm: FakeOpenAI | None,
    backend: Callable[[httpx.Request], httpx.Response],
    settings: Settings | None = None,
    sink: Sink | None = None,
) -> Runtime:
    settings = settings or make_settings()
    sink = sink or Sink()
    http = httpx.AsyncClient(
        base_url="http://backend:5000", transport=httpx.MockTransport(backend), timeout=5
    )
    enabled = llm is not None and settings.llm_configured
    return Runtime(
        settings=settings,
        http=http,
        conversations=ConversationStore(),
        limiter=RateLimiter(settings.rate_limit_per_min, settings.daily_limit_per_home),
        sink=sink,
        llm=llm,
        stt=OpenAiTranscriber(llm, settings, sink)
        if enabled and settings.stt_provider == "openai"
        else None,
        planner=Planner(llm, settings, sink) if enabled else None,
    )


def make_client(runtime: Runtime) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_runtime] = lambda: runtime
    return TestClient(app)


def portal_headers(**extra: str) -> dict[str, str]:
    """Header của trình duyệt đã đăng nhập: cookie sh_user + một cookie khác (không được chuyển)."""
    return {"X-Portal": "user", "Cookie": f"sh_user={USER_COOKIE}; other=evil", **extra}


def post_text(
    client: TestClient,
    text: str = "bật đèn",
    home_id: int = 3,
    *,
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
):
    return client.post(
        f"/v1/homes/{home_id}/messages",
        json={"text": text, **(body or {})},
        headers=portal_headers() if headers is None else headers,
    )
