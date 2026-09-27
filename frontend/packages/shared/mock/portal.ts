import { FetchError } from "@smarthome/shared/api/errors";
import * as seed from "@smarthome/shared/mock/seed";
import {
  automationStore, customerStore, deviceStore, gatewayStore, homeMemberStore, mockDelay, roomStore, smartHomeStore,
} from "@smarthome/shared/mock/store";
import type {
  ActivationCode, AutomationRule, ClaimErrorCode, Customer, CustomerNotification, HabitSuggestion,
  HomeMember, MemberRole, MockDevice, Room, SmartHome,
} from "@smarthome/shared/mock/types";

// ---------------------------------------------------------------------------
// Mock của API kênh khách hàng (/api/mobile/**) cho cổng User. Mọi hàm nhận
// customerId của phiên và tự kiểm tra 2 tầng như backend thật (FR-6.1):
//   - không phải thành viên nhà → 404 (không để lộ nhà tồn tại)
//   - là thành viên nhưng role trong nhà không đủ → 403
// Khi có backend, thay thân hàm bằng fetch — giữ nguyên chữ ký.
// ---------------------------------------------------------------------------

let _codes: ActivationCode[] = [...seed.activationCodes];
const _power: Record<number, boolean> = { ...seed.devicePower };
let _notifications: CustomerNotification[] = [...seed.customerNotifications];
let _suggestions: HabitSuggestion[] = [...seed.habitSuggestions];
const _claimFailures: { customerId: number; at: number }[] = [];

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CLAIM_LOCK_WINDOW_MS = 15 * 60 * 1000;
const CLAIM_MAX_FAILURES = 5;

function fail(status: number, error: string): never {
  throw new FetchError(status, { error });
}

// ---------------------------------------------------------------------------
// Quyền trong nhà (PRD §3.2). GUEST chưa có danh sách thiết bị được chỉ định
// trong mock nên chưa được điều khiển gì.
// ---------------------------------------------------------------------------
export type HomePermissions = {
  canControl: boolean;
  canManageAutomation: boolean;
  canDeleteAutomation: boolean;
  canManageMembers: boolean;
  isOwner: boolean;
};

export function permissionsFor(role: MemberRole): HomePermissions {
  const isOwner = role === "OWNER";
  const canControl = isOwner || role === "CONTROLLER";
  return {
    canControl,
    canManageAutomation: canControl,
    canDeleteAutomation: isOwner,
    canManageMembers: isOwner,
    isOwner,
  };
}

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: "Chủ nhà",
  CONTROLLER: "Điều khiển",
  VIEWER: "Chỉ xem",
  GUEST: "Khách",
};

function membership(customerId: number, homeId: number): { home: SmartHome; member: HomeMember } {
  const home = smartHomeStore.get(homeId);
  const member = homeMemberStore
    .listByHome(homeId)
    .find((m) => m.customer_id === customerId && !m.invite_expires_at);
  if (!home || !member) fail(404, "NOT_FOUND");
  return { home, member };
}

function requirePermission(role: MemberRole, key: keyof HomePermissions) {
  if (!permissionsFor(role)[key]) fail(403, "FORBIDDEN");
}

export async function getMyProfile(customerId: number): Promise<Customer> {
  const customer = customerStore.get(customerId);
  if (!customer) fail(404, "NOT_FOUND");
  return mockDelay(customer);
}

// ---------------------------------------------------------------------------
// Thiết bị
// ---------------------------------------------------------------------------
export type PortalDevice = MockDevice & {
  online: boolean;
  // null = cảm biến, không có kênh relay để bật/tắt.
  power: boolean | null;
  room_name: string;
};

function toPortalDevice(d: MockDevice): PortalDevice {
  return {
    ...d,
    // Mock không có heartbeat thật — dùng trạng thái thiết bị làm trạng thái kết nối.
    online: d.status === "active",
    power: d.id in _power ? _power[d.id] : null,
    room_name: roomStore.get(d.room_id)?.name ?? "—",
  };
}

