from datetime import UTC

import pytest

from smarthome_agent.reply import compose_reply, lower_first

TZ = UTC
NOW = "2026-11-14T19:10:05+00:00"


def item(label, status="done", error_code=None, run_at=None):
    return {"action_label": label, "status": status, "error_code": error_code, "run_at": run_at}


def compose(executed=(), scheduled=(), pending=None):
    return compose_reply(list(executed), list(scheduled), pending, TZ, NOW)


PENDING = {"steps": [{"action_label": "Bật Đèn", "run_at": None}]}


def test_lower_first():
    assert lower_first("Bật đèn phòng khách") == "bật đèn phòng khách"
    assert lower_first("") == ""


def test_done_single_two_and_three():
    assert compose([item("Bật đèn")]) == ("done", "Đã bật đèn.")
    assert compose([item("Bật đèn"), item("Tắt quạt")]) == ("done", "Đã bật đèn và tắt quạt.")
    kind, text = compose([item("Bật đèn"), item("Tắt quạt"), item("Đóng rèm")])
    assert (kind, text) == ("done", "Đã bật đèn, tắt quạt và đóng rèm.")


def test_skipped_step():
    assert compose([item("Bật đèn", "skipped")]) == (
        "done",
        "Không cần bật đèn vì thiết bị đã ở trạng thái đó.",
    )


@pytest.mark.parametrize("status", ["failed", "cancelled", "missed"])
def test_failed_like_statuses_use_not_done_sentence(status):
    _, text = compose([item("Tắt quạt", status, "DEVICE_OFFLINE")])
    assert text == "Chưa tắt quạt được (thiết bị đang ngoại tuyến)."


@pytest.mark.parametrize(
    ("code", "reason"),
    [
        ("DEVICE_OFFLINE", "thiết bị đang ngoại tuyến"),
        ("TIMEOUT", "thiết bị không phản hồi"),
        ("ACK_TIMEOUT", "thiết bị không phản hồi"),
        ("ACCESS_REVOKED", "bạn không còn quyền điều khiển"),
        ("HOME_SUSPENDED", "nhà đang tạm khoá"),
        ("NO_DEVICE", "thiết bị không còn"),
        ("MA_LA", "có lỗi khi gửi lệnh"),
        (None, "có lỗi khi gửi lệnh"),
    ],
)
def test_failure_reasons_never_expose_raw_code(code, reason):
    _, text = compose([item("Bật đèn", "failed", code)])
    assert text == f"Chưa bật đèn được ({reason})."
    assert "MA_LA" not in text


def test_running_step():
    assert compose([item("Mở rèm", "running")]) == ("done", "Đang mở rèm.")


def test_mixed_done_and_failed_keeps_both_sentences():
    kind, text = compose([item("Bật đèn"), item("Tắt quạt", "failed", "TIMEOUT")])
    assert kind == "done"
    assert text == "Đã bật đèn. Chưa tắt quạt được (thiết bị không phản hồi)."


def test_scheduled_label_is_lowercased_after_time():
    kind, text = compose(
        scheduled=[item("Tắt quạt phòng khách", "scheduled", run_at="2026-11-14T20:00:00Z")]
    )
    assert kind == "scheduled"
    assert text == "Đã hẹn: 20:00 tắt quạt phòng khách. Bạn huỷ được trước giờ chạy."


def test_pending_only_is_confirm():
    assert compose(pending=PENDING) == (
        "confirm",
        "Bạn xác nhận giúp mình: Bật Đèn (ngay bây giờ).",
    )


def test_executed_plus_pending_is_mixed_with_remaining_lead():
    kind, text = compose([item("Tắt quạt")], pending=PENDING)
    assert kind == "mixed"
    assert text == "Đã tắt quạt. Việc còn lại cần bạn xác nhận: Bật Đèn (ngay bây giờ)."


def test_executed_plus_scheduled_is_mixed():
    kind, text = compose(
        [item("Tắt quạt")], [item("Bật đèn", "scheduled", run_at="2026-11-14T20:00:00Z")]
    )
    assert kind == "mixed"
    assert text.startswith("Đã tắt quạt. Đã hẹn: 20:00 bật đèn.")


def test_all_three_parts_are_mixed():
    kind, text = compose(
        [item("Tắt quạt")],
        [item("Bật đèn", "scheduled", run_at="2026-11-14T20:00:00Z")],
        PENDING,
    )
    assert kind == "mixed"
    assert "Đã tắt quạt." in text and "Đã hẹn:" in text and "Việc còn lại cần bạn xác nhận" in text
