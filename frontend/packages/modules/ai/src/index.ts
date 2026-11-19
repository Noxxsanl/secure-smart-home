// @shh/ai — hai phần:
//  - Console: tab AI Usage — chi phí, token, độ trễ, lỗi của LLM/STT mà AI Agent dùng; bảng giá model, ngân sách ngày,
//    tỷ giá USD→VNĐ. Số liệu thật từ /api/dashboard/ai-usage/** (không có dữ liệu mẫu).
//  - Cổng khách (app `user`): Trợ lý AI giọng nói/chữ — nút micro ở header (`AssistantLauncher`) mở ngăn kéo hội thoại.
//    Nói/gõ → AI Agent (/api/agent/**); xác nhận/từ chối → /api/portal/agent/requests/**; huỷ lịch → /api/portal/schedules/**.
export { AiUsagePage } from "./features/ai-usage";
export { AssistantLauncher } from "./features/assistant";
