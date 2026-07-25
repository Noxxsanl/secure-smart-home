import * as seed from "@/shared/mock/seed";
import type {
  ActivationRecord, AutomationRule, Camera, Customer,
  FirmwareVersion, Gateway, HomeMember, HomeTimelineEvent, LogCategory,
  LogEntry, MockDevice, MockNotification, OperatorAccessGrant, OtaDeployment,
  Room, SmartHome, StaffAccount, WarrantyRecord,
} from "@/shared/mock/types";
import type { ApiDeviceStatus, AuditLogEntry, ApiSensorData } from "@/shared/types/api";

// ---------------------------------------------------------------------------
// In-memory mock "database". Module-level singletons so state (mutations from
// one page) is visible from every other page within the same dev-server
// session, mirroring what a real backend + SWR revalidation would do.
// ---------------------------------------------------------------------------

const _customers: Customer[] = [...seed.customers];
let _smartHomes: SmartHome[] = [...seed.smartHomes];
let _rooms: Room[] = [...seed.rooms];
const _homeMembers: HomeMember[] = [...seed.homeMembers];
let _gateways: Gateway[] = [...seed.gateways];
let _devices: MockDevice[] = [...seed.devices];
const _cameras: Camera[] = [...seed.cameras];
let _automationRules: AutomationRule[] = [...seed.automationRules];
let _firmwareVersions: FirmwareVersion[] = [...seed.firmwareVersions];
let _otaDeployments: OtaDeployment[] = [...seed.otaDeployments];
const _warrantyRecords: WarrantyRecord[] = [...seed.warrantyRecords];
let _activationRecords: ActivationRecord[] = [...seed.activationRecords];
let _operatorAccessGrants: OperatorAccessGrant[] = [...seed.operatorAccessGrants];
let _homeTimelineEvents: HomeTimelineEvent[] = [...seed.homeTimelineEvents];
let _logEntries: LogEntry[] = [...seed.logEntries];
let _notifications: MockNotification[] = [...seed.notifications];
let _staffAccounts: StaffAccount[] = [...seed.staffAccounts];

let nextDeviceId = Math.max(..._devices.map((d) => d.id)) + 1;
let nextHomeId = Math.max(..._smartHomes.map((h) => h.id)) + 1;
let nextGatewayId = Math.max(..._gateways.map((g) => g.id)) + 1;
let nextRoomId = Math.max(..._rooms.map((r) => r.id)) + 1;
let nextAutomationId = Math.max(..._automationRules.map((a) => a.id)) + 1;
let nextAccessGrantId = Math.max(..._operatorAccessGrants.map((g) => g.id)) + 1;
let nextStaffId = Math.max(..._staffAccounts.map((s) => s.id)) + 1;
let nextFirmwareId = Math.max(..._firmwareVersions.map((f) => f.id)) + 1;
let nextDeploymentId = Math.max(..._otaDeployments.map((d) => d.id)) + 1;
let nextActivationId = Math.max(..._activationRecords.map((a) => a.id)) + 1;
let nextTimelineId = Math.max(..._homeTimelineEvents.map((e) => e.id)) + 1;

export function mockDelay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export const customerStore = {
  list: () => [..._customers],
  get: (id: number) => _customers.find((c) => c.id === id) ?? null,
  findByTag: (tag: string) => _customers.find((c) => c.user_tag.toLowerCase() === tag.trim().toLowerCase()) ?? null,
};

