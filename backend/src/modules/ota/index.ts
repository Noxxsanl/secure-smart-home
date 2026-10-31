// Cửa ra DUY NHẤT của module ota: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
export { otaModule } from "./ota.module";
export { countRunningJobs, listDeployments } from "./ota.facade";
export type { OtaDeployment } from "./ota.facade";
