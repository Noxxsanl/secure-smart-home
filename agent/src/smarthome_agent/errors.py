"""Lỗi nghiệp vụ của agent: mã ổn định + câu tiếng Việt cho người dùng (bất biến số 10).

Thông điệp là chuỗi cố định — KHÔNG đưa header, cookie, token, nội dung câu nói vào đây
(bất biến số 2): lỗi này được trả nguyên cho trình duyệt và có thể bị log.
"""

UNAVAILABLE_MESSAGE = "Trợ lý đang tạm bận. Bạn vẫn có thể bật/tắt hoặc hẹn giờ thủ công."
SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn, bạn đăng nhập lại nhé."


INVALID_INPUT_MESSAGE = "Yêu cầu chưa hợp lệ. Câu nói cần từ 1 đến 500 ký tự."
ACCOUNT_LOCKED_MESSAGE = "Tài khoản của bạn đang bị khoá. Hãy liên hệ bộ phận hỗ trợ."
FORBIDDEN_MESSAGE = "Tài khoản của bạn chưa được phép thực hiện thao tác này trong nhà này."


class AgentError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers

    def body(self) -> dict[str, str]:
        return {"error": self.code, "message": self.message}


def unavailable() -> AgentError:
    return AgentError(503, "AGENT_UNAVAILABLE", UNAVAILABLE_MESSAGE)


def session_expired() -> AgentError:
    return AgentError(401, "SESSION_EXPIRED", SESSION_EXPIRED_MESSAGE)


def account_locked() -> AgentError:
    return AgentError(403, "ACCOUNT_LOCKED", ACCOUNT_LOCKED_MESSAGE)


def forbidden() -> AgentError:
    return AgentError(403, "FORBIDDEN", FORBIDDEN_MESSAGE)
