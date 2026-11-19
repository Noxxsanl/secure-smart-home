// Rollback đợt triển khai OTA (FR-9.4). ADMIN: mọi đợt; OPERATOR: chỉ đợt phạm vi "home" của nhà được phép.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, forbidden, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { getHomeRow, requireOperatorHomeAccess } from "../../../homes";
import type { OtaDeployment } from "../../domain/ota.types";
import { getDeployment } from "../../infrastructure/ota.read-model";
import { getJobRow, rollbackJob } from "../../infrastructure/ota.repository";

export async function rollbackDeployment(auth: AuthContext, jobId: number, meta: RequestMeta): Promise<OtaDeployment> {
  const job = await getJobRow(jobId);
  if (!job) throw notFound("Deployment not found");

  if (auth.role !== "admin") {
    // Operator chỉ rollback job phạm vi nhà mà mình được phép
    if (job.scope_type !== "home" || job.scope_id === null) throw forbidden("Operators may only roll back home deployments");
    const home = await getHomeRow(job.scope_id);
    if (!home) throw notFound("Deployment not found");
    await requireOperatorHomeAccess(auth, home);
  }
  if (job.status === "rolled_back") throw new HttpError(409, "ALREADY_ROLLED_BACK", "Deployment was already rolled back");

  await withTransaction((conn) => rollbackJob(conn, jobId));
  await logEvent({
    eventType: "OTA_ROLLED_BACK",
    homeId: job.scope_type === "home" ? job.scope_id : null,
    actorUserId: auth.userId,
    message: `${auth.username} hoàn tác đợt triển khai OTA #${jobId}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { job_id: jobId },
  });
  const updated = await getDeployment(jobId);
  if (!updated) throw notFound("Deployment not found");
  return updated;
}
