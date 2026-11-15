// Module agent: Trợ lý AI giọng nói/chữ (giai đoạn 2). Dịch vụ Python `agent/` lo STT + LLM; backend giữ LUẬT TẤT ĐỊNH — quyền,
// loại thiết bị, giờ hợp lệ, "nói rõ thì làm ngay hoặc tự hẹn giờ / còn lại chờ xác nhận" — và mọi thứ chạm thiết bị đều đi qua
// scheduled_actions + sendDeviceCommand (source ai_agent). Sở hữu agent_requests. Phụ thuộc schedules chỉ qua facade.
//
// Bảng route:
//   service  (/api/service, sau requireServiceToken; mỗi route thêm requireActingUser = người dùng mà agent thay mặt)
//     GET  /agent/homes/:homeId/context     get-agent-context
//     POST /agent/homes/:homeId/requests    create-agent-request
//   customer (/api/portal [web] + /api/mobile [mobile], cùng handler)
//     GET  /agent/requests/:requestId           get-agent-request
//     POST /agent/requests/:requestId/confirm   confirm-agent-request
//     POST /agent/requests/:requestId/reject    reject-agent-request
import type { AppModule } from "../../shared/module";
import { requireActingUser } from "../identity";
import { confirmAgentRequestController } from "./features/confirm-agent-request/confirm-agent-request.controller";
import { createAgentRequestController } from "./features/create-agent-request/create-agent-request.controller";
import { getAgentContextController } from "./features/get-agent-context/get-agent-context.controller";
import { getAgentRequestController } from "./features/get-agent-request/get-agent-request.controller";
import { rejectAgentRequestController } from "./features/reject-agent-request/reject-agent-request.controller";

export const agentModule: AppModule = {
  name: "agent",
  service: (router) => {
    // Middleware gắn theo TỪNG route (không router.use không path) để không áp lên route service của module khác.
    router.get("/agent/homes/:homeId/context", requireActingUser, getAgentContextController);
    router.post("/agent/homes/:homeId/requests", requireActingUser, createAgentRequestController);
  },
  customer: (router, channel) => {
    router.get("/agent/requests/:requestId", getAgentRequestController);
    router.post("/agent/requests/:requestId/confirm", confirmAgentRequestController(channel));
    router.post("/agent/requests/:requestId/reject", rejectAgentRequestController);
  },
};
