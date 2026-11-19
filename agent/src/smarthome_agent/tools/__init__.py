"""Tool cho LLM (Responses API, strict JSON schema, mọi trường required — cho phép null).

Chỉ có 2 tool và cả hai chỉ *đề xuất* (hợp đồng §3.5):
- `ask_clarification` — hỏi lại khi thiếu thông tin;
- `propose_plan` — nộp các bước điều khiển/hẹn giờ.
KHÔNG tạo tool execute / send_command / confirm / set_risk_level. Danh sách thiết bị đã nằm
trong ngữ cảnh nên không cần tool đọc.
"""

from typing import Any

ASK_CLARIFICATION = "ask_clarification"
PROPOSE_PLAN = "propose_plan"

_NULLABLE_INT = {"type": ["integer", "null"]}
_NULLABLE_STR = {"type": ["string", "null"]}

_ASK_CLARIFICATION: dict[str, Any] = {
    "type": "function",
    "name": ASK_CLARIFICATION,
    "description": (
        "Hỏi lại người dùng khi thiếu thông tin (không rõ giờ sáng/tối, nhiều thiết bị cùng loại). "
        "Câu hỏi tối đa 200 ký tự; tối đa 4 lựa chọn, mỗi lựa chọn tối đa 40 ký tự."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "required": ["question", "options"],
        "properties": {
            "question": {"type": "string", "description": "Câu hỏi tiếng Việt, ≤ 200 ký tự."},
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Các lựa chọn gợi ý, ≤ 4 mục, mỗi mục ≤ 40 ký tự; [] nếu hỏi mở.",
            },
        },
    },
}

_PROPOSE_PLAN: dict[str, Any] = {
    "type": "function",
    "name": PROPOSE_PLAN,
    "description": (
        "Đề xuất các bước điều khiển/hẹn giờ thiết bị theo đúng yêu cầu người dùng (1–10 bước). "
        "Bạn không thực thi được: hệ thống làm ngay hoặc hẹn giờ lệnh rõ ràng, "
        "còn lại xin người dùng xác nhận."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "required": ["summary", "steps"],
        "properties": {
            "summary": {"type": "string", "description": "Tóm tắt ngắn gọn, ≤ 200 ký tự."},
            "steps": {
                "type": "array",
                "description": "1–10 bước.",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "device_ref",
                        "action",
                        "temperature",
                        "position",
                        "when",
                        "reason",
                        "evidence_span",
                    ],
                    "properties": {
                        "device_ref": {
                            "type": "string",
                            "description": "Mã thiết bị trong ngữ cảnh, dạng d1, d2…",
                        },
                        "action": {
                            "type": "string",
                            "enum": ["turn_on", "turn_off", "set_temp", "set_pos"],
                        },
                        "temperature": {
                            **_NULLABLE_INT,
                            "description": "Độ C 16–30 khi action=set_temp, ngược lại null.",
                        },
                        "position": {
                            **_NULLABLE_INT,
                            "description": "0, 50 hoặc 100 khi action=set_pos, ngược lại null.",
                        },
                        "when": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["kind", "at", "day_offset", "after_minutes"],
                            "properties": {
                                "kind": {"type": "string", "enum": ["now", "at", "after"]},
                                "at": {
                                    **_NULLABLE_STR,
                                    "description": "HH:MM 24 giờ khi kind=at, ngược lại null.",
                                },
                                "day_offset": {
                                    **_NULLABLE_INT,
                                    "description": (
                                        "0–6 (0 = hôm nay, 1 = ngày mai) khi kind=at; "
                                        "null = lần tới gần nhất."
                                    ),
                                },
                                "after_minutes": {
                                    **_NULLABLE_INT,
                                    "description": "1–10080 phút khi kind=after, ngược lại null.",
                                },
                            },
                        },
                        "reason": {"type": "string", "description": "Lý do ngắn, ≤ 255 ký tự."},
                        "evidence_span": {
                            "type": "string",
                            "description": (
                                "Đoạn trích NGUYÊN VĂN, liền mạch từ câu người dùng, chứa động từ "
                                "(bật/mở/tắt/đóng), "
                                "loại thiết bị, phòng/tên thiết bị nếu có nói và giờ nếu hẹn giờ "
                                "(≤ 200 ký tự)."
                            ),
                        },
                    },
                },
            },
        },
    },
}


def tool_definitions(*, allow_clarification: bool = True) -> list[dict[str, Any]]:
    """Danh sách tool gửi LLM. Hết lượt hỏi lại thì bỏ `ask_clarification`."""
    tools = [_PROPOSE_PLAN]
    if allow_clarification:
        tools.insert(0, _ASK_CLARIFICATION)
    return tools
