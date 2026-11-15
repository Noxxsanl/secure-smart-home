import asyncio
import json
import logging
import re

import httpx
import pytest

from helpers import (
    FAKE_KEY,
    SERVICE_TOKEN,
    USER_COOKIE,
    FakeBackend,
    FakeOpenAI,
    Sink,
    after,
    at,
    make_client,
    make_context,
    make_runtime,
    make_settings,
    plan_args,
    portal_headers,
    post_text,
    response,
    step,
    text_item,
    tool_call,
)

UTTERANCE = "8h tối bật đèn, tắt quạt sau 30p nữa"


def two_step_plan():
    return plan_args(
        step("d1", "turn_on", when=at("20:00"), evidence="8h tối bật đèn"),
        step("d2", "turn_off", when=after(30), evidence="tắt quạt sau 30p nữa"),
        summary="Bật đèn 20:00, tắt quạt sau 30 phút",
    )


def schedule_dto(sid, run_at, label):
    return {
        "id": sid,
        "timezone": "Asia/Ho_Chi_Minh",
        "action_label": label,
        "run_at": run_at,
        "status": "scheduled",
        "origin": "ai_agent",
    }


def setup(*scripted, transcript="bật đèn", settings=None):
    llm = FakeOpenAI(*scripted, transcript=transcript)
    backend = FakeBackend(llm)
    sink = Sink()
    runtime = make_runtime(llm, backend, settings, sink)
    return llm, backend, make_client(runtime), sink


def voice(client, body=b"\x1aE\xdf\xa3audio", content_type="audio/webm;codecs=opus", **kwargs):
    headers = portal_headers(**{"Content-Type": content_type})
    headers.update(kwargs.pop("headers", {}))
    return client.post("/v1/homes/3/voice", content=body, headers=headers, **kwargs)


# ---------- xác thực / CSRF ----------


def test_no_credential_is_401():
    _, backend, client, _ = setup()
    res = client.post("/v1/homes/3/messages", json={"text": "bật đèn"})
    assert res.status_code == 401
    assert res.json() == {"error": "NO_TOKEN", "message": "Bạn cần đăng nhập để dùng trợ lý."}
    assert backend.requests == []


def test_cookie_without_x_portal_is_403():
    _, backend, client, _ = setup()
    res = post_text(client, headers={"Cookie": f"sh_user={USER_COOKIE}"})
    assert res.status_code == 403 and res.json()["error"] == "CSRF_CHECK_FAILED"
    res = post_text(client, headers={"Cookie": f"sh_user={USER_COOKIE}", "X-Portal": "admin"})
    assert res.status_code == 403
    assert backend.requests == []


def test_bearer_does_not_need_x_portal_and_is_forwarded_as_user_authorization():
    _, backend, client, _ = setup(response(text_item("Đèn đang tắt.")))
    res = post_text(client, headers={"Authorization": "Bearer jwt-abc.def"})
    assert res.status_code == 200
    [context_request] = backend.requests
    assert context_request.headers["x-user-authorization"] == "Bearer jwt-abc.def"
    assert context_request.headers["authorization"] == f"Bearer {SERVICE_TOKEN}"
    assert "cookie" not in context_request.headers


def test_only_sh_user_cookie_is_forwarded_to_backend():
    _, backend, client, _ = setup(response(text_item("ok")))
    assert post_text(client).status_code == 200
    [context_request] = backend.requests
    assert context_request.headers["cookie"] == f"sh_user={USER_COOKIE}"
    assert context_request.headers["authorization"] == f"Bearer {SERVICE_TOKEN}"
    assert context_request.url.path == "/api/service/agent/homes/3/context"


def test_invalid_body_is_400_without_echoing_input():
    _, _, client, _ = setup()
    res = post_text(client, text="")
    assert res.status_code == 400 and res.json()["error"] == "INVALID_INPUT"
    res = post_text(client, text="x" * 501)
    assert res.status_code == 400 and "xxxx" not in res.text


# ---------- luồng text ----------


