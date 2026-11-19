from fastapi import APIRouter

from ..config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    # Chỉ báo đã cấu hình hay chưa — không bao giờ trả key/token.
    return {
        "status": "ok",
        "llm_configured": settings.llm_configured,
        "stt_ready": settings.stt_ready,
        "backend_configured": settings.backend_configured,
    }
