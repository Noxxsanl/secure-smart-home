"""Khởi tạo app HTTP. Chạy: `uvicorn smarthome_agent.main:app` hoặc `smarthome-agent`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .api import router
from .api.deps import get_runtime
from .config import get_settings
from .errors import INVALID_INPUT_MESSAGE, UNAVAILABLE_MESSAGE, AgentError

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    # Đóng client HTTP dùng chung (chỉ khi runtime đã được tạo).
    if get_runtime.cache_info().currsize:
        await get_runtime().aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Smart Home Agent",
        version=__version__,
        lifespan=_lifespan,
        # Không công khai schema API ở production.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "X-Portal", "X-Audio-Duration-Ms"],
    )

    @app.exception_handler(AgentError)
    async def _agent_error(_: Request, exc: AgentError) -> JSONResponse:
        return JSONResponse(exc.body(), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _invalid_input(_: Request, __: RequestValidationError) -> JSONResponse:
        # Không trả lại giá trị người dùng gửi (câu nói) trong thông điệp lỗi.
        return JSONResponse(
            {"error": "INVALID_INPUT", "message": INVALID_INPUT_MESSAGE},
            status_code=400,
        )

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.error("Lỗi không lường trước: %s", type(exc).__name__)
        return JSONResponse(
            {"error": "AGENT_UNAVAILABLE", "message": UNAVAILABLE_MESSAGE}, status_code=503
        )

    app.include_router(router)
    return app


app = create_app()


def run() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "smarthome_agent.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )


if __name__ == "__main__":
    run()
