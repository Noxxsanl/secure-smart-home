"""Hội thoại trong RAM và giới hạn tốc độ."""

import pytest

from smarthome_agent.conversation import ConversationStore
from smarthome_agent.errors import AgentError
from smarthome_agent.ratelimit import RateLimiter


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_conversation_reuse_requires_same_owner_and_home():
    store = ConversationStore()
    first = store.open(None, owner=7, home_id=3)
    assert len(first.id) == 32
    assert store.open(first.id, 7, 3) is first
    assert store.open(first.id, 8, 3).id != first.id  # người khác
    assert store.open(first.id, 7, 4).id != first.id  # nhà khác
    assert store.open("không-có", 7, 3).id != "không-có"


def test_conversation_expires_after_ttl():
    clock = Clock()
    store = ConversationStore(ttl_s=600, clock=clock)
    conv = store.open(None, 7, 3)
    clock.now += 599
    assert store.open(conv.id, 7, 3) is conv  # gia hạn khi dùng
    clock.now += 601
    assert store.open(conv.id, 7, 3).id != conv.id
    assert len(store) == 1  # bản cũ đã bị dọn


def test_conversation_keeps_last_messages_only():
    store = ConversationStore(max_messages=4)
    conv = store.open(None, 7, 3)
    for i in range(6):
        store.add(conv, "user", f"u{i}")
    assert [text for _, text in conv.messages] == ["u2", "u3", "u4", "u5"]


def test_conversation_lru_eviction():
    store = ConversationStore(max_conversations=2)
    a = store.open(None, 1, 1)
    b = store.open(None, 2, 1)
    store.open(a.id, 1, 1)  # a mới dùng gần nhất
    store.open(None, 3, 1)  # đẩy b ra
    assert store.open(a.id, 1, 1) is a
    assert store.open(b.id, 2, 1).id != b.id


def test_per_minute_limit_slides():
    clock = Clock()
    limiter = RateLimiter(2, 100, clock=clock)
    limiter.hit_user("k")
    limiter.hit_user("k")
    with pytest.raises(AgentError) as info:
        limiter.hit_user("k")
    assert info.value.status_code == 429 and info.value.code == "RATE_LIMITED"
    limiter.hit_user("other")  # người khác không bị ảnh hưởng
    clock.now += 61
    limiter.hit_user("k")


def test_daily_limit_per_home_resets_next_day():
    day = {"value": "2026-11-14"}
    limiter = RateLimiter(10, 2, today=lambda: day["value"])
    limiter.hit_home(3)
    limiter.hit_home(3)
    limiter.hit_home(4)  # nhà khác
    with pytest.raises(AgentError):
        limiter.hit_home(3)
    day["value"] = "2026-11-15"
    limiter.hit_home(3)