export type RoomSummary = Room & { device_count: number; on_count: number };

function summarizeRoom(room: Room): RoomSummary {
  const devices = deviceStore.listByRoom(room.id).map(toPortalDevice);
  return { ...room, device_count: devices.length, on_count: devices.filter((d) => d.power).length };
}

export type MyHome = { home: SmartHome; role: MemberRole; device_count: number; online_count: number };

export async function listMyHomes(customerId: number): Promise<MyHome[]> {
  const homes = homeMemberStore
    .listByCustomer(customerId)
    .filter((m) => !m.invite_expires_at)
    .flatMap((m) => {
      const home = smartHomeStore.get(m.home_id);
      if (!home) return [];
      const devices = deviceStore.listByHome(home.id).map(toPortalDevice);
      return [{ home, role: m.role, device_count: devices.length, online_count: devices.filter((d) => d.online).length }];
    });
  return mockDelay(homes);
}

export type HomeOverview = {
  home: SmartHome;
  role: MemberRole;
  gateway: { status: "online" | "offline"; last_seen: string | null } | null;
  rooms: RoomSummary[];
  devices: PortalDevice[];
  open_alerts: number;
};

export async function getHomeOverview(customerId: number, homeId: number): Promise<HomeOverview> {
  const { home, member } = membership(customerId, homeId);
  const gateway = gatewayStore.getByHome(homeId);
  return mockDelay({
    home,
    role: member.role,
    gateway: gateway ? { status: gateway.status, last_seen: gateway.last_seen } : null,
    rooms: roomStore.listByHome(homeId).map(summarizeRoom),
    devices: deviceStore.listByHome(homeId).map(toPortalDevice),
    open_alerts: _notifications.filter(
      (n) => n.home_id === homeId && !n.is_read && (n.severity === "critical" || n.severity === "warning")
    ).length,
  });
}

export async function getRoom(customerId: number, roomId: number) {
  const room = roomStore.get(roomId);
  if (!room) fail(404, "NOT_FOUND");
  const { home, member } = membership(customerId, room.home_id);
  return mockDelay({
    room: summarizeRoom(room),
    home,
    role: member.role,
    devices: deviceStore.listByRoom(roomId).map(toPortalDevice),
  });
}

export async function getDevice(customerId: number, deviceId: number) {
  const device = deviceStore.get(deviceId);
  if (!device) fail(404, "NOT_FOUND");
  const { home, member } = membership(customerId, device.home_id);
  return mockDelay({
    device: toPortalDevice(device),
    room: roomStore.get(device.room_id),
    home,
    role: member.role,
  });
}

// FR-5.3 / FR-5.5 / FR-5.9 — UI cập nhật lạc quan trước, hàm này là "xác nhận"
// của thiết bị; lỗi thì UI hoàn tác.
export async function setDevicePower(customerId: number, deviceId: number, on: boolean): Promise<PortalDevice> {
  const device = deviceStore.get(deviceId);
  if (!device) fail(404, "NOT_FOUND");
  const { member } = membership(customerId, device.home_id);
  requirePermission(member.role, "canControl");
  const current = toPortalDevice(device);
  if (current.power === null) fail(400, "NOT_CONTROLLABLE");
  await mockDelay(undefined, 700);
  if (!current.online) fail(409, "DEVICE_OFFLINE");
  _power[deviceId] = on;
  return toPortalDevice(device);
}

