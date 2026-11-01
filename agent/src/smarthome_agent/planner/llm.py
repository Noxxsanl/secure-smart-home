"""Adapter nhà cung cấp LLM. Đổi nhà cung cấp chỉ cần viết adapter mới (đề xuất §11.1)."""

from functools import lru_cache

from openai import AsyncOpenAI

from ..config import get_settings


@lru_cache
def get_openai_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.llm_configured:
        raise RuntimeError("Chưa đặt OPENAI_API_KEY trong agent/.env")
    return AsyncOpenAI(
        api_key=settings.openai_api_key.get_secret_value(),
        base_url=settings.openai_base_url,
        organization=settings.openai_org_id,
        project=settings.openai_project_id,
        timeout=settings.openai_timeout_s,
        # Hết giờ thì chuyển fallback ngay, không thử lại kéo dài độ trễ.
        max_retries=0,
    )
