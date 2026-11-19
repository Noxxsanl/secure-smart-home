// Hàm của module notifications mà module khác được gọi (qua index.ts). Chỉ re-export — cài đặt nằm ở domain/ và infrastructure/.
// notify* KHÔNG BAO GIỜ ném lỗi (thông báo thất bại không được làm hỏng nghiệp vụ chính).
export { notifyHomeMembers, notifyStaff, notifyUser } from "./domain/notify.service";
export { countUnreadStaff } from "./infrastructure/staff-notifications.repository";
