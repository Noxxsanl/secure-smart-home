"""Dependency của API: xác thực credential người dùng (cookie `sh_user` hoặc Bearer) + runtime.

Agent không tự xác thực người dùng: credential được chuyển cho backend, backend kiểm JWT + RBAC
2 tầng (nhà không thuộc quyền → 404, sai role → 403 — bất biến số 6). Với cookie, POST bắt buộc
header `X-Portal: user` (chặn CSRF, giống kênh /api/portal của backend).
"""

import hashlib
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request
from pydantic import SecretStr

from ..clients.backend import Credential
from ..clients.backend.client import PORTAL_COOKIE
from ..errors import AgentError
from ..service import AgentService, Runtime, build_runtime


@lru_cache
def get_runtime() -> Runtime:
    return build_runtime()


def credential_key(credential: Credential) -> str:
    """Khoá giới hạn tốc độ: SHA-256 của credential — không lưu credential."""
    return hashlib.sha256(credential.secret.get_secret_value().encode()).hexdigest()


def require_credential(request: Request) -> Credential:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return Credential("bearer", SecretStr(token.strip()))

    cookie = request.cookies.get(PORTAL_COOKIE)
    if cookie:
        if request.method not in ("GET", "HEAD", "OPTIONS") and (
            request.headers.get("x-portal") != "user"
        ):
            raise AgentError(
                403,
                "CSRF_CHECK_FAILED",
                "Yêu cầu không hợp lệ. Bạn tải lại trang rồi thử lại nhé.",
            )
        return Credential("cookie", SecretStr(cookie))

    raise AgentError(401, "NO_TOKEN", "Bạn cần đăng nhập để dùng trợ lý.")


CredentialDep = Annotated[Credential, Depends(require_credential)]
RuntimeDep = Annotated[Runtime, Depends(get_runtime)]


def limited_service(credential: CredentialDep, runtime: RuntimeDep) -> AgentService:
    """Xác thực → tính rate limit theo người → trả service (thứ tự §3.1)."""
    runtime.limiter.hit_user(credential_key(credential))
    return AgentService(runtime, credential)


ServiceDep = Annotated[AgentService, Depends(limited_service)]
