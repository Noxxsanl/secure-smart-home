"""Cấu trúc LLM được phép nộp qua tool `propose_plan` / `ask_clarification` (hợp đồng §3.5).

Không có trường mức rủi ro hay "đã xác nhận": LLM chỉ đề xuất, quyết định do backend (§2.4).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ActionName = Literal["turn_on", "turn_off", "set_temp", "set_pos"]
WhenKind = Literal["now", "at", "after"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PlanWhen(_Strict):
    kind: WhenKind
    at: str | None = None
    day_offset: int | None = None
    after_minutes: int | None = None


class PlanStep(_Strict):
    # Mã tạm theo request (d1, d2…) — LLM không bao giờ thấy ID thật trong database.
    device_ref: str = Field(pattern=r"^d\d+$")
    action: ActionName
    temperature: int | None = None
    position: int | None = None
    when: PlanWhen
    reason: str = Field(max_length=255)
    # Trích nguyên văn từ câu người dùng; backend kiểm có thật trong câu (§2.4 bước 3).
    evidence_span: str = Field(max_length=200)


class ProposedPlan(_Strict):
    summary: str = Field(min_length=1, max_length=200)
    steps: list[PlanStep] = Field(min_length=1, max_length=10)


class Clarification(_Strict):
    question: str = Field(min_length=1, max_length=200)
    options: list[str] = Field(max_length=4)
