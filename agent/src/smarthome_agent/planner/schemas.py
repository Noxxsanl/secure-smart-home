"""Cấu trúc kế hoạch LLM được phép nộp qua `propose_plan` (đề xuất §6).

Không có trường mức rủi ro: rủi ro do policy tất định gán, không do LLM khai (§7.2 luật 1).
"""

from typing import Literal

from pydantic import BaseModel, Field

ActionType = Literal["device_command", "scene_activate", "scene_create", "automation_create"]


class PlanStep(BaseModel):
    action_type: ActionType
    # Mã tạm theo phiên (d5, r2) — LLM không bao giờ thấy ID thật trong database.
    device_ref: str | None = Field(None, pattern=r"^d\d+$")
    scene_ref: str | None = Field(None, pattern=r"^s\d+$")
    command: str = Field(max_length=32)
    scheduled_at_local: str | None = None
    reason: str = Field(max_length=255)
    # Trích nguyên văn từ câu người dùng; guard kiểm tra có thật trong câu.
    evidence_span: str | None = Field(None, max_length=200)


class ProposedPlan(BaseModel):
    summary: str = Field(max_length=200)
    steps: list[PlanStep] = Field(min_length=1, max_length=10)
