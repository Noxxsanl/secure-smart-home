import type { Request, Response } from "express";
import { VERIFIED_LOCAL } from "./authenticate-gateway.middleware";
import type { VerifiedSnapshotRequest } from "./ingest-snapshot.dto";
import { ingestSnapshot } from "./ingest-snapshot.handler";

// POST /api/device/camera/snapshot — chạy SAU precheckSnapshotRequest → express.raw → verifySnapshotSignature (res.locals).
export async function ingestSnapshotController(req: Request, res: Response): Promise<void> {
  const verified = res.locals[VERIFIED_LOCAL] as VerifiedSnapshotRequest;
  res.status(201).json(await ingestSnapshot(verified, req.body));
}
