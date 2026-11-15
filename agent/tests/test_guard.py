import pytest

from helpers import after, at, make_context, plan_args, step
from smarthome_agent.clients.backend import HomeContext
from smarthome_agent.guard import guard_plan
from smarthome_agent.planner import ProposedPlan, build_llm_context


@pytest.fixture
def refs():
    # d1 Đèn, d2 Quạt, d3 Điều hoà (can_control), d4 Rèm (không điều khiển được)
    return build_llm_context(HomeContext.model_validate(make_context())).refs


def run(refs, *steps):
    return guard_plan(ProposedPlan.model_validate(plan_args(*steps)), refs)


def test_valid_steps_become_backend_payload(refs):
    result = run(
        refs,
        step("d1", "turn_on", when=at("20:00"), evidence="8h tối bật đèn"),
        step("d2", "turn_off", when=after(30), evidence="tắt quạt sau 30p nữa"),
        step("d3", "set_temp", temperature=26, evidence="đặt 26 độ"),
    )
    assert result.rejected == []
    assert result.plan_indexes == [0, 1, 2]
    first, second, third = result.steps
    assert first == {
        "device_id": 41,
        "action": "turn_on",
        "temperature": None,
        "position": None,
        "when": {"at": "20:00", "day_offset": None},
        "reason": "Theo yêu cầu",
        "evidence_span": "8h tối bật đèn",
    }
    assert second["device_id"] == 42 and second["when"] == {"after_minutes": 30}
    assert third["temperature"] == 26 and third["when"] == {"now": True}


def test_unknown_ref_is_rejected_with_message(refs):
    result = run(refs, step("d9"), step("d1"))
    assert [r.code for r in result.rejected] == ["UNKNOWN_DEVICE"]
    assert result.rejected[0].index == 0 and result.rejected[0].message
    assert result.plan_indexes == [1]  # chỉ số gốc của bước còn lại


def test_device_without_control_permission_is_rejected(refs):
    result = run(refs, step("d4", "turn_on"))
    assert result.steps == []
    assert result.rejected[0].code == "CANNOT_CONTROL"
    assert "Rèm" in result.rejected[0].message


def test_action_must_belong_to_device_actions(refs):
    result = run(refs, step("d1", "set_temp", temperature=24))
    assert result.rejected[0].code == "ACTION_NOT_ALLOWED"


@pytest.mark.parametrize("temperature", [None, 15, 31])
def test_set_temp_range(refs, temperature):
    result = run(refs, step("d3", "set_temp", temperature=temperature))
    assert result.rejected[0].code == "INVALID_ARGUMENT"


@pytest.mark.parametrize("when", [at("25:00"), at("8:00"), at("20:60"), at("20:00", day_offset=7)])
def test_invalid_at(refs, when):
    result = run(refs, step("d1", when=when))
    assert result.rejected[0].code == "INVALID_WHEN"


@pytest.mark.parametrize("minutes", [0, -5, 10081])
def test_invalid_after_minutes(refs, minutes):
    assert run(refs, step("d1", when=after(minutes))).rejected[0].code == "INVALID_WHEN"


def test_when_fields_must_match_kind(refs):
    now_with_time = {"kind": "now", "at": "20:00", "day_offset": None, "after_minutes": None}
    after_with_at = {"kind": "after", "at": "20:00", "day_offset": None, "after_minutes": 5}
    at_without_time = {"kind": "at", "at": None, "day_offset": None, "after_minutes": None}
    for when in (now_with_time, after_with_at, at_without_time):
        assert run(refs, step("d1", when=when)).rejected[0].code == "INVALID_WHEN"


def test_non_explicit_step_is_still_sent_to_backend(refs):
    # Guard không tự quyết "nói rõ": backend sẽ buộc xác nhận.
    result = run(refs, step("d1", when=at("20:00"), evidence="câu không có thật"))
    assert len(result.steps) == 1
    assert result.steps[0]["evidence_span"] == "câu không có thật"


def test_blank_evidence_gets_placeholder_that_never_counts_as_explicit(refs):
    result = run(refs, step("d1", evidence="   "))
    assert result.steps[0]["evidence_span"] == "-"
