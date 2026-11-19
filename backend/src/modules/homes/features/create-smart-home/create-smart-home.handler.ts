// POST /smart-homes — tạo nhà từ KIT (FR-2.2, FR-2.3): nhà + phòng + gateway + thiết bị + mã kích hoạt trong
// MỘT transaction (invariant 9); audit ghi SAU commit, details không chứa mã kích hoạt (invariant 2).
import { env } from "../../../../config/env";
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { logEvent } from "../../../audit";
import { getGatewayCounts, toConsoleDevice, toGateway } from "../../../devices";
import { issueActivationCode } from "../../domain/activation";
import { createKitHome } from "../../domain/provisioning";
import { toDetailHome } from "../../domain/smart-home-detail";
import type { CreateSmartHomeInput, ProvisionResult } from "./create-smart-home.dto";

export async function createSmartHome(
  auth: AuthContext,
  input: CreateSmartHomeInput,
  meta: RequestMeta
): Promise<ProvisionResult> {
  // Nhà + phòng + gateway + thiết bị + mã kích hoạt: một transaction — lỗi ở đâu cũng không còn gì
  const { kit, activation } = await withTransaction(async (conn) => {
    const created = await createKitHome(conn, {
      name: input.name,
      packageCode: input.packageCode,
      address: input.address ?? null,
      expectedOwnerName: input.expectedOwnerName ?? null,
      createdBy: auth.userId,
      simulated: env.deviceSimulator,
    });
    const issued = await issueActivationCode(conn, { homeId: created.home.id, createdBy: auth.userId });
    return { kit: created, activation: issued };
  });

  // Audit SAU commit; details không chứa mã kích hoạt (invariant 2)
  await logEvent({
    eventType: "HOME_CREATED",
    homeId: kit.home.id,
    actorUserId: auth.userId,
    message: `${auth.username} tạo nhà "${kit.home.name}" (${kit.home.package_code})`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { package: kit.home.package_code, rooms: kit.rooms.length, devices: kit.devices.length + 1 },
  });
  await logEvent({
    eventType: "ACTIVATION_CODE_CREATED",
    homeId: kit.home.id,
    actorUserId: auth.userId,
    message: `Tạo mã kích hoạt cho nhà "${kit.home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { expires_at: activation.expires_at },
  });

  const counts = (await getGatewayCounts([kit.gateway.id])).get(kit.gateway.id) ?? {
    node_count: 0,
    paired_count: 0,
    device_count: 0,
  };
  return {
    home: await toDetailHome(kit.home),
    rooms: kit.rooms,
    gateway: toGateway(kit.gateway, counts),
    devices: kit.devices.map(toConsoleDevice),
    nodes: kit.nodes,
    activation,
  };
}
