// Triển khai OTA (FR-9.4): tạo deployment, phát lệnh MQTT cho thiết bị thật, để simulator đẩy tiến độ
// cho thiết bị mô phỏng. ADMIN: mọi phạm vi; OPERATOR: chỉ phạm vi "home" của nhà chưa claim hoặc đã có grant.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, forbidden, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { publishOtaCommand } from "../../../control";
import { getHomeRow, requireOperatorHomeAccess } from "../../../homes";
import { notifyStaff } from "../../../notifications";
import type { OtaDeployment } from "../../domain/ota.types";
import { getFirmwareForDeploy } from "../../infrastructure/firmware.repository";
import { getDeployment, listTargets } from "../../infrastructure/ota.read-model";
import { finalizeJobIfDone, insertHistoryRows, insertJob, markHistory } from "../../infrastructure/ota.repository";
import type { CreateDeploymentInput } from "./create-deployment.dto";

export async function createDeployment(auth: AuthContext, input: CreateDeploymentInput, meta: RequestMeta): Promise<OtaDeployment> {
  if (auth.role !== "admin" && input.scope !== "home") throw forbidden("Operators may only deploy to a single home");

  let homeName: string | null = null;
  if (input.scope === "home") {
    if (input.targetHomeId === null) throw new HttpError(400, "MISSING_FIELDS", "target_home_id is required for scope=home");
    const home = await getHomeRow(input.targetHomeId);
    if (!home) throw notFound("Home not found");
    await requireOperatorHomeAccess(auth, home); // ADMIN qua luôn; Operator cần nhà chưa claim hoặc grant
    homeName = home.name;
  }

  const firmware = await getFirmwareForDeploy(input.firmwareId);
  if (!firmware) throw notFound("Firmware not found");
  const targets = await listTargets(firmware.target_type, input.scope === "home" ? input.targetHomeId : null);
  if (targets.length === 0) throw new HttpError(400, "NO_TARGETS", "No devices match this firmware type in the selected scope");

  // Job + mọi dòng lịch sử: một transaction (nhiều bảng)
  const jobId = await withTransaction(async (conn) => {
    const id = await insertJob(conn, {
      firmwareId: firmware.id,
      scopeType: input.scope === "fleet" ? "system" : "home",
      scopeId: input.scope === "home" ? input.targetHomeId : null,
      createdBy: auth.userId,
    });
    await insertHistoryRows(conn, id, targets.map((target) => target.id));
    return id;
  });

  // Thiết bị mô phỏng: giữ pending cho simulator. Thiết bị thật: gửi lệnh tới gateway (mỗi gateway một lần/job).
  const real = targets.filter((target) => !target.is_simulated);
  const gatewayOf = (target: { id: number; gateway_device_id: number | null }): number | null =>
    firmware.target_type === "gateway" ? target.id : target.gateway_device_id;
  const delivered = new Map<number, boolean>();
  for (const target of real) {
    const gatewayId = gatewayOf(target);
    if (gatewayId !== null && !delivered.has(gatewayId)) {
      delivered.set(
        gatewayId,
        await publishOtaCommand({
          gatewayId,
          jobId,
          version: firmware.version,
          targetType: firmware.target_type,
          checksumSha256: firmware.checksum_sha256,
        })
      );
    }
  }
  const sentIds = real.filter((target) => {
    const gatewayId = gatewayOf(target);
    return gatewayId !== null && delivered.get(gatewayId) === true;
  }).map((target) => target.id);
  const failedIds = real.map((target) => target.id).filter((id) => !sentIds.includes(id));
  if (sentIds.length > 0) await markHistory(jobId, sentIds, "downloading", null);
  if (failedIds.length > 0) await markHistory(jobId, failedIds, "failed", "Không gửi được lệnh OTA tới gateway");
  await finalizeJobIfDone(jobId);

  const scopeText = input.scope === "fleet" ? "toàn hệ thống" : `nhà "${homeName ?? input.targetHomeId}"`;
  await logEvent({
    eventType: "OTA_DEPLOYED",
    homeId: input.scope === "home" ? input.targetHomeId : null,
    actorUserId: auth.userId,
    message: `${auth.username} triển khai firmware ${firmware.target_type} ${firmware.version} cho ${scopeText} (${targets.length} thiết bị)`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { job_id: jobId, firmware_id: firmware.id, version: firmware.version, targets: targets.length, scope: input.scope },
  });
  if (auth.role === "operator") {
    await notifyStaff({
      targetRole: "admin",
      type: "OTA_DEPLOYED",
      title: "Operator triển khai firmware",
      message: `Operator ${auth.username} triển khai firmware ${firmware.version} cho ${scopeText}.`,
      severity: "info",
      homeId: input.scope === "home" ? input.targetHomeId : null,
      actor: { id: auth.userId, username: auth.username, role: auth.role },
    });
  }

  const created = await getDeployment(jobId);
  if (!created) throw new Error("deployment could not be read back");
  return created;
}
