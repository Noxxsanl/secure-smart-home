// Nhãn tiếng Việt ngắn cho từng event_type trên timeline của nhà (CONTRACT_V2 §5 TimelineEvent).
// Timeline dựng từ audit_log của nhà ở các category provision, activity, gateway; mô tả chi tiết là
// cột `message` (do nơi ghi log điền, tiếng Việt). Event chưa có nhãn → TIMELINE_FALLBACK_LABEL.

/** Category của audit_log được đưa vào timeline nhà. */
export const TIMELINE_CATEGORIES = ["provision", "activity", "gateway"] as const;

export const TIMELINE_FALLBACK_LABEL = "Sự kiện hệ thống";

export const TIMELINE_LABELS: Readonly<Record<string, string>> = {
  // provision
  HOME_CREATED: "Tạo nhà mới",
  ACTIVATION_CODE_CREATED: "Tạo mã kích hoạt",
  ACTIVATION_CODE_REVOKED: "Thu hồi mã kích hoạt",
  ACTIVATION_SUCCESS: "Kích hoạt thành công",
  ACTIVATION_FAILED: "Kích hoạt thất bại",
  OWNER_ASSIGNED: "Gán chủ nhà",
  HOME_STATUS_CHANGED: "Đổi trạng thái nhà",
  // activity
  MEMBER_INVITED: "Mời thành viên",
  MEMBER_JOINED: "Thành viên tham gia",
  MEMBER_ROLE_CHANGED: "Đổi quyền thành viên",
  MEMBER_REMOVED: "Xoá thành viên",
  MEMBER_LEFT: "Thành viên rời nhà",
  INVITE_DECLINED: "Từ chối lời mời",
  HOME_RENAMED: "Đổi tên nhà",
  ROOM_RENAMED: "Đổi tên phòng",
  OPERATOR_ACCESS_GRANTED: "Cấp quyền truy cập cho Operator",
  OPERATOR_ACCESS_REVOKED: "Thu hồi quyền truy cập Operator",
  OPERATOR_HOME_VIEWED: "Operator xem dữ liệu nhà",
  // gateway
  GATEWAY_ONLINE: "Gateway trực tuyến",
  GATEWAY_OFFLINE: "Gateway mất kết nối",
  GATEWAY_RESTART: "Khởi động lại gateway",
  GATEWAY_FACTORY_RESET: "Khôi phục cài đặt gốc gateway",
};

export function timelineLabel(eventType: string): string {
  return TIMELINE_LABELS[eventType] ?? TIMELINE_FALLBACK_LABEL;
}
