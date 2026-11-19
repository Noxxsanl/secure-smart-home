// Cửa ra DUY NHẤT của module notifications: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Danh sách tường minh — thêm export mới ở notifications.facade.ts rồi liệt kê ở đây.
export { notificationsModule } from "./notifications.module";
export { countUnreadStaff, notifyHomeMembers, notifyStaff, notifyUser } from "./notifications.facade";
export type { CustomerNotification, StaffNotification, StaffTargetRole } from "./domain/notification.types";
export type { NotifyHomeMembersInput, NotifyStaffInput, NotifyUserInput } from "./domain/notify.service";
