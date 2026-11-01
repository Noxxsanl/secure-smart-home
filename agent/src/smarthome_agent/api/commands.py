"""Nhận câu lệnh tiếng Việt của người dùng.

Agent không tự xác thực người dùng: Bearer token được chuyển nguyên cho backend, backend kiểm
JWT + RBAC 2 tầng (nhà không thuộc quyền → 404, sai role → 403 — bất biến số 6).
"""

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1", tags=["commands"])


class MessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    conversation_id: str | None = None


@router.post("/homes/{home_id}/messages", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def post_message(
    home_id: int,
    body: MessageRequest,
    authorization: str = Header(...),
) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")
    # TODO: planner → guard → trả câu trả lời / thẻ kế hoạch.
    return {"error": "AGENT_UNAVAILABLE", "detail": "Trợ lý đang được xây dựng."}
