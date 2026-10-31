// @shh/homes — Smart Home. Console: danh sách, chi tiết, provisioning. Cổng khách: tổng quan, phòng,
// thành viên, lời mời, kích hoạt bằng Activation Code. Phần của module khác (log, lưới thiết bị)
// nhận qua slot `render*` do trang của app ghép.

export type { DeviceGridSlotProps, RenderDevices } from "./model/slots";

// Console
export { SmartHomeListPage } from "./features/smart-home-list";
export { SmartHomeDetailPage, type HomeLogSlotProps } from "./features/smart-home-detail";
export { ProvisioningWizardPage } from "./features/provisioning";

// Cổng khách
export { HomeOverviewPage } from "./features/home-overview";
export { RoomListPage } from "./features/room-list";
export { RoomDetailPage } from "./features/room-detail";
export { MembersPage } from "./features/members";
export { MyInvitations } from "./features/my-invitations";
export { ClaimHomePage } from "./features/claim";