def test_text_flow_scheduled():
    llm, backend, client, _ = setup(response(tool_call("propose_plan", two_step_plan())))
    backend.create_body = {
        "request_id": 15,
        "status": "completed",
        "scheduled": [
            schedule_dto(1, "2026-11-14T13:00:00.000Z", "Bật đèn"),  # 20:00 giờ nhà
            schedule_dto(2, "2026-11-14T12:40:00.000Z", "Tắt quạt"),  # 19:40
        ],
        "pending": None,
        "rejected": [],
    }
    res = post_text(client, UTTERANCE)
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "scheduled" and len(data["conversation_id"]) == 32
    assert data["reply"].startswith("Đã hẹn: 20:00 bật đèn · 19:40 tắt quạt.")
    assert data["transcript"] is None and data["pending"] is None and data["clarification"] is None
    assert [s["id"] for s in data["scheduled"]] == [1, 2]

    [create] = backend.creates()
    assert create.url.path == "/api/service/agent/homes/3/requests"
    body = json.loads(create.content)
    assert body["input_kind"] == "text" and body["utterance"] == UTTERANCE
    assert body["summary"] == "Bật đèn 20:00, tắt quạt sau 30 phút"
    assert body["steps"][0]["device_id"] == 41 and body["steps"][1]["device_id"] == 42
    assert body["steps"][0]["when"] == {"at": "20:00", "day_offset": None}
    assert body["steps"][1]["when"] == {"after_minutes": 30}
    assert create.headers["cookie"] == f"sh_user={USER_COOKIE}"


def test_text_flow_confirm():
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan_args(step("d1")))))
    pending = {
        "request_id": 16,
        "request_hash": "a" * 64,
        "expires_at": "2026-11-14T12:15:00.000Z",
        "steps": [
            {
                "index": 0,
                "device_id": 41,
                "device_name": "Đèn",
                "room_name": "Phòng khách",
                "action_label": "Bật Đèn",
                "run_at": None,
                "reason": "Theo yêu cầu",
            }
        ],
    }
    backend.create_body = {
        "request_id": 16,
        "status": "pending",
        "scheduled": [],
        "pending": pending,
        "rejected": [],
    }
    data = post_text(client, "bật đèn").json()
    assert data["type"] == "confirm"
    assert data["pending"] == pending
    assert data["reply"] == "Bạn xác nhận giúp mình: Bật Đèn (ngay bây giờ)."
    assert data["scheduled"] == []


def test_text_flow_mixed():
    plan = plan_args(
        step("d1", evidence="bật đèn ngay"),
        step("d2", "turn_off", when=after(30), evidence="30p nữa tắt"),
    )
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan)))
    backend.create_body = {
        "request_id": 17,
        "status": "pending",
        "scheduled": [schedule_dto(3, "2026-11-14T12:40:00Z", "Tắt quạt")],
        "pending": {
            "request_id": 17,
            "request_hash": "b" * 64,
            "expires_at": "2026-11-14T12:15:00Z",
            "steps": [{"index": 0, "action_label": "Bật Đèn", "run_at": None}],
        },
        "rejected": [],
    }
    data = post_text(client, "bật đèn ngay, 30p nữa tắt quạt").json()
    assert data["type"] == "mixed"
    assert data["reply"].startswith("Đã hẹn: 19:40 tắt quạt.")
    assert "Việc còn lại cần bạn xác nhận: Bật Đèn" in data["reply"]
    assert data["pending"]["request_id"] == 17 and len(data["scheduled"]) == 1


def test_tomorrow_label_in_reply():
    plan = plan_args(step("d1", when=at("07:00", 1), evidence="sáng mai 7h"))
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan)))
    # 2026-11-15T00:00Z = 07:00 ngày mai theo giờ nhà (local_now là 14/11 19:10 +07:00)
    backend.create_body["scheduled"] = [schedule_dto(5, "2026-11-15T00:00:00Z", "Bật đèn")]
    data = post_text(client, "sáng mai 7h bật đèn").json()
    assert data["reply"].startswith("Đã hẹn: 07:00 ngày mai bật đèn.")


