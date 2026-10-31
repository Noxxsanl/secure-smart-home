// Hợp đồng giữa một module và composition root (app.module.ts) — thay cho @Module của NestJS.
// Module KHÔNG tự mount vào app: nó khai báo route theo KÊNH và worker nền; app.module.ts gắn guard của kênh
// rồi gọi các hàm dưới đây theo thứ tự trong APP_MODULES.
//
// Quy tắc khi khai báo route: router của kênh dùng chung cho mọi module, nên module không bao giờ gọi
// `router.use(middleware)` không kèm đường dẫn (sẽ áp lên route của module khác). Middleware riêng gắn theo từng
// route, hoặc gom route vào router con mount dưới tiền tố của module (`router.use("/firmware", sub)`).
import type { Router } from "express";
import type { CustomerChannel } from "./types/domain";

export interface ModuleWorker {
  /** Tên in trong log khởi động khi start() ném lỗi. */
  name: string;
  /** Gọi 1 lần sau khi server listen; tự chống gọi lặp; không được ném lỗi làm sập server. */
  start: () => void;
}

export interface AppModule {
  name: string;
  /** Ngay dưới /api — chỉ dành cho route legacy của Prototype. */
  api?: (router: Router) => void;
  /** /api/device/** — firmware, xác thực HMAC (không có phiên người dùng). */
  device?: (router: Router) => void;
  /** /api/dashboard/** — đã qua requireDashboard("admin", "operator"); dùng getAuth(req). */
  dashboard?: (router: Router) => void;
  /** /api/portal/** (channel "web") và /api/mobile/** (channel "mobile") — đã qua guard USER của kênh. */
  customer?: (router: Router, channel: CustomerChannel) => void;
  workers?: readonly ModuleWorker[];
}
