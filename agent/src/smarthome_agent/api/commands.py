"""Nhận câu nói (giọng/chữ) của người dùng từ web user (qua /api/agent/*) hoặc mobile (sau).

Thứ tự voice (hợp đồng §3.1): credential/CSRF → rate limit → kiểm audio → context backend (xác
thực người dùng + nhà TRƯỚC khi tốn tiền STT) → STT → planner → guard → backend → AgentReply.
Không log cookie/token/audio/nội dung câu nói.
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, Field, ValidationError

from ..errors import INVALID_INPUT_MESSAGE, AgentError
from ..reply import AgentReply
from .deps import ServiceDep

router = APIRouter(prefix="/v1", tags=["agent"])

MAX_AUDIO_BYTES = 1_048_576
ALLOWED_AUDIO_TYPES = frozenset(
    {
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/x-m4a",
    }
)
MAX_AUDIO_SECONDS = 30.0
MAX_MESSAGE_BODY_BYTES = 16_384

HomeId = Annotated[int, Path(gt=0)]
ConversationId = Annotated[str | None, Query(max_length=64)]


class MessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    conversation_id: str | None = Field(None, max_length=64)


def _audio_too_large() -> AgentError:
    return AgentError(
        413, "AUDIO_TOO_LARGE", "Đoạn ghi âm quá dài. Bạn nói ngắn hơn giúp mình nhé."
    )


def _duration_seconds(raw: str | None) -> float | None:
    if not raw or not raw.isdigit():
        return None
    return min(int(raw) / 1000, MAX_AUDIO_SECONDS)


def _message_too_large() -> AgentError:
    return AgentError(
        413, "MESSAGE_TOO_LARGE", "Tin nhắn quá dài. Bạn nhập ngắn hơn giúp mình nhé."
    )


async def _read_limited(request: Request, limit: int, too_large: AgentError) -> bytes:
    """Đọc body theo stream, vượt `limit` byte (khai báo hoặc thực tế) thì ném `too_large`."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_large
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise too_large
        chunks.append(chunk)
    return b"".join(chunks)


async def _read_audio(request: Request) -> bytes:
    audio = await _read_limited(request, MAX_AUDIO_BYTES, _audio_too_large())
    if not audio:
        raise AgentError(
            400, "EMPTY_AUDIO", "Mình không nhận được âm thanh nào. Bạn thử nói lại nhé."
        )
    return audio


@router.post("/homes/{home_id}/voice", response_model=AgentReply)
async def post_voice(
    request: Request,
    home_id: HomeId,
    service: ServiceDep,
    conversation_id: ConversationId = None,
) -> AgentReply:
    mime_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if mime_type not in ALLOWED_AUDIO_TYPES:
        raise AgentError(
            415,
            "UNSUPPORTED_AUDIO",
            "Định dạng âm thanh này chưa được hỗ trợ. Bạn thử ghi âm lại hoặc gõ chữ nhé.",
        )
    audio = await _read_audio(request)
    return await service.handle_voice(
        home_id,
        audio,
        mime_type,
        _duration_seconds(request.headers.get("x-audio-duration-ms")),
        conversation_id,
    )


@router.post("/homes/{home_id}/messages", response_model=AgentReply)
async def post_message(request: Request, home_id: HomeId, service: ServiceDep) -> AgentReply:
    # Tự đọc body (có trần ~16 KB) thay vì để FastAPI đọc hết vào RAM; ServiceDep đã chạy xong
    # (credential/CSRF/rate limit) trước khi đọc.
    raw = await _read_limited(request, MAX_MESSAGE_BODY_BYTES, _message_too_large())
    try:
        body = MessageRequest.model_validate_json(raw)
    except ValidationError:
        # Không trả lại giá trị người dùng gửi (câu nói) trong thông điệp lỗi.
        raise AgentError(400, "INVALID_INPUT", INVALID_INPUT_MESSAGE) from None
    return await service.handle_text(home_id, body.text, body.conversation_id)
