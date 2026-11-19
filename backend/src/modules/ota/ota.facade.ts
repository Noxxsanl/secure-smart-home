// Hàm + kiểu module khác được gọi (module stats: badge OTA đang chạy + danh sách đợt đang triển khai).
// Chỉ re-export — không thêm logic ở đây.
export type { OtaDeployment } from "./domain/ota.types";
export { countRunningJobs } from "./infrastructure/ota.repository";
export { listDeployments } from "./infrastructure/ota.read-model";
