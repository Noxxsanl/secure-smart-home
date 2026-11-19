import pytest

from smarthome_agent.guard import normalize_text


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Ví dụ trong hợp đồng §2.8 — bản TypeScript phải ra đúng kết quả này.
        ("Tắt Quạt, sau 30p nữa!", "tat quat sau 30p nua"),
        ("Đèn phòng khách", "den phong khach"),
        ("  8h   TỐI  bật ĐÈN  ", "8h toi bat den"),
        ("tắt-quạt...sau\t30p", "tat quat sau 30p"),
        ("", ""),
        ("!!!", ""),
        ("Điều hoà 26°C", "dieu hoa 26 c"),
        # NFD: ký tự dựng sẵn và tổ hợp cho cùng kết quả
        ("à", "a"),
        ("quạ̣t", "quat"),
    ],
)
def test_normalize_text(raw, expected):
    assert normalize_text(raw) == expected


def test_normalize_is_idempotent():
    once = normalize_text("Bật ĐÈN, sau 1 tiếng rưỡi nữa!")
    assert normalize_text(once) == once
