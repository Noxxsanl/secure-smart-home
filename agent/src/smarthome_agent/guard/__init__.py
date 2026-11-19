"""Kiểm tra sơ bộ kế hoạch trước khi gửi backend.

`device_ref` có thật, thiết bị điều khiển được, thao tác thuộc danh sách cho phép, giá trị và
`when` hợp lệ. Đây chỉ là lớp lọc sớm — backend vẫn kiểm duyệt lại toàn bộ (hợp đồng §2.4),
nên không được coi kết quả guard là đủ để thực thi. Chuẩn hoá chữ: `text.py` (§2.8).
"""

from .plan import GUARD_MESSAGES, GuardResult, RejectedStep, guard_plan
from .text import normalize_text

__all__ = [
    "GUARD_MESSAGES",
    "GuardResult",
    "RejectedStep",
    "guard_plan",
    "normalize_text",
]
