"""Đọc số token từ trường `usage` của response, chuẩn hoá về TokenUsage.

Nhận object của SDK (thuộc tính) hoặc dict (JSON thô) — chỉ đọc số, không đọc nội dung.
"""

from typing import Any

from .models import TokenUsage


def _get(obj: Any, name: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def _int(value: Any) -> int:
    return value if isinstance(value, int) and value > 0 else 0


def openai_usage(usage: Any) -> TokenUsage:
    """OpenAI Chat Completions (prompt/completion_tokens) hoặc Responses API (input/output_tokens).

    OpenAI tính cached_tokens NẰM TRONG prompt/input tokens; không có token ghi cache.
    """
    if _get(usage, "prompt_tokens") is not None or _get(usage, "completion_tokens") is not None:
        input_tokens = _int(_get(usage, "prompt_tokens"))
        output_tokens = _int(_get(usage, "completion_tokens"))
        cached = _int(_get(_get(usage, "prompt_tokens_details"), "cached_tokens"))
        reasoning = _int(_get(_get(usage, "completion_tokens_details"), "reasoning_tokens"))
    else:
        input_tokens = _int(_get(usage, "input_tokens"))
        output_tokens = _int(_get(usage, "output_tokens"))
        cached = _int(_get(_get(usage, "input_tokens_details"), "cached_tokens"))
        reasoning = _int(_get(_get(usage, "output_tokens_details"), "reasoning_tokens"))
    return TokenUsage(
        input_tokens=input_tokens,
        cached_input_tokens=min(cached, input_tokens),
        output_tokens=output_tokens,
        reasoning_tokens=min(reasoning, output_tokens),
    )


def anthropic_usage(usage: Any) -> TokenUsage:
    """Anthropic Messages API: input_tokens KHÔNG gồm cache_read/cache_creation.

    Cộng cả ba thành tổng token vào cho khớp quy ước của TokenUsage.
    """
    uncached = _int(_get(usage, "input_tokens"))
    cache_read = _int(_get(usage, "cache_read_input_tokens"))
    cache_write = _int(_get(usage, "cache_creation_input_tokens"))
    return TokenUsage(
        input_tokens=uncached + cache_read + cache_write,
        cached_input_tokens=cache_read,
        cache_write_tokens=cache_write,
        output_tokens=_int(_get(usage, "output_tokens")),
    )
