"""AgentReply (hợp đồng §3.2) + soạn câu trả lời TẤT ĐỊNH cho done / scheduled / confirm / mixed.

Câu của done/scheduled/confirm/mixed do code soạn từ kết quả backend (nhãn hành động do backend
sinh), không do LLM — nên tên thiết bị độc hại không thể chèn lời vào các câu này.
"""

from datetime import datetime, timedelta, timezone, tzinfo
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field

from .planner.schemas import Clarification

ReplyType = Literal["answer", "done", "scheduled", "confirm", "mixed", "clarify", "refuse"]

# Lý do một bước chạy ngay không thành công, theo error_code của backend (không để mã thô lộ ra).
FAILURE_REASONS: dict[str, str] = {
    "DEVICE_OFFLINE": "thiết bị đang ngoại tuyến",
    "TIMEOUT": "thiết bị không phản hồi",
    "ACK_TIMEOUT": "thiết bị không phản hồi",
    "ACCESS_REVOKED": "bạn không còn quyền điều khiển",
    "HOME_SUSPENDED": "nhà đang tạm khoá",
    "NO_DEVICE": "thiết bị không còn",
}
DEFAULT_FAILURE_REASON = "có lỗi khi gửi lệnh"

REJECT_MESSAGES: dict[str, str] = {
    "NOT_FOUND": "Mình không tìm thấy {name} trong nhà này.",
    "FORBIDDEN": "Bạn chưa có quyền điều khiển {name}.",
    "HOME_SUSPENDED": "Nhà đang tạm khoá nên chưa điều khiển {name} được.",
    "NOT_CONTROLLABLE": "{name} không hỗ trợ thao tác này.",
    "INVALID_WHEN": "Thời gian hẹn cho {name} cần nằm trong khoảng từ 30 giây đến 7 ngày tới.",
    "SCHEDULE_LIMIT": "Nhà đã có quá nhiều lịch hẹn (tối đa 50), bạn huỷ bớt lịch cũ nhé.",
}
DEFAULT_REJECT_MESSAGE = "Mình chưa thực hiện được thao tác với {name}."


class RejectedItem(BaseModel):
    index: int
    code: str
    message: str


class AgentReply(BaseModel):
    conversation_id: str
    type: ReplyType
    reply: str
    transcript: str | None = None
    clarification: Clarification | None = None
    executed: list[dict[str, Any]] = Field(default_factory=list)
    scheduled: list[dict[str, Any]] = Field(default_factory=list)
    pending: dict[str, Any] | None = None
    rejected: list[RejectedItem] = Field(default_factory=list)


def reject_message(code: str, name: str) -> str:
    return REJECT_MESSAGES.get(code, DEFAULT_REJECT_MESSAGE).format(name=name)


def home_tz(timezone_name: str, local_now: str) -> tzinfo:
    """Múi giờ của nhà. Không có dữ liệu tz (Windows thiếu tzdata) → dùng offset của local_now."""
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        try:
            offset = datetime.fromisoformat(local_now).utcoffset()
        except ValueError:
            offset = None
        return timezone(offset or timedelta(0))


def _parse(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def format_run_at(run_at: str | None, tz: tzinfo, now_local: datetime | None) -> str:
    """'19:40' hôm nay · '19:40 ngày mai' · '19:40 20/11'. None = chạy ngay."""
    if run_at is None:
        return "ngay bây giờ"
    moment = _parse(run_at)
    if moment is None:
        return "đúng giờ hẹn"
    local = moment.astimezone(tz)
    label = local.strftime("%H:%M")
    if now_local is not None:
        today = now_local.astimezone(tz).date()
        if local.date() == today + timedelta(days=1):
            label += " ngày mai"
        elif local.date() != today:
            label += local.strftime(" %d/%m")
    return label


def lower_first(label: str) -> str:
    """Hạ chữ cái đầu của nhãn hành động để ghép giữa câu ('Bật đèn' → 'bật đèn')."""
    return label[:1].lower() + label[1:]


def _executed_sentences(executed: list[dict[str, Any]]) -> list[str]:
    """Câu cho các bước đã chạy ngay: bước thành công gộp một câu, bước khác mỗi bước một câu."""
    done: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []
    running: list[str] = []
    for item in executed:
        label = lower_first(str(item.get("action_label") or "").strip())
        status = item.get("status")
        if status == "done":
            done.append(label)
        elif status == "skipped":
            skipped.append(f"Không cần {label} vì thiết bị đã ở trạng thái đó.")
        elif status == "running":
            running.append(f"Đang {label}.")
        else:  # failed / cancelled / missed (và trạng thái lạ: không khẳng định đã làm)
            reason = FAILURE_REASONS.get(str(item.get("error_code") or ""), DEFAULT_FAILURE_REASON)
            failed.append(f"Chưa {label} được ({reason}).")
    sentences: list[str] = []
    if done:
        joined = done[0] if len(done) == 1 else ", ".join(done[:-1]) + " và " + done[-1]
        sentences.append(f"Đã {joined}.")
    return sentences + skipped + failed + running


def compose_reply(
    executed: list[dict[str, Any]],
    scheduled: list[dict[str, Any]],
    pending: dict[str, Any] | None,
    tz: tzinfo,
    local_now: str,
) -> tuple[ReplyType, str]:
    """(type, reply) cho kết quả có bước chạy ngay, lịch hẹn và/hoặc bước chờ xác nhận."""
    now_local = _parse(local_now)
    parts: list[str] = []
    if executed:
        parts.extend(_executed_sentences(executed))
    if scheduled:
        items = " · ".join(
            f"{format_run_at(s.get('run_at'), tz, now_local)} "
            f"{lower_first(str(s.get('action_label', '')))}".strip()
            for s in scheduled
        )
        parts.append(f"Đã hẹn: {items}. Bạn huỷ được trước giờ chạy.")
    steps = (pending or {}).get("steps") or []
    if steps:
        items = " · ".join(
            f"{s.get('action_label', '')} ({format_run_at(s.get('run_at'), tz, now_local)})"
            for s in steps
        )
        lead = (
            "Việc còn lại cần bạn xác nhận" if executed or scheduled else "Bạn xác nhận giúp mình"
        )
        parts.append(f"{lead}: {items}.")
    text = " ".join(parts)
    kinds = [bool(executed), bool(scheduled), bool(steps)]
    if sum(kinds) >= 2:
        return "mixed", text
    if executed:
        return "done", text
    if scheduled:
        return "scheduled", text
    return "confirm", text