def test_clarify_does_not_call_backend_create():
    args = {"question": "8 giờ sáng hay tối?", "options": ["8:00 sáng", "20:00 tối"]}
    _, backend, client, _ = setup(response(tool_call("ask_clarification", args)))
    data = post_text(client, "8h bật đèn").json()
    assert data["type"] == "clarify" and data["reply"] == args["question"]
    assert data["clarification"] == args
    assert backend.creates() == []


def test_answer_and_refuse_do_not_call_backend_create():
    _, backend, client, _ = setup(
        response(text_item("Phòng khách đang 29,4°C.")),
        response(text_item("[TU_CHOI] Bạn chưa có quyền điều khiển nhé.")),
    )
    answer = post_text(client, "phòng khách bao nhiêu độ?").json()
    assert (answer["type"], answer["reply"]) == ("answer", "Phòng khách đang 29,4°C.")
    refuse = post_text(client, "bật đèn").json()
    assert refuse["type"] == "refuse" and refuse["reply"] == "Bạn chưa có quyền điều khiển nhé."
    assert backend.creates() == []


def test_everything_rejected_by_guard_is_refuse_without_backend_create():
    plan = plan_args(step("d9"), step("d4", "turn_on"))
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan)))
    data = post_text(client, "bật đèn").json()
    assert data["type"] == "refuse"
    assert [r["code"] for r in data["rejected"]] == ["UNKNOWN_DEVICE", "CANNOT_CONTROL"]
    assert all(r["message"] for r in data["rejected"])
    assert backend.creates() == []


def test_backend_rejections_are_mapped_back_to_plan_indexes():
    plan = plan_args(
        step("d9"),  # guard loại (plan index 0)
        step("d1", evidence="bật đèn"),  # gửi backend index 0
        step("d2", "turn_off", evidence="tắt quạt"),  # gửi backend index 1
    )
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan)))
    backend.create_body = {
        "request_id": 20,
        "status": "pending",
        "scheduled": [],
        "pending": {
            "request_id": 20,
            "request_hash": "c" * 64,
            "expires_at": "x",
            "steps": [{"index": 0, "action_label": "Bật Đèn", "run_at": None}],
        },
        "rejected": [{"index": 1, "code": "NOT_CONTROLLABLE"}],
    }
    data = post_text(client, "bật đèn tắt quạt").json()
    assert [r["index"] for r in data["rejected"]] == [0, 2]
    assert data["rejected"][1]["code"] == "NOT_CONTROLLABLE"
    assert "Quạt" in data["rejected"][1]["message"]
    assert len(json.loads(backend.creates()[0].content)["steps"]) == 2


def test_backend_rejects_all_steps_is_refuse():
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan_args(step("d1")))))
    backend.create_body = {
        "request_id": None,
        "status": "completed",
        "scheduled": [],
        "pending": None,
        "rejected": [{"index": 0, "code": "HOME_SUSPENDED"}],
    }
    data = post_text(client, "bật đèn").json()
    assert data["type"] == "refuse" and data["rejected"][0]["code"] == "HOME_SUSPENDED"


# ---------- hội thoại ----------


def test_conversation_history_reaches_planner_and_is_bound_to_user():
    args = {"question": "Sáng hay tối?", "options": ["sáng", "tối"]}
    llm, backend, client, _ = setup(
        response(tool_call("ask_clarification", args)),
        response(text_item("ok")),
        response(text_item("ok")),
    )
    first = post_text(client, "8h bật đèn").json()
    second = post_text(client, "tối", body={"conversation_id": first["conversation_id"]}).json()
    assert second["conversation_id"] == first["conversation_id"]
    history_roles = [i["role"] for i in llm.calls[1]["input"]]
    assert history_roles == ["user", "user", "assistant", "user"]
    assert llm.calls[1]["input"][1]["content"] == "8h bật đèn"

    # Người khác dùng cùng conversation_id → hội thoại mới, không thấy lịch sử
    backend.context = make_context(actor={"user_id": 99, "home_role": "OWNER"})
    third = post_text(client, "tối", body={"conversation_id": first["conversation_id"]}).json()
    assert third["conversation_id"] != first["conversation_id"]
    assert [i["role"] for i in llm.calls[2]["input"]] == ["user", "user"]


