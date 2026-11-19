// Input tạo đợt triển khai OTA.
import { optionalId, requireEnum, requireId } from "../../../../shared/validation/validate";

const SCOPES = ["fleet", "home"] as const;

export interface CreateDeploymentInput {
  firmwareId: number;
  scope: "fleet" | "home";
  targetHomeId: number | null;
}

export function parseCreateDeploymentBody(body: Record<string, unknown>): CreateDeploymentInput {
  const scope = requireEnum(body.scope, "scope", SCOPES);
  return {
    firmwareId: requireId(body.firmware_id, "firmware_id"),
    scope,
    targetHomeId: scope === "home" ? requireId(body.target_home_id, "target_home_id") : (optionalId(body.target_home_id, "target_home_id") ?? null),
  };
}
