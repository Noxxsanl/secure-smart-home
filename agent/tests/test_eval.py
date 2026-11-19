"""Bộ đếm ngân sách + chỉ số của eval/run_eval.py. Dùng OpenAI giả, KHÔNG gọi mạng."""

import importlib.util
from pathlib import Path

import pytest

from helpers import (
    FakeOpenAI,
    Sink,
    at,
    make_settings,
    plan_args,
    response,
    step,
    text_item,
    tool_call,
)
from smarthome_agent.planner import Planner

_PATH = Path(__file__).resolve().parents[1] / "eval" / "run_eval.py"
_spec = importlib.util.spec_from_file_location("run_eval", _PATH)
run_eval = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_eval)

CASES = [
    {
        "id": f"c{i}",
        "group": "g",
        "fixture": "basic",
        "text": "phòng khách bao nhiêu độ?",
        "expect": {"type": "answer"},
    }
    for i in range(1, 6)
]


def make(llm, max_calls=None):
    budget = run_eval.CallBudget(llm, max_calls)
    return Planner(budget, make_settings(), Sink(), system_prompt="SYSTEM"), budget


async def test_budget_counts_every_responses_create():
    llm = FakeOpenAI(*[response(text_item("29,4 độ")) for _ in range(3)])
    planner, budget = make(llm)
    results, stopped = await run_eval.run_all(planner, CASES[:3], budget)
    assert not stopped and budget.calls == 3 and len(llm.calls) == 3
    assert [r["calls"] for r in results] == [1, 1, 1]
    assert all("latency_ms" in r for r in results)


async def test_budget_is_a_hard_stop_before_calling_openai():
    llm = FakeOpenAI(*[response(text_item("29,4 độ")) for _ in range(5)])
    planner, budget = make(llm, max_calls=2)
    results, stopped = await run_eval.run_all(planner, CASES, budget)
    assert stopped is True
    assert len(results) == 2 and budget.calls == 2
    assert len(llm.calls) == 2  # lượt thứ 3 bị chặn TRƯỚC khi gọi


async def test_budget_exceeded_is_not_swallowed_as_case_error():
    llm = FakeOpenAI(response(text_item("ok")))
    planner, budget = make(llm, max_calls=0)
    results, stopped = await run_eval.run_all(planner, CASES[:1], budget)
    assert stopped is True and results == [] and llm.calls == []


async def test_other_errors_are_recorded_and_run_continues():
    llm = FakeOpenAI(response(text_item("ok")))

    async def boom(**_):
        raise TimeoutError

    llm.responses.create = boom
    planner, budget = make(llm)
    results, stopped = await run_eval.run_all(planner, CASES[:2], budget)
    assert not stopped
    assert [r["error"] for r in results] == ["TimeoutError", "TimeoutError"]
    assert [r["pass"] for r in results] == [False, False]


async def test_plan_case_reports_evidence_ok():
    case = {
        "id": "p1",
        "group": "g",
        "fixture": "basic",
        "text": "8h tối bật đèn",
        "expect": {
            "type": "plan",
            "steps": [
                {"device": "Đèn", "action": "turn_on", "when": {"kind": "at", "at": "20:00"}}
            ],
        },
    }
    good = plan_args(step("d1", when=at("20:00"), evidence="8h tối bật đèn"))
    bad = plan_args(step("d1", when=at("20:00"), evidence="đèn"))
    for plan, expected in ((good, 1), (bad, 0)):
        llm = FakeOpenAI(response(tool_call("propose_plan", plan)))
        planner, budget = make(llm)
        [result] = (await run_eval.run_all(planner, [case], budget))[0]
        assert result["pass"] is True  # evidence không ảnh hưởng pass/fail
        assert (result["evidence_ok"], result["evidence_steps"]) == (expected, 1)


def test_select_cases_by_group_ids_and_limit():
    cases = [{"id": "a", "group": "x"}, {"id": "b", "group": "y"}, {"id": "c", "group": "x"}]
    assert [c["id"] for c in run_eval.select_cases(cases, ids="a, c")] == ["a", "c"]
    assert [c["id"] for c in run_eval.select_cases(cases, group="x", limit=1)] == ["a"]
    assert [c["id"] for c in run_eval.select_cases(cases, ids="zzz")] == []


def test_percentile():
    assert run_eval.percentile([], 50) is None
    assert run_eval.percentile([100], 95) == 100
    assert run_eval.percentile([10, 20, 30, 40], 50) == 25
    assert run_eval.percentile([0, 100], 95) == pytest.approx(95)


def test_summary_prints_latency_effort_calls_and_stop_line(capsys):
    llm = FakeOpenAI()
    budget = run_eval.CallBudget(llm, 4)
    budget.calls = 4
    results = [
        {
            "id": "a",
            "group": "g",
            "pass": True,
            "latency_ms": 1000,
            "evidence_ok": 1,
            "evidence_steps": 2,
        },
        {"id": "b", "group": "g", "pass": False, "latency_ms": 3000},
    ]
    run_eval.print_summary(results, budget, "minimal", stopped=True)
    out = capsys.readouterr().out
    assert "p50 2000 ms" in out and "effort minimal" in out and "4 lượt gọi" in out
    assert "evidence đạt 1/2 bước" in out and "XẤP XỈ" in out
    assert "Đã dừng: hết ngân sách 4 lượt gọi" in out


@pytest.mark.parametrize(
    ("evidence", "appliance", "action", "extra", "expected"),
    [
        ("bật đèn", "lamp", "turn_on", {}, True),
        ("tắt đèn và bật quạt", "fan", "turn_off", {}, False),
        ("tắt đèn và bật quạt", "fan", "turn_on", {}, True),
        ("tất cả đèn", "lamp", "turn_off", {}, False),  # "tất cả" không phải động từ tắt
        ("tắt tất cả đèn", "lamp", "turn_off", {}, True),
        ("đèn", "lamp", "turn_on", {}, False),
        ("bật quạt", "lamp", "turn_on", {}, False),
        ("điều hoà hai lăm độ", "ac", "set_temp", {"temperature": 25}, True),
        ("tắt điều hoà 25 độ", "ac", "set_temp", {"temperature": 25}, False),
        ("mở rèm một nửa", "curtain", "set_pos", {"position": 50}, True),
        ("mở rèm một nửa", "curtain", "set_pos", {"position": 100}, False),
        ("đóng rèm", "curtain", "set_pos", {"position": 0}, True),
        ("8h tối bật đèn", "lamp", "turn_on", {"when": {"at": "20:00", "day_offset": None}}, True),
        ("bật đèn", "lamp", "turn_on", {"when": {"at": "20:00", "day_offset": None}}, False),
        ("tắt quạt sau 30p nữa", "fan", "turn_off", {"when": {"after_minutes": 30}}, True),
    ],
)
def test_evidence_ok_approximates_backend_rule(evidence, appliance, action, extra, expected):
    stepdict = {
        "evidence_span": evidence,
        "action": action,
        "temperature": extra.get("temperature"),
        "position": extra.get("position"),
        "when": extra.get("when", {"now": True}),
    }
    utterance = f"{evidence} giúp tôi"
    assert run_eval.evidence_ok(stepdict, utterance, appliance) is expected


def test_evidence_must_be_a_phrase_of_the_utterance():
    stepdict = {
        "evidence_span": "bật đèn",
        "action": "turn_on",
        "temperature": None,
        "position": None,
        "when": {"now": True},
    }
    assert run_eval.evidence_ok(stepdict, "tắt quạt", "lamp") is False
