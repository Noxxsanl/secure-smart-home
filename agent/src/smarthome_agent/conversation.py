"""Hội thoại trong RAM (hợp đồng §3.7): không ghi đĩa, hết hạn sau TTL, LRU theo số hội thoại.

`conversation_id` (uuid4 hex) gắn với (người dùng, nhà). ID lạ/hết hạn/của người khác → mở hội
thoại mới, không báo lỗi (không để lộ ID nào tồn tại).
"""

import time
import uuid
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

Role = Literal["user", "assistant"]

DEFAULT_TTL_S = 600
DEFAULT_MAX_CONVERSATIONS = 500
DEFAULT_MAX_MESSAGES = 12


@dataclass
class Conversation:
    id: str
    owner: int  # user_id từ context backend
    home_id: int
    messages: list[tuple[Role, str]] = field(default_factory=list)
    clarifications: int = 0
    touched: float = 0.0


class ConversationStore:
    def __init__(
        self,
        *,
        ttl_s: float = DEFAULT_TTL_S,
        max_conversations: int = DEFAULT_MAX_CONVERSATIONS,
        max_messages: int = DEFAULT_MAX_MESSAGES,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_s
        self._max = max_conversations
        self._max_messages = max_messages
        self._clock = clock
        self._items: OrderedDict[str, Conversation] = OrderedDict()

    def __len__(self) -> int:
        return len(self._items)

    def _purge(self) -> None:
        now = self._clock()
        expired = [cid for cid, c in self._items.items() if now - c.touched > self._ttl]
        for cid in expired:
            del self._items[cid]

    def open(self, conversation_id: str | None, owner: int, home_id: int) -> Conversation:
        """Lấy hội thoại đang có (đúng người + nhà, chưa hết hạn) hoặc tạo mới."""
        self._purge()
        existing = self._items.get(conversation_id) if conversation_id else None
        if existing is not None and existing.owner == owner and existing.home_id == home_id:
            existing.touched = self._clock()
            self._items.move_to_end(existing.id)
            return existing
        conversation = Conversation(
            id=uuid.uuid4().hex, owner=owner, home_id=home_id, touched=self._clock()
        )
        self._items[conversation.id] = conversation
        while len(self._items) > self._max:
            self._items.popitem(last=False)
        return conversation

    def add(self, conversation: Conversation, role: Role, text: str) -> None:
        conversation.messages.append((role, text))
        del conversation.messages[: -self._max_messages]
        conversation.touched = self._clock()
