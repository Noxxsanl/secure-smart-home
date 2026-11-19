import type { Request, Response } from "express";
import { listFirmwareVersions } from "./list-firmware.handler";

export async function listFirmwareController(_req: Request, res: Response): Promise<void> {
  res.json(await listFirmwareVersions());
}
