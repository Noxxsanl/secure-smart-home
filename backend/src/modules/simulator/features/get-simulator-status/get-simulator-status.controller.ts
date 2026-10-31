import type { Request, Response } from "express";
import { env } from "../../../../config/env";

export function getSimulatorStatusController(_req: Request, res: Response): void {
  res.json({ enabled: env.deviceSimulator });
}
