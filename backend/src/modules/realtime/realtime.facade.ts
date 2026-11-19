// Hàm module khác được gọi: main.ts gắn WebSocket hub vào HTTP server sau khi listen (module không có route
// hay worker nên không có realtime.module.ts). Chỉ re-export — không thêm logic ở đây.
export { attachWsHub } from "./features/mobile-ws/mobile-ws.gateway";
