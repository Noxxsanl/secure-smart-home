import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam, parseLimit } from "../../../../shared/validation/validate";
import { DEFAULT_SNAPSHOT_LIMIT, MAX_SNAPSHOT_LIMIT, listCameraSnapshots } from "./list-camera-snapshots.handler";

// GET /devices/:deviceId/snapshots?limit=20 (portal + mobile)
export async function listCameraSnapshotsController(req: Request, res: Response): Promise<void> {
  const limit = parseLimit(req.query.limit, DEFAULT_SNAPSHOT_LIMIT, MAX_SNAPSHOT_LIMIT);
  res.json(await listCameraSnapshots(getAuth(req), parseIdParam(req.params.deviceId), limit));
}