def test_unknown_conversation_id_opens_new_one():
    _, _, client, _ = setup(response(text_item("ok")))
    data = post_text(client, body={"conversation_id": "khong-ton-tai"}).json()
    assert len(data["conversation_id"]) == 32


# ---------- lỗi backend / cấu hình ----------


@pytest.mark.parametrize(
    ("status", "backend_code", "code", "http"),
    [
        (401, "NO_TOKEN", "SESSION_EXPIRED", 401),
        (401, "INVALID_SERVICE_TOKEN", "AGENT_UNAVAILABLE", 503),
        (503, "SERVICE_CHANNEL_DISABLED", "AGENT_UNAVAILABLE", 503),
        (404, "X", "HOME_NOT_FOUND", 404),
        (500, "X", "AGENT_UNAVAILABLE", 503),
        (403, "ACCOUNT_LOCKED", "ACCOUNT_LOCKED", 403),
        (403, "FORBIDDEN", "FORBIDDEN", 403),
    ],
)
def test_backend_error_mapping(status, backend_code, code, http):
    llm, backend, client, _ = setup()
    backend.context_status = status
    backend.context_code = backend_code
    res = post_text(client)
    assert res.status_code == http and res.json()["error"] == code
    assert res.json()["message"]
    assert llm.calls == []  # chưa tốn tiền LLM


def test_backend_unreachable_is_503():
    _, backend, client, _ = setup()
    backend.raise_error = httpx.ConnectTimeout("hết giờ")
    res = post_text(client)
    assert res.status_code == 503 and res.json()["error"] == "AGENT_UNAVAILABLE"
    assert "Trợ lý đang tạm bận" in res.json()["message"]


def test_missing_service_token_is_503():
    settings = make_settings(BACKEND_SERVICE_TOKEN="")
    _, backend, client, _ = setup(settings=settings)
    res = post_text(client)
    assert res.status_code == 503 and res.json()["error"] == "AGENT_UNAVAILABLE"
    assert backend.requests == []


def test_llm_disabled_without_key():
    settings = make_settings(OPENAI_API_KEY="")
    backend = FakeBackend()
    client = make_client(make_runtime(None, backend, settings))
    res = post_text(client)
    assert res.status_code == 503 and res.json()["error"] == "LLM_DISABLED"
    assert backend.requests == []


def test_openai_failure_is_503_without_leaking_details():
    llm, _, client, _ = setup()

    async def boom(**_):
        raise TimeoutError(f"chi tiết nội bộ {FAKE_KEY}")

    llm.responses.create = boom
    res = post_text(client)
    assert res.status_code == 503 and FAKE_KEY not in res.text


# ---------- giới hạn ----------


def test_per_minute_rate_limit_is_429():
    _, _, client, _ = setup(
        *[response(text_item("ok")) for _ in range(3)],
        settings=make_settings(AGENT_RATE_LIMIT_PER_MIN=2),
    )
    assert post_text(client).status_code == 200
    assert post_text(client).status_code == 200
    res = post_text(client)
    assert res.status_code == 429 and res.json()["error"] == "RATE_LIMITED"
    assert int(res.headers["retry-after"]) >= 1


def test_rate_limit_per_credential_blocks_before_calling_backend():
    settings = make_settings(AGENT_RATE_LIMIT_PER_MIN=1)
    _, backend, client, _ = setup(response(text_item("ok")), settings=settings)
    assert post_text(client).status_code == 200
    calls = len(backend.requests)
    assert post_text(client).status_code == 429
    assert len(backend.requests) == calls  # bucket credential chặn trước khi gọi backend


