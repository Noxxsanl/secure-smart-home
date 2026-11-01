from fastapi import APIRouter

from ..config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    # Chỉ báo đã cấu hình hay chưa — không bao giờ trả key.
    return {
        "status": "ok",
        "llm_configured": settings.llm_configured,
        "stt_provider": settings.stt_provider,
    }
