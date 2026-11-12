"""Bản ghi số liệu một lần gọi LLM/STT gửi về backend (tab "AI Usage" của Dashboard).

Khớp hợp đồng POST /api/service/ai-usage
(backend/src/modules/ai-usage/domain/usage-record.ts).
KHÔNG có trường nào cho nội dung prompt/câu trả lời — extra="forbid" chặn lỡ tay thêm
(đề xuất §8.3).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Purpose = Literal["planner", "clarify", "summary", "stt", "eval", "other"]
Status = Literal["success", "error", "timeout"]

_CODE = r"^[A-Za-z0-9_.:-]{1,64}$"


@dataclass(frozen=True)
class TokenUsage:
    """Token chuẩn hoá giữa các nhà cung cấp.

    input_tokens là TỔNG token vào, đã gồm cached_input_tokens (đọc cache) và cache_write_tokens
    (ghi cache). reasoning_tokens đã nằm trong output_tokens.
    """

    input_tokens: int = 0
    cached_input_tokens: int = 0
    cache_write_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0


class UsageRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(pattern=r"^[a-z0-9][a-z0-9_.-]{0,31}$")
    # Cùng mẫu với backend (MODEL_PATTERN) để lỗi ngay ở agent thay vì cả lô bị backend trả 400
    model: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,127}$")
    purpose: Purpose
    source: Literal["agent", "eval"] = "agent"
    status: Status = "success"
    error_code: str | None = Field(None, pattern=_CODE)
    input_tokens: int = Field(0, ge=0)
    cached_input_tokens: int = Field(0, ge=0)
    cache_write_tokens: int = Field(0, ge=0)
    output_tokens: int = Field(0, ge=0)
    reasoning_tokens: int = Field(0, ge=0)
    audio_seconds: float | None = Field(None, ge=0)
    latency_ms: int = Field(ge=0)
    ttft_ms: int | None = Field(None, ge=0)
    home_id: int | None = Field(None, gt=0)
    user_id: int | None = Field(None, gt=0)
    request_id: str | None = Field(None, pattern=_CODE)
    round_index: int | None = Field(None, ge=0, le=100)
    occurred_at: datetime

    @model_validator(mode="after")
    def _check_tokens(self) -> "UsageRecord":
        if self.cached_input_tokens + self.cache_write_tokens > self.input_tokens:
            raise ValueError("cached + cache_write tokens vượt quá input_tokens")
        if self.reasoning_tokens > self.output_tokens:
            raise ValueError("reasoning_tokens phải nằm trong output_tokens")
        return self