def test_rate_limit_is_also_per_user_id_so_relogin_does_not_bypass():
    settings = make_settings(AGENT_RATE_LIMIT_PER_MIN=1)
    llm, _, client, _ = setup(
        response(text_item("ok")), response(text_item("ok")), settings=settings
    )
    assert post_text(client).status_code == 200
    # Credential khác (đăng nhập lại) nhưng backend vẫn trả cùng user_id 7 → vẫn bị chặn.
    relogin = post_text(client, headers={"X-Portal": "user", "Cookie": "sh_user=new-session"})
    assert relogin.status_code == 429 and relogin.json()["error"] == "RATE_LIMITED"
    assert len(llm.calls) == 1


def test_daily_limit_per_home_is_429():
    settings = make_settings(AGENT_DAILY_LIMIT_PER_HOME=1)
    _, _, client, _ = setup(response(text_item("ok")), settings=settings)
    assert post_text(client).status_code == 200
    res = post_text(client)
    assert res.status_code == 429 and res.json()["error"] == "RATE_LIMITED"


# ---------- thời hạn tổng / giới hạn body ----------


def test_request_deadline_stops_slow_planner_without_creating_request():
    settings = make_settings()
    settings.request_timeout_s = 0.3  # hợp lệ qua env phải ≥ 10; test hạ trực tiếp cho nhanh
    llm, backend, client, _ = setup(settings=settings)

    async def slow(**_):
        await asyncio.sleep(5)

    llm.responses.create = slow
    res = post_text(client)
    assert res.status_code == 503 and res.json()["error"] == "AGENT_UNAVAILABLE"
    assert backend.creates() == []


def test_too_little_time_left_skips_create_request():
    settings = make_settings()
    settings.request_timeout_s = 4  # < 5 s còn lại khi tới bước tạo yêu cầu
    llm, backend, client, _ = setup(
        response(tool_call("propose_plan", plan_args(step("d1")))), settings=settings
    )
    res = post_text(client)
    assert res.status_code == 503 and res.json()["error"] == "AGENT_UNAVAILABLE"
    assert len(llm.calls) == 1  # planner đã chạy, nhưng KHÔNG tạo yêu cầu
    assert backend.creates() == []


def test_request_timeout_setting_has_default_40_and_minimum_10():
    assert make_settings().request_timeout_s == 40
    with pytest.raises(ValueError):
        make_settings(AGENT_REQUEST_TIMEOUT_S=5)


def test_message_body_over_16kb_is_413_by_content_length():
    _, backend, client, _ = setup()
    res = post_text(client, body={"padding": "x" * 17_000})
    assert res.status_code == 413 and res.json()["error"] == "MESSAGE_TOO_LARGE"
    assert res.json()["message"] and "xxxx" not in res.text
    assert backend.requests == []


def test_message_body_over_16kb_is_413_when_streamed_without_content_length():
    _, backend, client, _ = setup()

    def chunks():
        for _ in range(17):
            yield b" " * 1024

    res = client.post("/v1/homes/3/messages", content=chunks(), headers=portal_headers())
    assert res.status_code == 413 and res.json()["error"] == "MESSAGE_TOO_LARGE"
    assert backend.requests == []


def test_message_body_just_under_limit_still_parsed():
    _, _, client, _ = setup(response(text_item("ok")))
    res = post_text(client, body={"padding": "x" * 15_000})
    assert res.status_code == 200


def test_malformed_json_message_is_400():
    _, backend, client, _ = setup()
    res = client.post("/v1/homes/3/messages", content=b"{khong phai json", headers=portal_headers())
    assert res.status_code == 400 and res.json()["error"] == "INVALID_INPUT"
    assert backend.requests == []


# ---------- voice ----------


def test_voice_unsupported_type_is_415():
    _, backend, client, _ = setup()
    res = voice(client, content_type="application/octet-stream")
    assert res.status_code == 415 and res.json()["error"] == "UNSUPPORTED_AUDIO"
    assert backend.requests == []


def test_voice_empty_is_400():
    _, _, client, _ = setup()
    res = voice(client, body=b"")
    assert res.status_code == 400 and res.json()["error"] == "EMPTY_AUDIO"


