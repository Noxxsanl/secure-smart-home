"""Chuẩn hoá chữ để so khớp `evidence_span` với câu người dùng (hợp đồng §2.8).

PHẢI giống hệt bản TypeScript của backend (modules/agent). Các bước, đúng thứ tự:
lower() → đ→d → Unicode NFD → bỏ ký tự combining (U+0300–U+036F) → ký tự không thuộc [a-z0-9]
thành dấu cách → gộp nhiều dấu cách → trim.
Ví dụ: "Tắt Quạt, sau 30p nữa!" → "tat quat sau 30p nua".

Luật "nói rõ" (được tự đặt lịch hay phải xác nhận) KHÔNG nằm ở agent: backend quyết định ở
`backend/src/modules/agent/domain/explicit-step.ts` (khớp trọn từ, đúng loại tải, có giờ…).
Agent chỉ cần chuẩn hoá giống hệt để đoạn trích nó gửi được backend so khớp đúng.
"""

import re
import unicodedata

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_text(text: str) -> str:
    lowered = text.lower().replace("đ", "d")
    decomposed = unicodedata.normalize("NFD", lowered)
    stripped = "".join(ch for ch in decomposed if not 0x0300 <= ord(ch) <= 0x036F)
    return _NON_ALNUM.sub(" ", stripped).strip()
