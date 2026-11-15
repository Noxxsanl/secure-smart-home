"""Dựng ngữ cảnh gửi LLM từ context backend + bảng ánh xạ ref → ID thật (hợp đồng §3.5).

KHÔNG gửi LLM: ID thật (nhà, phòng, thiết bị), tên nhà, tên/email thành viên, user_id.
Bảng ánh xạ chỉ sống trong bộ nhớ của một request. Tên phòng/thiết bị là dữ liệu do người
dùng đặt → làm sạch ký tự điều khiển + cắt ngắn trước khi đưa vào (giảm bề mặt prompt injection).
"""

import re
from dataclasses import dataclass, field
from typing import Any

from ..clients.backend import DeviceInfo, HomeContext

_WEEKDAYS = {
    1: "Thứ hai",
    2: "Thứ ba",
    3: "Thứ tư",
    4: "Thứ năm",
    5: "Thứ sáu",
    6: "Thứ bảy",
    7: "Chủ nhật",
}
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f-\x9f  ]+")
NAME_MAX = 60


def clean_name(value: str, limit: int = NAME_MAX) -> str:
    """Bỏ ký tự điều khiển/xuống dòng, gộp khoảng trắng, cắt ngắn."""
    return " ".join(_CONTROL_CHARS.sub(" ", value).split())[:limit]


@dataclass
class RefMap:
    """ref ('d1') → thiết bị thật; chỉ giữ trong request."""

    devices: dict[str, DeviceInfo] = field(default_factory=dict)
    room_names: dict[str, str] = field(default_factory=dict)  # ref phòng → tên

    def device(self, ref: str) -> DeviceInfo | None:
        return self.devices.get(ref)

    def device_label(self, ref: str) -> str:
        device = self.devices.get(ref)
        return clean_name(device.name) if device else "thiết bị này"


@dataclass
class LlmContext:
    payload: dict[str, Any]
    refs: RefMap


def build_llm_context(ctx: HomeContext) -> LlmContext:
    refs = RefMap()
    room_ref_by_id: dict[int, str] = {}
    rooms: list[dict[str, Any]] = []
    for index, room in enumerate(ctx.rooms, start=1):
        ref = f"r{index}"
        room_ref_by_id[room.id] = ref
        name = clean_name(room.name)
        refs.room_names[ref] = name
        climate = (
            {"temperature": room.climate.temperature, "humidity": room.climate.humidity}
            if room.climate is not None
            else None
        )
        rooms.append({"ref": ref, "name": name, "climate": climate})

    devices: list[dict[str, Any]] = []
    for index, device in enumerate(ctx.devices, start=1):
        ref = f"d{index}"
        refs.devices[ref] = device
        devices.append(
            {
                "ref": ref,
                "name": clean_name(device.name),
                "room_ref": room_ref_by_id.get(device.room_id) if device.room_id else None,
                "appliance": device.appliance,
                "power": device.power,
                "level": device.level,
                "online": device.online,
                "can_control": device.can_control,
                "actions": device.actions,
            }
        )

    payload = {
        "local_now": ctx.home.local_now,
        "weekday": _WEEKDAYS.get(ctx.home.iso_weekday, ""),
        "home_role": ctx.actor.home_role,
        "rooms": rooms,
        "devices": devices,
    }
    return LlmContext(payload=payload, refs=refs)


def stt_hint(ctx: HomeContext, limit: int = 200) -> str:
    """Gợi ý cho STT: tên phòng + tên thiết bị (≤ limit ký tự) để nhận đúng từ riêng."""
    seen: list[str] = []
    for name in [*(r.name for r in ctx.rooms), *(d.name for d in ctx.devices)]:
        cleaned = clean_name(name, 30)
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return ", ".join(seen)[:limit]