def test_voice_too_large_is_413():
    _, backend, client, _ = setup(response(text_item("ok")))
    res = voice(client, body=b"x" * (1_048_576 + 1))
    assert res.status_code == 413 and res.json()["error"] == "AUDIO_TOO_LARGE"
    assert backend.requests == []
    assert voice(client, body=b"x" * 1_048_576).status_code != 413


def test_voice_requires_credential_and_csrf_header():
    _, _, client, _ = setup()
    res = client.post("/v1/homes/3/voice", content=b"abc", headers={"Content-Type": "audio/webm"})
    assert res.status_code == 401
    res = client.post(
        "/v1/homes/3/voice",
        content=b"abc",
        headers={"Content-Type": "audio/webm", "Cookie": f"sh_user={USER_COOKIE}"},
    )
    assert res.status_code == 403


def test_voice_flow_context_before_stt_then_planner():
    llm, backend, client, sink = setup(
        response(tool_call("propose_plan", plan_args(step("d1", evidence="bật đèn")))),
        transcript="bật đèn",
    )
    backend.create_body = {
        "request_id": 30,
        "status": "pending",
        "scheduled": [],
        "pending": {
            "request_id": 30,
            "request_hash": "d" * 64,
            "expires_at": "2026-11-14T12:15:00Z",
            "steps": [{"index": 0, "action_label": "Bật Đèn", "run_at": None}],
        },
        "rejected": [],
    }
    res = voice(client, headers={"X-Audio-Duration-Ms": "2500"}, params={"conversation_id": "zz"})
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "confirm" and data["transcript"] == "bật đèn"
    # backend xác thực người dùng + nhà TRƯỚC STT; STT trước planner; tạo request sau cùng
    assert llm.events == ["backend", "stt", "llm", "backend"]
    [stt_call] = llm.stt_calls
    assert stt_call["model"] == "gpt-4o-mini-transcribe" and stt_call["language"] == "vi"
    assert stt_call["file"][2] == "audio/webm"  # bỏ ;codecs=
    assert stt_call["file"][1] == b"\x1aE\xdf\xa3audio"
    assert "Phòng khách" in stt_call["prompt"] and "Đèn" in stt_call["prompt"]
    assert len(stt_call["prompt"]) <= 200
    assert json.loads(backend.creates()[0].content)["input_kind"] == "voice"
    stt_record = next(r for r in sink.records if r.purpose == "stt")
    assert stt_record.audio_seconds == 2.5 and stt_record.home_id == 3


def test_voice_audio_duration_is_clamped_to_30s():
    _, _, client, sink = setup(response(text_item("ok")))
    voice(client, headers={"X-Audio-Duration-Ms": "999999"})
    assert next(r for r in sink.records if r.purpose == "stt").audio_seconds == 30


def test_voice_stt_disabled_when_provider_none():
    settings = make_settings(STT_PROVIDER="none")
    _, backend, client, _ = setup(settings=settings)
    res = voice(client)
    assert res.status_code == 503 and res.json()["error"] == "STT_DISABLED"
    assert backend.requests == []


def test_voice_unknown_home_does_not_spend_stt():
    llm, backend, client, _ = setup()
    backend.context_status = 404
    res = voice(client)
    assert res.status_code == 404 and res.json()["error"] == "HOME_NOT_FOUND"
    assert llm.stt_calls == []


def test_voice_blank_transcript_asks_to_repeat():
    llm, _, client, _ = setup(transcript="  ")
    data = voice(client).json()
    assert data["type"] == "clarify" and data["transcript"] == ""
    assert "nói lại" in data["reply"] and llm.calls == []


# ---------- không lộ dữ liệu ----------


def test_nothing_sensitive_is_logged(caplog):
    caplog.set_level(logging.DEBUG)
    llm, backend, client, _ = setup(
        response(tool_call("propose_plan", plan_args(step("d1", evidence="bật đèn bí mật")))),
        response(tool_call("propose_plan", "{hỏng")),
    )
    backend.create_body["rejected"] = [{"index": 0, "code": "NOT_FOUND"}]
    post_text(client, "bật đèn bí mật")
    backend.raise_error = httpx.ConnectError("down")
    post_text(client, "câu nói riêng tư thứ hai")
    for secret in (USER_COOKIE, SERVICE_TOKEN, FAKE_KEY, "bí mật", "riêng tư"):
        assert secret not in caplog.text


