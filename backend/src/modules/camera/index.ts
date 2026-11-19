// Cửa ra DUY NHẤT của module camera: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Module phơi route + worker (cameraModule) và attachCameraLive (WebSocket camera live; main.ts gọi — camera.facade.ts).
export { cameraModule } from "./camera.module";
export { attachCameraLive } from "./camera.facade";
export type { CameraSnapshotSummary, SnapshotTrigger } from "./domain/camera.types";
