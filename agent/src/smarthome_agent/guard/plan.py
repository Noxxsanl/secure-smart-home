"""Lọc sớm kế hoạch LLM trước khi gửi backend (hợp đồng §3.6).

Chỉ là lớp lọc: backend vẫn quyết định lại toàn bộ (quyền, thời điểm, nói rõ/xác nhận — §2.4).
Bước sai bị bỏ và đưa vào `rejected` kèm câu giải thích; bước không "nói rõ" VẫN được gửi để
backend buộc xác nhận.
"""

import re
from dataclasses import dataclass, field
from typing import Any

from ..planner.context import RefMap
from ..planner.schemas import PlanStep, ProposedPlan

MAX_STEPS = 10
ALLOWED_POSITIONS = (0, 50, 100)
TEMP_RANGE = (16, 30)
MAX_AFTER_MINUTES = 10080

_AT_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

# mã → câu tiếng Việt (dùng {name} = tên thiết bị đã làm sạch)
GUARD_MESSAGES: dict[str, str] = {
    "UNKNOWN_DEVICE": "Mình không tìm thấy thiết bị bạn nói trong nhà này.",
    "CANNOT_CONTROL": "Bạn chưa có quyền điều khiển {name}. Nhờ chủ nhà cấp quyền nhé.",
    "ACTION_NOT_ALLOWED": "{name} không hỗ trợ thao tác này.",
    "INVALID_ARGUMENT": "Giá trị cho {name} chưa hợp lệ (điều hoà 16–30°C, rèm 0/50/100%).",
    "INVALID_WHEN": "Mình chưa hiểu rõ thời gian hẹn cho {name}.",
    "TOO_MANY_STEPS": "Yêu cầu có quá nhiều việc (tối đa 10), bạn chia nhỏ ra giúp mình nhé.",
}


@dataclass(frozen=True)
class RejectedStep:
    index: int  # vị trí bước trong kế hoạch của LLM
    code: str
    message: str


@dataclass
class GuardResult:
    # Bước hợp lệ, đúng dạng body backend (§2.3), theo thứ tự gốc.
    steps: list[dict[str, Any]] = field(default_factory=list)
    # plan_indexes[i] = vị trí gốc (trong kế hoạch LLM) của steps[i].
    plan_indexes: list[int] = field(default_factory=list)
    rejected: list[RejectedStep] = field(default_factory=list)


def _check_when(step: PlanStep) -> dict[str, Any] | None:
    when = step.when
    if when.kind == "now":
        if when.at is not None or when.day_offset is not None or when.after_minutes is not None:
            return None
        return {"now": True}
    if when.kind == "at":
        if when.after_minutes is not None or when.at is None or not _AT_PATTERN.match(when.at):
            return None
        if when.day_offset is not None and not 0 <= when.day_offset <= 6:
            return None
        return {"at": when.at, "day_offset": when.day_offset}
    # after
    if when.at is not None or when.day_offset is not None or when.after_minutes is None:
        return None
    if not 1 <= when.after_minutes <= MAX_AFTER_MINUTES:
        return None
    return {"after_minutes": when.after_minutes}


def _check_step(step: PlanStep, refs: RefMap) -> tuple[dict[str, Any] | None, str | None]:
    """Trả (body bước backend, None) nếu hợp lệ; (None, mã lỗi) nếu không."""
    device = refs.device(step.device_ref)
    if device is None:
        return None, "UNKNOWN_DEVICE"
    if not device.can_control:
        return None, "CANNOT_CONTROL"
    if step.action not in device.actions:
        return None, "ACTION_NOT_ALLOWED"

    temperature: int | None = None
    position: int | None = None
    if step.action == "set_temp":
        if step.temperature is None or not TEMP_RANGE[0] <= step.temperature <= TEMP_RANGE[1]:
            return None, "INVALID_ARGUMENT"
        temperature = step.temperature
    elif step.action == "set_pos":
        if step.position not in ALLOWED_POSITIONS:
            return None, "INVALID_ARGUMENT"
        position = step.position

    when = _check_when(step)
    if when is None:
        return None, "INVALID_WHEN"

    return {
        "device_id": device.id,
        "action": step.action,
        "temperature": temperature,
        "position": position,
        "when": when,
        "reason": step.reason.strip()[:255] or "Theo yêu cầu",
        # Không "sửa" evidence cho khớp: không khớp thì backend coi là chưa nói rõ → xin xác nhận.
        "evidence_span": step.evidence_span.strip()[:200] or "-",
    }, None


def guard_plan(plan: ProposedPlan, refs: RefMap) -> GuardResult:
    result = GuardResult()
    for index, step in enumerate(plan.steps):
        if index >= MAX_STEPS:
            result.rejected.append(
                RejectedStep(index, "TOO_MANY_STEPS", GUARD_MESSAGES["TOO_MANY_STEPS"])
            )
            continue
        body, code = _check_step(step, refs)
        if body is None:
            assert code is not None
            message = GUARD_MESSAGES[code].format(name=refs.device_label(step.device_ref))
            result.rejected.append(RejectedStep(index, code, message))
            continue
        result.steps.append(body)
        result.plan_indexes.append(index)
    return result
