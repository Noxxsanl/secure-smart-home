import { PORTAL_API } from "./client";

// ---------------------------------------------------------------------------
// Khoá SWR (= đường dẫn API) của tài nguyên mà nhiều module cùng làm mới sau
// thao tác ghi — VD bật/tắt thiết bị (@shh/devices) làm mới overview và phòng
// (@shh/homes). Khoá chỉ một module dùng thì nằm trong api/ của module đó.
// ---------------------------------------------------------------------------

/** GET /homes — mọi nhà mà tôi là thành viên hiệu lực. */
export const homesKey = `${PORTAL_API}/homes`;
/** Tiền tố của mọi truy vấn theo nhà (overview, members, automations, suggestions). */
export const homeScopeKey = (homeId: number) => `${PORTAL_API}/homes/${homeId}`;
export const overviewKey = (homeId: number) => `${PORTAL_API}/homes/${homeId}/overview`;
export const roomsPrefix = `${PORTAL_API}/rooms`;
export const roomKey = (roomId: number) => `${PORTAL_API}/rooms/${roomId}`;
export const devicesPrefix = `${PORTAL_API}/devices`;
export const deviceKey = (deviceId: number) => `${PORTAL_API}/devices/${deviceId}`;
export const notificationsPrefix = `${PORTAL_API}/notifications`;