// ---------------------------------------------------------------------------
// Smart Homes
// ---------------------------------------------------------------------------
export const smartHomeStore = {
  list: () => [..._smartHomes],
  get: (id: number) => _smartHomes.find((h) => h.id === id) ?? null,
  update: (id: number, patch: Partial<SmartHome>) => {
    _smartHomes = _smartHomes.map((h) => (h.id === id ? { ...h, ...patch } : h));
    return smartHomeStore.get(id);
  },
  createUnclaimed: (input: { name: string; package: SmartHome["package"] }) => {
    const home: SmartHome = {
      id: nextHomeId++,
      name: input.name,
      address: "Kho vận — chưa xuất kho",
      package: input.package,
      status: "unclaimed",
      customer_id: null,
      gateway_id: null,
      activated_at: null,
      created_at: new Date().toISOString(),
    };
    _smartHomes = [home, ..._smartHomes];
    return home;
  },
  // Operator tra cứu user_tag của khách hàng (đã đăng ký sẵn trên Mobile App)
  // và gán trực tiếp quyền sở hữu — thay thế luồng khách tự quét QR khi
  // Operator cần kích hoạt hộ (concierge/B2B), ghi lại lịch sử kích hoạt +
  // timeline như một lượt claim thật.
  assignOwner: (homeId: number, customerId: number) => {
    const now = new Date().toISOString();
    _smartHomes = _smartHomes.map((h) =>
      h.id === homeId ? { ...h, customer_id: customerId, status: "active" as const, activated_at: now } : h
    );
    _activationRecords = [
      { id: nextActivationId++, customer_id: customerId, home_id: homeId, activated_at: now, result: "success", method: "operator_assign" },
      ..._activationRecords,
    ];
    const customer = customerStore.get(customerId);
    _homeTimelineEvents = [
      { id: nextTimelineId++, home_id: homeId, timestamp: now, label: "Activated",
        description: `Operator gán quyền sở hữu cho khách hàng ${customer?.name ?? `#${customerId}`} (${customer?.user_tag ?? ""}).` },
      ..._homeTimelineEvents,
    ];
    return smartHomeStore.get(homeId);
  },
};

export const roomStore = {
  listByHome: (homeId: number) => _rooms.filter((r) => r.home_id === homeId),
  get: (id: number) => _rooms.find((r) => r.id === id) ?? null,
  createForHome: (homeId: number, name: string, roomType: Room["room_type"]) => {
    const room: Room = {
      id: nextRoomId++, home_id: homeId, name, room_type: roomType,
      temperature: 25, humidity: 50, power_usage: 0, has_climate_data: true,
    };
    _rooms = [..._rooms, room];
    return room;
  },
};

export const homeMemberStore = {
  listByHome: (homeId: number) => _homeMembers.filter((m) => m.home_id === homeId),
};

export const homeTimelineStore = {
  listByHome: (homeId: number) =>
    _homeTimelineEvents
      .filter((e) => e.home_id === homeId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
};

// ---------------------------------------------------------------------------
// Gateways
// ---------------------------------------------------------------------------
export const gatewayStore = {
  list: () => [..._gateways],
  get: (id: number) => _gateways.find((g) => g.id === id) ?? null,
  getByHome: (homeId: number) => _gateways.find((g) => g.home_id === homeId) ?? null,
  update: (id: number, patch: Partial<Gateway>) => {
    _gateways = _gateways.map((g) => (g.id === id ? { ...g, ...patch } : g));
    return gatewayStore.get(id);
  },
  createForHome: (homeId: number) => {
    const uid = `ESP32-GW-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    const gateway: Gateway = {
      id: nextGatewayId++, home_id: homeId, uid, status: "offline",
      firmware_version: "2.3.1", wifi_ssid: "—", rssi: 0, mqtt_status: "disconnected",
      last_seen: null, provision_status: "pending", node_count: 0, paired_count: 0,
    };
    _gateways = [..._gateways, gateway];
    return gateway;
  },
};

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------
export const deviceStore = {
  list: () => [..._devices],
  get: (id: number) => _devices.find((d) => d.id === id) ?? null,
  listByRoom: (roomId: number) => _devices.filter((d) => d.room_id === roomId),
  listByHome: (homeId: number) => _devices.filter((d) => d.home_id === homeId),
  updateStatus: (id: number, status: ApiDeviceStatus) => {
    _devices = _devices.map((d) =>
      d.id === id ? { ...d, status, fail_count: status === "active" ? 0 : d.fail_count } : d
    );
    return deviceStore.get(id);
  },
  delete: (id: number) => {
    _devices = _devices.filter((d) => d.id !== id);
  },
  assignToRoom: (deviceId: number, roomId: number, homeId: number) => {
    _devices = _devices.map((d) =>
      d.id === deviceId ? { ...d, room_id: roomId, home_id: homeId } : d
    );
    return deviceStore.get(deviceId);
  },
  createInRoom: (input: { device_name: string; category: MockDevice["category"]; room_id: number; home_id: number; location?: string }) => {
    const isSensor = input.category === "sensor";
    const prefix = isSensor ? "SN" : input.category === "camera" ? "CM" : input.category === "door_contact" ? "DC" : "RL";
    const device: MockDevice = {
      id: nextDeviceId++,
      device_id: `ESP32-${prefix}-${String(nextDeviceId).padStart(4, "0")}`,
      device_name: input.device_name,
      device_type: isSensor ? "sensor" : "gateway",
      status: "active",
      location: input.location ?? "",
      last_seen: new Date().toISOString(),
      fail_count: 0,
      created_by: 1,
      home_id: input.home_id,
      room_id: input.room_id,
      category: input.category,
    };
    _devices = [..._devices, device];
    return device;
  },
};

// Synthetic recent telemetry, generated on demand (kept out of the seed file
// since it's high-volume time series data, not a fixed business entity).
export function generateSensorData(deviceId: number, limit = 200): ApiSensorData[] {
  const device = deviceStore.get(deviceId);
  const room = device ? roomStore.get(device.room_id) : null;
  const baseTemp = room?.temperature ?? 25;
  const baseHumidity = room?.humidity ?? 50;
  const points: ApiSensorData[] = [];
  for (let i = 0; i < limit; i++) {
    points.push({
      id: deviceId * 1000 + i,
      device_id: deviceId,
      gateway_id: device?.home_id ?? 0,
      payload: {
        temperature: Math.round((baseTemp + Math.sin(i / 6) * 2 + (Math.random() - 0.5)) * 10) / 10,
        humidity: Math.round(baseHumidity + Math.cos(i / 8) * 4 + (Math.random() - 0.5) * 2),
      },
      received_at: new Date(Date.now() - i * 5 * 60 * 1000).toISOString(),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------
export const cameraStore = {
  listByHome: (homeId: number) => _cameras.filter((c) => c.home_id === homeId),
};

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------
export const automationStore = {
  list: () => [..._automationRules],
  listByHome: (homeId: number) => _automationRules.filter((r) => r.home_id === homeId),
  toggle: (id: number) => {
    _automationRules = _automationRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    return _automationRules.find((r) => r.id === id) ?? null;
  },
  delete: (id: number) => {
    _automationRules = _automationRules.filter((r) => r.id !== id);
  },
  create: (rule: Omit<AutomationRule, "id" | "enabled">) => {
    const created: AutomationRule = { ...rule, id: nextAutomationId++, enabled: true };
    _automationRules = [created, ..._automationRules];
    return created;
  },
};

// ---------------------------------------------------------------------------
// Firmware / OTA
// ---------------------------------------------------------------------------
export const firmwareStore = {
  list: () => [..._firmwareVersions].sort((a, b) => new Date(b.released_at).getTime() - new Date(a.released_at).getTime()),
  listDeployments: () => [..._otaDeployments].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
  // Step 1 of the real OTA flow: build engineer uploads a .bin — it's stored
  // here with no deployment yet, so it just sits in the table until an
  // Admin/Operator explicitly clicks "Deploy" to push it out.
  upload: (input: { type: FirmwareVersion["type"]; version: string; stable: boolean; fileName: string; sizeKb: number }) => {
    const firmware: FirmwareVersion = {
      id: nextFirmwareId++,
      type: input.type,
      version: input.version,
      stable: input.stable,
      released_at: new Date().toISOString(),
      file_name: input.fileName,
      size_kb: input.sizeKb,
    };
    _firmwareVersions = [firmware, ..._firmwareVersions];
    return firmware;
  },
  rollback: (deploymentId: number) => {
    _otaDeployments = _otaDeployments.map((d) =>
      d.id === deploymentId ? { ...d, status: "rolled_back" as const } : d
    );
    return _otaDeployments.find((d) => d.id === deploymentId) ?? null;
  },
  // Step 2: Deploy pushes the uploaded firmware out to the fleet.
  deploy: (firmwareId: number, scope: OtaDeployment["scope"], targetHomeId: number | null, targetCount: number) => {
    const deployment: OtaDeployment = {
      id: nextDeploymentId++,
      firmware_id: firmwareId, scope, target_home_id: targetHomeId,
      progress_percent: 0, target_count: targetCount, status: "in_progress",
      started_at: new Date().toISOString(),
    };
    _otaDeployments = [deployment, ..._otaDeployments];
    return deployment;
  },
  // Step 3: simulates devices reporting progress back as they finish flashing —
  // called on an interval by the OTA page while any deployment is in_progress.
  advanceInProgress: () => {
    let changed = false;
    _otaDeployments = _otaDeployments.map((d) => {
      if (d.status !== "in_progress") return d;
      changed = true;
      const next = Math.min(100, d.progress_percent + 8 + Math.floor(Math.random() * 12));
      return { ...d, progress_percent: next, status: next >= 100 ? ("completed" as const) : d.status };
    });
    return changed;
  },
};

// ---------------------------------------------------------------------------
// Warranty & activation history (Customer detail)
// ---------------------------------------------------------------------------
export const warrantyStore = {
  listByHome: (homeId: number) => _warrantyRecords.filter((w) => w.home_id === homeId),
};

export const activationStore = {
  listByCustomer: (customerId: number) =>
    _activationRecords
      .filter((a) => a.customer_id === customerId)
      .sort((a, b) => new Date(b.activated_at).getTime() - new Date(a.activated_at).getTime()),
};

// ---------------------------------------------------------------------------
// Operator Home Access
// ---------------------------------------------------------------------------
export const operatorAccessStore = {
  list: () => [..._operatorAccessGrants].sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime()),
  grant: (input: { operator_id: number; operator_username: string; home_id: number; reason: string; durationHours: number }) => {
    const grant: OperatorAccessGrant = {
      id: nextAccessGrantId++, operator_id: input.operator_id, operator_username: input.operator_username,
      home_id: input.home_id, reason: input.reason, granted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + input.durationHours * 60 * 60 * 1000).toISOString(), revoked_at: null,
    };
    _operatorAccessGrants = [grant, ..._operatorAccessGrants];
    return grant;
  },
  revoke: (id: number) => {
    _operatorAccessGrants = _operatorAccessGrants.map((g) =>
      g.id === id ? { ...g, revoked_at: new Date().toISOString() } : g
    );
    return _operatorAccessGrants.find((g) => g.id === id) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Logs (10 categories)
// ---------------------------------------------------------------------------
export const logStore = {
  listByCategory: (category: LogCategory) =>
    _logEntries.filter((l) => l.category === category),
  // Legacy AuditLogEntry-shaped view for the pre-existing Security/Activity
  // pages that were built against `AuditLogTable`'s column set.
  listAsAuditEntries: (category: LogCategory): AuditLogEntry[] =>
    _logEntries
      .filter((l) => l.category === category)
      .map((l) => ({
        id: l.id,
        event_type: l.message.slice(0, 40).toUpperCase().replace(/\s+/g, "_"),
        device_id: null,
        device_identifier: l.gateway_uid,
        device_name: null,
        ip_address: null,
        device_ip: null,
        user_agent: null,
        details: l.details,
        created_at: l.timestamp,
      })),
  bulkDelete: (ids: number[]) => {
    const idSet = new Set(ids);
    _logEntries = _logEntries.filter((l) => !idSet.has(l.id));
  },
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notificationStore = {
  listForRole: (role: "admin" | "operator") => [..._notifications].filter((n) => n.target_role === role || n.target_role === "all"),
  markRead: (id: number) => {
    _notifications = _notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
  },
  markAllRead: (role: "admin" | "operator") => {
    _notifications = _notifications.map((n) =>
      n.target_role === role || n.target_role === "all" ? { ...n, is_read: true } : n
    );
  },
};

// ---------------------------------------------------------------------------
// Staff accounts (Team)
// ---------------------------------------------------------------------------
export const staffStore = {
  list: () => [..._staffAccounts],
  create: (username: string, role: "admin" | "operator" = "operator") => {
    if (_staffAccounts.some((s) => s.username === username)) {
      throw new Error("USERNAME_TAKEN");
    }
    const account: StaffAccount = {
      id: nextStaffId++, username, role, created_at: new Date().toISOString(), last_login: null,
    };
    _staffAccounts = [..._staffAccounts, account];
    return account;
  },
  delete: (id: number) => {
    _staffAccounts = _staffAccounts.filter((s) => s.id !== id);
  },
};

// ---------------------------------------------------------------------------
// Dashboard aggregate stats
// ---------------------------------------------------------------------------
export function computeAdminDashboard() {
  return {
    totalCustomers: _customers.length,
    totalSmartHomes: _smartHomes.length,
    unclaimedHomes: _smartHomes.filter((h) => h.status === "unclaimed").length,
    gatewaysOnline: _gateways.filter((g) => g.status === "online").length,
    gatewaysTotal: _gateways.length,
    devicesOnline: _devices.filter((d) => d.status === "active").length,
    devicesTotal: _devices.length,
    openAlerts: _logEntries.filter((l) => l.severity === "critical").length,
    topErrors: [..._logEntries]
      .filter((l) => l.category === "error" || l.severity === "critical")
      .slice(0, 5),
    firmwareRollouts: _otaDeployments.filter((d) => d.status === "in_progress"),
    recentActivity: [..._logEntries]
      .filter((l) => l.category === "activity")
      .slice(0, 6),
  };
}

export function computeOperatorDashboard() {
  const activeGrants = _operatorAccessGrants.filter(
    (g) => !g.revoked_at && new Date(g.expires_at).getTime() > Date.now()
  );
  return {
    provisioningQueue: _smartHomes.filter((h) => h.status === "unclaimed"),
    activeAccessGrants: activeGrants,
    openTickets: _notifications.filter((n) => n.target_role === "operator" && !n.is_read).length,
    alertsToHandle: _logEntries.filter((l) => l.severity === "critical" || l.severity === "warning").length,
  };
}
