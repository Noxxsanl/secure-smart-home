"""Endpoint nhận câu lệnh từ web/mobile và gateway."""

from fastapi import APIRouter

from .commands import router as commands_router
from .health import router as health_router

router = APIRouter()
router.include_router(health_router)
router.include_router(commands_router)
