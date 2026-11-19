import json
import logging

import httpx
import pytest
from pydantic import SecretStr

from helpers import SERVICE_TOKEN, USER_COOKIE, make_context
from smarthome_agent.clients.backend import BackendClient, Credential
from smarthome_agent.errors import AgentError


def client_for(handler, credential=None, token=SERVICE_TOKEN):
    http = httpx.AsyncClient(base_url="http://backend:5000", transport=httpx.MockTransport(handler))
    credential = credential or Credential("cookie", SecretStr(USER_COOKIE))
    return BackendClient(http, SecretStr(token), credential)


async def test_get_context_sends_service_token_and_forwards_cookie_only():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = dict(request.headers)
        seen["url"] = str(request.url)
        return httpx.Response(200, json=make_context())

    context = await client_for(handler).get_context(3)
    assert seen["url"] == "http://backend:5000/api/service/agent/homes/3/context"
    assert seen["headers"]["authorization"] == f"Bearer {SERVICE_TOKEN}"
    assert seen["headers"]["cookie"] == f"sh_user={USER_COOKIE}"
    assert "x-user-authorization" not in seen["headers"]
    assert context.home.id == 3 and context.actor.home_role == "OWNER"
    assert context.devices[0].actions == ["turn_on", "turn_off"]


async def test_bearer_credential_uses_x_user_authorization():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = dict(request.headers)
        return httpx.Response(200, json=make_context())

    await client_for(handler, Credential("bearer", SecretStr("jwt-xyz"))).get_context(3)
    assert seen["headers"]["x-user-authorization"] == "Bearer jwt-xyz"
    assert "cookie" not in seen["headers"]


async def test_create_request_posts_json_and_parses_result():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            201,
            json={
                "request_id": 15,
                "status": "pending",
                "scheduled": [{"id": 1}],
                "pending": {"steps": [{"index": 0}]},
                "rejected": [{"index": 2, "code": "NOT_CONTROLLABLE"}],
            },
        )

    result = await client_for(handler).create_request(3, {"summary": "x", "steps": []})
    assert seen["path"] == "/api/service/agent/homes/3/requests"
    assert seen["body"] == {"summary": "x", "steps": []}
    assert result.request_id == 15 and result.rejected[0].code == "NOT_CONTROLLABLE"
    assert result.pending == {"steps": [{"index": 0}]}


async def test_cookies_set_by_backend_are_not_reused():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.headers.get("cookie"))
        return httpx.Response(200, json=make_context(), headers={"Set-Cookie": "leak=1; Path=/"})

    http = httpx.AsyncClient(base_url="http://backend:5000", transport=httpx.MockTransport(handler))
    client = BackendClient(http, SecretStr(SERVICE_TOKEN), Credential("bearer", SecretStr("jwt")))
    await client.get_context(3)
    await client.get_context(3)
    assert calls == [None, None]


@pytest.mark.parametrize(
    ("status", "body", "code", "http_status"),
    [
        # Phiên người dùng sai → web đăng xuất
        (401, {"error": "NO_TOKEN"}, "SESSION_EXPIRED", 401),
        (401, {"error": "INVALID_TOKEN"}, "SESSION_EXPIRED", 401),
        (401, {"error": "TOKEN_EXPIRED"}, "SESSION_EXPIRED", 401),
        # Sai token dịch vụ / kênh tắt → lỗi vận hành, TUYỆT ĐỐI không phải 401
        (401, {"error": "INVALID_SERVICE_TOKEN"}, "AGENT_UNAVAILABLE", 503),
        (503, {"error": "SERVICE_CHANNEL_DISABLED"}, "AGENT_UNAVAILABLE", 503),
        # Body không đọc được / mã lạ → 503 an toàn
        (401, None, "AGENT_UNAVAILABLE", 503),
        (401, {"error": "MA_LA"}, "AGENT_UNAVAILABLE", 503),
        (401, {"khong_co_error": 1}, "AGENT_UNAVAILABLE", 503),
        (403, None, "AGENT_UNAVAILABLE", 503),
        # 403
        (403, {"error": "ACCOUNT_LOCKED"}, "ACCOUNT_LOCKED", 403),
        (403, {"error": "FORBIDDEN"}, "FORBIDDEN", 403),
        (403, {"error": "USE_DASHBOARD"}, "FORBIDDEN", 403),
        (404, None, "HOME_NOT_FOUND", 404),
        (502, None, "AGENT_UNAVAILABLE", 503),
    ],
)
async def test_status_mapping(status, body, code, http_status):
    def handler(request):
        if body is None:
            return httpx.Response(status, text="<html>")
        return httpx.Response(status, json=body)

    with pytest.raises(AgentError) as info:
        await client_for(handler).get_context(3)
    assert (info.value.code, info.value.status_code) == (code, http_status)
    assert info.value.message


async def test_invalid_service_token_logs_code_without_token(caplog):
    caplog.set_level(logging.DEBUG)
    client = client_for(lambda r: httpx.Response(401, json={"error": "INVALID_SERVICE_TOKEN"}))
    with pytest.raises(AgentError):
        await client.get_context(3)
    assert "INVALID_SERVICE_TOKEN" in caplog.text
    assert SERVICE_TOKEN not in caplog.text and USER_COOKIE not in caplog.text


async def test_account_locked_message_is_vietnamese():
    client = client_for(lambda r: httpx.Response(403, json={"error": "ACCOUNT_LOCKED"}))
    with pytest.raises(AgentError) as info:
        await client.get_context(3)
    assert info.value.message == "Tài khoản của bạn đang bị khoá. Hãy liên hệ bộ phận hỗ trợ."


async def test_invalid_json_and_shape_are_unavailable():
    for response in (httpx.Response(200, text="<html>"), httpx.Response(200, json={"home": 1})):
        client = client_for(lambda request, r=response: r)
        with pytest.raises(AgentError) as info:
            await client.get_context(3)
        assert info.value.code == "AGENT_UNAVAILABLE"


async def test_empty_service_token_is_unavailable_and_sends_nothing():
    calls = []
    client = client_for(lambda request: calls.append(request) or httpx.Response(200), token="")
    with pytest.raises(AgentError) as info:
        await client.get_context(3)
    assert info.value.code == "AGENT_UNAVAILABLE" and calls == []


async def test_errors_and_logs_do_not_leak_secrets(caplog):
    caplog.set_level(logging.DEBUG)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"không kết nối được {request.url}", request=request)

    credential = Credential("cookie", SecretStr(USER_COOKIE))
    client = client_for(handler, credential)
    with pytest.raises(AgentError) as info:
        await client.get_context(3)

    exception = info.value
    assert exception.__cause__ is None
    rendered = " ".join([str(exception), repr(exception), exception.message, caplog.text])
    assert USER_COOKIE not in rendered and SERVICE_TOKEN not in rendered
    assert USER_COOKIE not in repr(credential)