// ---------------------------------------------------------------------------
// Thông báo (FR-8.2, FR-8.4)
// ---------------------------------------------------------------------------
export async function listHomeNotifications(customerId: number, homeId: number) {
  membership(customerId, homeId);
  const notifications = _notifications
    .filter((n) => n.home_id === homeId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return mockDelay({ notifications, unread_count: notifications.filter((n) => !n.is_read).length });
}

export async function markNotificationRead(customerId: number, id: number) {
  const target = _notifications.find((n) => n.id === id);
  if (!target) fail(404, "NOT_FOUND");
  membership(customerId, target.home_id);
  _notifications = _notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
  return mockDelay(undefined, 100);
}

export async function markAllNotificationsRead(customerId: number, homeId: number) {
  membership(customerId, homeId);
  _notifications = _notifications.map((n) => (n.home_id === homeId ? { ...n, is_read: true } : n));
  return mockDelay(undefined, 100);
}

// ---------------------------------------------------------------------------
// Thành viên (FR-6.2 → 6.4)
// ---------------------------------------------------------------------------
export type PortalMember = HomeMember & { is_me: boolean; pending: boolean };

export async function listMembers(customerId: number, homeId: number): Promise<PortalMember[]> {
  membership(customerId, homeId);
  return mockDelay(
    homeMemberStore.listByHome(homeId).map((m) => ({
      ...m,
      is_me: m.customer_id === customerId,
      pending: !!m.invite_expires_at,
    }))
  );
}

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

export async function inviteMember(
  customerId: number, homeId: number, input: { name: string; email: string; role: Exclude<MemberRole, "OWNER"> },
) {
  const { member } = membership(customerId, homeId);
  requirePermission(member.role, "canManageMembers");
  if (!input.name.trim() || !/^\S+@\S+\.\S+$/.test(input.email.trim())) fail(400, "INVALID_INPUT");
  const created = homeMemberStore.add({
    home_id: homeId,
    name: input.name.trim(),
    initials: initialsOf(input.name),
    role: input.role,
    customer_id: null,
    invite_expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });
  return mockDelay(created);
}

function manageableMember(customerId: number, memberId: number) {
  const target = homeMemberStore.get(memberId);
  if (!target) fail(404, "NOT_FOUND");
  const { member } = membership(customerId, target.home_id);
  requirePermission(member.role, "canManageMembers");
  // Chủ nhà không tự đổi role/xoá mình — phải chuyển quyền sở hữu trước (FR-6.5).
  if (target.role === "OWNER") fail(403, "FORBIDDEN");
  return target;
}

export async function changeMemberRole(customerId: number, memberId: number, role: Exclude<MemberRole, "OWNER">) {
  manageableMember(customerId, memberId);
  return mockDelay(homeMemberStore.update(memberId, { role }));
}

export async function removeMember(customerId: number, memberId: number) {
  manageableMember(customerId, memberId);
  homeMemberStore.remove(memberId);
  return mockDelay(undefined);
}

export async function leaveHome(customerId: number, homeId: number) {
  const { member } = membership(customerId, homeId);
  if (member.role === "OWNER") fail(403, "FORBIDDEN");
  homeMemberStore.remove(member.id);
  return mockDelay(undefined);
}

// ---------------------------------------------------------------------------
// Tự động hoá (FR-7.1, 7.2) + gợi ý thói quen (FR-7.5, 7.6)
// ---------------------------------------------------------------------------
export async function listAutomation(customerId: number, homeId: number): Promise<AutomationRule[]> {
  membership(customerId, homeId);
  return mockDelay(automationStore.listByHome(homeId));
}

function ruleForManage(customerId: number, ruleId: number, key: keyof HomePermissions) {
  const rule = automationStore.list().find((r) => r.id === ruleId);
  if (!rule) fail(404, "NOT_FOUND");
  const { member } = membership(customerId, rule.home_id);
  requirePermission(member.role, key);
  return rule;
}

export async function toggleAutomation(customerId: number, ruleId: number) {
  ruleForManage(customerId, ruleId, "canManageAutomation");
  return mockDelay(automationStore.toggle(ruleId));
}

export async function deleteAutomation(customerId: number, ruleId: number) {
  ruleForManage(customerId, ruleId, "canDeleteAutomation");
  automationStore.delete(ruleId);
  return mockDelay(undefined);
}

export async function createAutomation(
  customerId: number, homeId: number, rule: Omit<AutomationRule, "id" | "enabled" | "home_id">,
) {
  const { member } = membership(customerId, homeId);
  requirePermission(member.role, "canManageAutomation");
  const room = roomStore.get(rule.trigger_room_id);
  const device = deviceStore.get(rule.action_device_id);
  // Không cho tham chiếu phòng/thiết bị của nhà khác.
  if (!rule.name.trim() || room?.home_id !== homeId || device?.home_id !== homeId) fail(400, "INVALID_INPUT");
  return mockDelay(automationStore.create({ ...rule, name: rule.name.trim(), home_id: homeId }));
}

export async function listSuggestions(customerId: number, homeId: number): Promise<HabitSuggestion[]> {
  membership(customerId, homeId);
  return mockDelay(_suggestions.filter((s) => s.home_id === homeId));
}

// Chấp nhận chỉ ghi nhận lịch — hệ thống không tự điều khiển thiết bị từ gợi ý
// chưa được duyệt (bất biến #8).
export async function respondSuggestion(customerId: number, suggestionId: number, accept: boolean) {
  const suggestion = _suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) fail(404, "NOT_FOUND");
  const { member } = membership(customerId, suggestion.home_id);
  requirePermission(member.role, "canManageAutomation");
  if (suggestion.status !== "pending") fail(409, "ALREADY_RESPONDED");
  _suggestions = _suggestions.map((s) =>
    s.id === suggestionId ? { ...s, status: accept ? ("accepted" as const) : ("dismissed" as const) } : s
  );
  return mockDelay(undefined);
}