def test_health_reports_status_without_secrets():
    _, _, client, _ = setup()
    res = client.get("/health")
    assert res.status_code == 200
    assert set(res.json()) == {"status", "llm_configured", "stt_ready", "backend_configured"}
    assert FAKE_KEY not in res.text and SERVICE_TOKEN not in res.text


# ---------- lệnh rõ → làm luôn (executed) ----------


def executed_dto(sid, label, status="done", error_code=None):
    return {
        "id": sid,
        "timezone": "Asia/Ho_Chi_Minh",
        "action_label": label,
        "run_at": "2026-11-14T12:10:05Z",
        "status": status,
        "error_code": error_code,
        "origin": "ai_agent",
    }


def test_text_flow_executed_is_done_and_returned_to_web():
    plan = plan_args(step("d1", evidence="bật đèn"), step("d2", "turn_off", evidence="tắt quạt"))
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan)))
    backend.create_body = {
        "request_id": 40,
        "status": "completed",
        "executed": [executed_dto(1, "Bật đèn"), executed_dto(2, "Tắt quạt")],
        "scheduled": [],
        "pending": None,
        "rejected": [],
    }
    data = post_text(client, "bật đèn tắt quạt").json()
    assert data["type"] == "done" and data["reply"] == "Đã bật đèn và tắt quạt."
    assert [e["id"] for e in data["executed"]] == [1, 2]
    assert data["scheduled"] == [] and data["pending"] is None


def test_executed_failed_step_still_reports_without_refuse():
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan_args(step("d1")))))
    backend.create_body["executed"] = [executed_dto(1, "Bật đèn", "failed", "DEVICE_OFFLINE")]
    data = post_text(client, "bật đèn").json()
    assert data["type"] == "done"
    assert data["reply"] == "Chưa bật đèn được (thiết bị đang ngoại tuyến)."
    assert "DEVICE_OFFLINE" not in data["reply"]


def test_executed_with_pending_is_mixed():
    plan = plan_args(step("d1", evidence="bật đèn"), step("d2", "turn_off", evidence="quạt"))
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan)))
    backend.create_body = {
        "request_id": 41,
        "status": "pending",
        "executed": [executed_dto(1, "Bật đèn")],
        "scheduled": [],
        "pending": {
            "request_id": 41,
            "request_hash": "e" * 64,
            "expires_at": "2026-11-14T12:15:00Z",
            "steps": [{"index": 1, "action_label": "Tắt Quạt", "run_at": None}],
        },
        "rejected": [],
    }
    data = post_text(client, "bật đèn rồi tắt quạt").json()
    assert data["type"] == "mixed"
    assert data["reply"].startswith("Đã bật đèn. Việc còn lại cần bạn xác nhận: Tắt Quạt")
    assert len(data["executed"]) == 1 and data["pending"]["request_id"] == 41


def test_reply_json_always_has_executed_list_even_without_it():
    _, backend, client, _ = setup(response(text_item("Đèn đang tắt.")))
    assert post_text(client, "đèn đang bật hay tắt?").json()["executed"] == []
    # backend cũ không trả `executed` → vẫn mặc định []
    plan = plan_args(step("d1", when=at("20:00"), evidence="8h tối bật đèn"))
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan)))
    backend.create_body = {
        "request_id": 1,
        "status": "completed",
        "scheduled": [schedule_dto(1, "2026-11-14T13:00:00Z", "Bật đèn")],
        "pending": None,
        "rejected": [],
    }
    data = post_text(client, "8h tối bật đèn").json()
    assert data["type"] == "scheduled" and data["executed"] == []


