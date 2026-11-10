// Cửa ra DUY NHẤT của module camera: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Module chỉ phơi route + worker; chưa có hàm nào cho module khác gọi nên không có camera.facade.ts.
export { cameraModule } from "./camera.module";
export type { CameraSnapshotSummary, SnapshotTrigger } from "./domain/camera.types";