// ---------------------------------------------------------------------------
// Claim Smart Home bằng Activation Code (FR-3.2 → 3.6)
// ---------------------------------------------------------------------------

// Bỏ ký tự thừa, viết hoa, tự chèn gạch: "7k2m9qxa" → "7K2M-9QXA".
export function normalizeActivationCode(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 12);
  return chars.match(/.{1,4}/g)?.join("-") ?? "";
}

function claimFail(customerId: number, code: ClaimErrorCode, status: number): never {
  if (code !== "RATE_LIMITED") _claimFailures.push({ customerId, at: Date.now() });
  fail(status, code);
}

export async function claimHome(customerId: number, rawCode: string): Promise<SmartHome> {
  await mockDelay(undefined, 500);
  const recentFailures = _claimFailures.filter(
    (f) => f.customerId === customerId && Date.now() - f.at < CLAIM_LOCK_WINDOW_MS
  ).length;
  if (recentFailures >= CLAIM_MAX_FAILURES) claimFail(customerId, "RATE_LIMITED", 429);

  const code = normalizeActivationCode(rawCode);
  const record = _codes.find((c) => c.code === code);
  if (!record) claimFail(customerId, "NOT_FOUND", 404);
  if (record.status !== "unused") claimFail(customerId, "ALREADY_USED", 409);
  if (new Date(record.expires_at).getTime() < Date.now()) claimFail(customerId, "EXPIRED", 410);
  const home = smartHomeStore.get(record.home_id);
  if (!home || home.status !== "unclaimed") claimFail(customerId, "ALREADY_USED", 409);

  // Mọi bước dưới đây là "một transaction" (FR-3.4) — mock chạy đồng bộ nên
  // không có trạng thái ghi dở.
  const customerMember = homeMemberStore.listByCustomer(customerId)[0];
  smartHomeStore.assignOwner(home.id, customerId, "code");
  homeMemberStore.add({
    home_id: home.id,
    name: customerMember?.name ?? `Khách hàng #${customerId}`,
    initials: customerMember?.initials ?? "KH",
    role: "OWNER",
    customer_id: customerId,
  });
  _codes = _codes.map((c) => (c.code === code ? { ...c, status: "used" as const } : c));
  return smartHomeStore.get(home.id) as SmartHome;
}