def test_refuse_only_when_nothing_executed_scheduled_or_pending():
    # Chỉ có executed → KHÔNG refuse
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan_args(step("d1")))))
    backend.create_body = {
        "request_id": 42,
        "status": "completed",
        "executed": [executed_dto(1, "Bật đèn", "skipped")],
        "scheduled": [],
        "pending": None,
        "rejected": [],
    }
    assert post_text(client).json()["type"] == "done"
    # Không có gì cả (chỉ rejected) → refuse
    _, backend, client, _ = setup(response(tool_call("propose_plan", plan_args(step("d1")))))
    backend.create_body = {
        "request_id": None,
        "status": "completed",
        "executed": [],
        "scheduled": [],
        "pending": None,
        "rejected": [{"index": 0, "code": "FORBIDDEN"}],
    }
    data = post_text(client).json()
    assert data["type"] == "refuse" and data["executed"] == []


# ---------- STT từ chối bản ghi ----------


def _bad_request():
    import openai

    request = httpx.Request("POST", "https://api.openai.com/v1/audio/transcriptions")
    return openai.BadRequestError(
        "Audio file might be corrupted", response=httpx.Response(400, request=request), body=None
    )


def test_voice_stt_bad_request_asks_to_repeat_not_503(caplog):
    caplog.set_level(logging.INFO)
    llm, backend, client, _ = setup()

    async def reject(**_):
        raise _bad_request()

    llm.audio.transcriptions.create = reject
    res = voice(client)
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "clarify" and data["transcript"] == ""
    assert data["reply"] == "Mình chưa nghe rõ, bạn nói lại giúp mình nhé."
    assert llm.calls == [] and backend.creates() == []
    assert "STT từ chối bản ghi: BadRequestError" in caplog.text
    assert "corrupted" not in caplog.text


def test_voice_stt_other_openai_error_is_still_503():
    import openai

    llm, _, client, _ = setup()

    async def boom(**_):
        raise openai.APIConnectionError(request=httpx.Request("POST", "https://x"))

    llm.audio.transcriptions.create = boom
    res = voice(client)
    assert res.status_code == 503 and res.json()["error"] == "AGENT_UNAVAILABLE"


# ---------- log thời gian từng chặng ----------


def timing_lines(caplog):
    return [r for r in caplog.records if r.getMessage().startswith("Trợ lý ")]


def test_timing_line_for_voice_covers_all_stages_without_content(caplog):
    caplog.set_level(logging.INFO)
    _, backend, client, _ = setup(
        response(tool_call("propose_plan", plan_args(step("d1", evidence="bật đèn")))),
        transcript="bật đèn bí mật",
    )
    backend.create_body["executed"] = [executed_dto(1, "Bật đèn")]
    voice(client)
    [line] = timing_lines(caplog)
    text = line.getMessage()
    assert re.search(
        r"^Trợ lý [0-9a-f]{8}: kênh=voice context=\d+ms stt=\d+ms planner=\d+ms backend=\d+ms "
        r"tổng=\d+ms kết quả=done$",
        text,
    )
    assert "bí mật" not in caplog.text and "Đã bật" not in caplog.text


def test_timing_line_for_text_has_dash_for_stages_not_run(caplog):
    caplog.set_level(logging.INFO)
    _, _, client, _ = setup(response(text_item("Đèn đang tắt.")))
    post_text(client, "đèn đang tắt à?")
    [line] = timing_lines(caplog)
    text = line.getMessage()
    assert "kênh=text" in text and "stt=-" in text and "backend=-" in text
    assert re.search(r"planner=\d+ms", text) and text.endswith("kết quả=answer")


def test_timing_line_on_failure_names_stage_and_error_class(caplog):
    caplog.set_level(logging.INFO)
    llm, _, client, _ = setup()

    async def boom(**_):
        raise TimeoutError("chi tiết nội bộ")

    llm.responses.create = boom
    assert post_text(client).status_code == 503
    [line] = timing_lines(caplog)
    assert line.levelno == logging.WARNING
    assert line.getMessage().endswith("kết quả=AGENT_UNAVAILABLE (chặng planner: TimeoutError)")
    assert "chi tiết nội bộ" not in caplog.text
