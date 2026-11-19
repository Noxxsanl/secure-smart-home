"""Gửi số liệu dùng LLM/STT về backend.

POST {BACKEND_URL}/api/service/ai-usage với header Bearer BACKEND_SERVICE_TOKEN.

Gửi nền, không chặn và không làm hỏng luồng trả lời người dùng: lỗi mạng chỉ ghi một dòng cảnh báo
(tên lỗi, không có token/nội dung). Chưa đặt BACKEND_SERVICE_TOKEN → tắt, không gửi gì.

Cách dùng trong planner (khi hiện thực):

    async with track_llm_call(get_usage_reporter(), provider="openai", model=settings.openai_model,
                              purpose="planner", home_id=home_id, request_id=request_id) as call:
        response = await client.responses.create(...)
        call.set_usage(openai_usage(response.usage))
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from functools import lru_cache
from typing import Protocol

import httpx

from ..config import Settings, get_settings
from .models import Purpose, TokenUsage, UsageRecord

logger = logging.getLogger(__name__)

INGEST_PATH = "/api/service/ai-usage"


class UsageSink(Protocol):
    def report(self, record: UsageRecord) -> None: ...


class UsageReporter:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client
        self._pending: set[asyncio.Task[bool]] = set()

    @property
    def enabled(self) -> bool:
        return self._settings.usage_reporting_enabled

    async def send(self, records: list[UsageRecord]) -> bool:
        """Gửi ngay (≤ 20 bản ghi). Trả True khi backend nhận; không ném lỗi."""
        if not self.enabled or not records:
            return False
        token = self._settings.backend_service_token.get_secret_value()
        url = self._settings.backend_url.rstrip("/") + INGEST_PATH
        body = {"records": [r.model_dump(mode="json", exclude_none=True) for r in records[:20]]}
        try:
            if self._client is not None:
                response = await self._client.post(
                    url, json=body, headers={"Authorization": f"Bearer {token}"}
                )
            else:
                async with httpx.AsyncClient(timeout=self._settings.backend_timeout_s) as client:
                    response = await client.post(
                        url, json=body, headers={"Authorization": f"Bearer {token}"}
                    )
        except httpx.HTTPError as exc:
            logger.warning("Không gửi được số liệu dùng AI: %s", type(exc).__name__)
            return False
        if response.status_code != 201:
            logger.warning("Backend từ chối số liệu dùng AI: HTTP %s", response.status_code)
            return False
        return True

    def report(self, record: UsageRecord) -> None:
        """Gửi nền một bản ghi (giữ tham chiếu task để không bị thu gom giữa chừng)."""
        if not self.enabled:
            return
        task = asyncio.get_running_loop().create_task(self.send([record]))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)


@lru_cache
def get_usage_reporter() -> UsageReporter:
    return UsageReporter(get_settings())


class LlmCall:
    """Kết quả của một lượt gọi đang đo; planner gọi set_usage() sau khi có response."""

    def __init__(self) -> None:
        self.usage = TokenUsage()
        self.audio_seconds: float | None = None
        self.ttft_ms: int | None = None

    def set_usage(self, usage: TokenUsage) -> None:
        self.usage = usage

    def set_audio_seconds(self, seconds: float) -> None:
        self.audio_seconds = max(0.0, seconds)

    def mark_first_token(self, started: float) -> None:
        """Gọi khi nhận token đầu tiên (stream), truyền `started` = time.perf_counter() lúc gửi."""
        if self.ttft_ms is None:
            self.ttft_ms = int((time.perf_counter() - started) * 1000)


@asynccontextmanager
async def track_llm_call(
    sink: UsageSink,
    *,
    provider: str,
    model: str,
    purpose: Purpose,
    home_id: int | None = None,
    user_id: int | None = None,
    request_id: str | None = None,
    round_index: int | None = None,
) -> AsyncIterator[LlmCall]:
    """Đo độ trễ + trạng thái của một lượt gọi LLM/STT rồi báo về backend (kể cả khi lỗi).

    Lỗi của lượt gọi vẫn được ném tiếp; chỉ tên lớp lỗi được ghi (error_code), không ghi thông điệp.
    """
    call = LlmCall()
    started_at = datetime.now(UTC)
    started = time.perf_counter()
    status = "success"
    error_code: str | None = None
    try:
        yield call
    except (TimeoutError, httpx.TimeoutException) as exc:
        status, error_code = "timeout", type(exc).__name__[:64]
        raise
    except Exception as exc:
        name = type(exc).__name__
        status = "timeout" if "Timeout" in name else "error"
        error_code = name[:64]
        raise
    finally:
        latency_ms = int((time.perf_counter() - started) * 1000)
        try:
            record = UsageRecord(
                provider=provider,
                model=model,
                purpose=purpose,
                status=status,
                error_code=error_code,
                input_tokens=call.usage.input_tokens,
                cached_input_tokens=call.usage.cached_input_tokens,
                cache_write_tokens=call.usage.cache_write_tokens,
                output_tokens=call.usage.output_tokens,
                reasoning_tokens=call.usage.reasoning_tokens,
                audio_seconds=call.audio_seconds,
                latency_ms=latency_ms,
                ttft_ms=call.ttft_ms,
                home_id=home_id,
                user_id=user_id,
                request_id=request_id,
                round_index=round_index,
                occurred_at=started_at,
            )
            sink.report(record)
        except ValueError as exc:
            logger.warning("Bỏ qua số liệu dùng AI không hợp lệ: %s", type(exc).__name__)
