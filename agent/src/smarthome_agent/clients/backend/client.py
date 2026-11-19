"""Client backend viết tay cho 2 endpoint kênh dịch vụ của module agent (hợp đồng §2.2–2.3).

Mỗi lời gọi mang 2 lớp xác thực:
- `Authorization: Bearer <BACKEND_SERVICE_TOKEN>` — chứng minh đây là agent;
- credential của người dùng, chuyển tiếp nguyên trạng: cookie `sh_user` → header
  `Cookie: sh_user=<giá trị>` (KHÔNG chuyển cookie khác), Bearer JWT → `X-User-Authorization`.

Không log header/credential; lỗi được đổi thành AgentError với câu cố định (từ None để không kéo
theo chuỗi exception gốc).
"""

import logging
from dataclasses import dataclass
from typing import Any, Literal

import httpx
from pydantic import SecretStr, ValidationError

from ...errors import AgentError, account_locked, forbidden, session_expired, unavailable
from .models import CreateRequestResult, HomeContext

logger = logging.getLogger(__name__)

PORTAL_COOKIE = "sh_user"
# Mã 401 của phiên người dùng (identity/domain/session-tokens.ts, guards/auth.guards.ts).
SESSION_ERROR_CODES = frozenset({"NO_TOKEN", "INVALID_TOKEN", "TOKEN_EXPIRED"})


@dataclass(frozen=True)
class Credential:
    """Credential của người dùng đang chat. SecretStr: không lọt vào repr/log."""

    kind: Literal["cookie", "bearer"]
    secret: SecretStr

    def forward_headers(self) -> dict[str, str]:
        value = self.secret.get_secret_value()
        if self.kind == "cookie":
            return {"Cookie": f"{PORTAL_COOKIE}={value}"}
        return {"X-User-Authorization": f"Bearer {value}"}


def _error_code(response: httpx.Response) -> str | None:
    """Mã lỗi (`error`) trong body JSON của backend; không đọc được → None."""
    try:
        body = response.json()
    except ValueError:
        return None
    code = body.get("error") if isinstance(body, dict) else None
    return code if isinstance(code, str) else None


def _map_auth_error(status: int, code: str | None) -> AgentError:
    """Đổi lỗi xác thực/quyền của backend thành lỗi cho web.

    Chỉ mã 401 của PHIÊN người dùng mới thành SESSION_EXPIRED (web đá về trang đăng nhập); sai
    token dịch vụ là lỗi cấu hình phía vận hành → 503, KHÔNG được làm người dùng bị đăng xuất.
    Body không đọc được / mã lạ → 503 (an toàn). Chỉ log mã lỗi, không log token.
    """
    if status == 401 and code in SESSION_ERROR_CODES:
        return session_expired()
    if status == 403 and code == "ACCOUNT_LOCKED":
        return account_locked()
    if status == 403 and code is not None:
        return forbidden()
    logger.warning("Backend từ chối agent: HTTP %s, mã %s", status, code)
    return unavailable()


class BackendClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        service_token: SecretStr,
        credential: Credential,
    ) -> None:
        self._http = http
        self._service_token = service_token
        self._credential = credential

    def _headers(self) -> dict[str, str]:
        token = self._service_token.get_secret_value()
        if not token:
            raise unavailable()
        return {"Authorization": f"Bearer {token}", **self._credential.forward_headers()}

    async def _request(self, method: str, path: str, json: Any | None = None) -> Any:
        try:
            response = await self._http.request(method, path, json=json, headers=self._headers())
        except httpx.HTTPError as exc:
            # Chỉ ghi tên lớp lỗi — không ghi URL/header.
            logger.warning("Gọi backend thất bại: %s", type(exc).__name__)
            raise unavailable() from None
        finally:
            # Client dùng chung nhiều người: không để cookie backend (nếu có) sót lại cho lượt sau.
            self._http.cookies.clear()
        status = response.status_code
        if status in (200, 201):
            try:
                return response.json()
            except ValueError:
                raise unavailable() from None
        if status in (401, 403, 503):
            raise _map_auth_error(status, _error_code(response))
        if status == 404:
            raise AgentError(
                404,
                "HOME_NOT_FOUND",
                "Mình không tìm thấy nhà này trong tài khoản của bạn.",
            )
        logger.warning("Backend trả HTTP %s cho %s", status, method)
        raise unavailable()

    async def get_context(self, home_id: int) -> HomeContext:
        data = await self._request("GET", f"/api/service/agent/homes/{home_id}/context")
        try:
            return HomeContext.model_validate(data)
        except ValidationError:
            logger.warning("Context backend sai cấu trúc")
            raise unavailable() from None

    async def create_request(self, home_id: int, payload: dict[str, Any]) -> CreateRequestResult:
        data = await self._request(
            "POST", f"/api/service/agent/homes/{home_id}/requests", json=payload
        )
        try:
            return CreateRequestResult.model_validate(data)
        except ValidationError:
            logger.warning("Kết quả tạo request sai cấu trúc")
            raise unavailable() from None


def build_http_client(base_url: str, timeout_s: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout_s)
