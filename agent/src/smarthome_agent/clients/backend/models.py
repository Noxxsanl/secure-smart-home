"""Kiểu dữ liệu backend trả về cho agent (hợp đồng §2.2). Viết tay, bỏ qua trường lạ."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class HomeInfo(_Model):
    id: int
    timezone: str = "Asia/Ho_Chi_Minh"
    local_now: str
    iso_weekday: int = Field(ge=1, le=7)
    status: str = "active"


class Actor(_Model):
    user_id: int
    home_role: str


class Climate(_Model):
    temperature: float | None = None
    humidity: float | None = None


class RoomInfo(_Model):
    id: int
    name: str
    climate: Climate | None = None


class DeviceInfo(_Model):
    id: int
    name: str
    room_id: int | None = None
    appliance: str
    power: bool | None = None
    level: int | None = None
    online: bool = True
    can_control: bool = False
    actions: list[str] = Field(default_factory=list)


class HomeContext(_Model):
    home: HomeInfo
    actor: Actor
    rooms: list[RoomInfo] = Field(default_factory=list)
    devices: list[DeviceInfo] = Field(default_factory=list)


class RejectedByBackend(_Model):
    index: int
    code: str


class CreateRequestResult(_Model):
    """Kết quả POST .../requests. `executed`/`scheduled`/`pending` giữ nguyên dạng JSON của backend.

    `executed`: các bước backend đã chạy ngay (lệnh rõ), kèm kết quả (done/skipped/failed…).
    """

    request_id: int | None = None
    status: str | None = None
    executed: list[dict[str, Any]] = Field(default_factory=list)
    scheduled: list[dict[str, Any]] = Field(default_factory=list)
    pending: dict[str, Any] | None = None
    rejected: list[RejectedByBackend] = Field(default_factory=list)
