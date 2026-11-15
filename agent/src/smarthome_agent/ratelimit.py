"""Giới hạn tốc độ trong bộ nhớ tiến trình (hợp đồng §3.1).

- Theo người: tối đa N yêu cầu / 60 giây, hai bucket cùng hạn mức: theo SHA-256 của credential
  (chặn trước khi gọi backend, không lưu credential) và theo user_id (sau khi backend xác thực).
- Theo nhà: tối đa M yêu cầu / ngày (UTC).
Nhiều tiến trình/replica thì giới hạn chia theo tiến trình — đủ cho demo, ghi rõ ở README.
"""

import time
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime

from .errors import AgentError

RATE_LIMITED_MESSAGE = "Bạn gửi hơi nhanh, đợi một chút rồi thử lại nhé."
DAILY_LIMITED_MESSAGE = "Nhà bạn đã dùng hết lượt hỏi trợ lý hôm nay. Mai bạn thử lại nhé."


class RateLimiter:
    def __init__(
        self,
        per_minute: int,
        per_home_daily: int,
        *,
        clock: Callable[[], float] = time.monotonic,
        today: Callable[[], str] | None = None,
    ) -> None:
        self._per_minute = per_minute
        self._daily = per_home_daily
        self._clock = clock
        self._today = today or (lambda: datetime.now(UTC).date().isoformat())
        self._hits: dict[str, deque[float]] = {}
        self._day = ""
        self._home_counts: dict[int, int] = {}
        self._ops = 0

    def hit_user(self, key: str) -> None:
        """Ghi một yêu cầu của người dùng; quá hạn mức → 429 RATE_LIMITED."""
        now = self._clock()
        self._ops += 1
        if self._ops % 500 == 0:
            self._prune(now)
        window = self._hits.setdefault(key, deque())
        while window and now - window[0] >= 60:
            window.popleft()
        if len(window) >= self._per_minute:
            retry = max(1, int(60 - (now - window[0])))
            raise AgentError(
                429, "RATE_LIMITED", RATE_LIMITED_MESSAGE, headers={"Retry-After": str(retry)}
            )
        window.append(now)

    def hit_account(self, user_id: int) -> None:
        """Như hit_user nhưng khoá theo user_id backend xác nhận — đăng nhập lại (credential mới)
        không lách được giới hạn."""
        self.hit_user(f"user:{user_id}")

    def hit_home(self, home_id: int) -> None:
        """Ghi một yêu cầu của nhà (gọi SAU khi backend xác nhận nhà thuộc người dùng)."""
        today = self._today()
        if today != self._day:
            self._day = today
            self._home_counts.clear()
        count = self._home_counts.get(home_id, 0)
        if count >= self._daily:
            raise AgentError(429, "RATE_LIMITED", DAILY_LIMITED_MESSAGE)
        self._home_counts[home_id] = count + 1

    def _prune(self, now: float) -> None:
        stale = [k for k, w in self._hits.items() if not w or now - w[-1] >= 60]
        for key in stale:
            del self._hits[key]
