import type { Request, RequestHandler, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam, requireEnum, requireInt } from "../../../../shared/validation/validate";
import { HttpError } from "../../../../shared/errors/http-error";
import type { CustomerChannel } from "../../../../shared/types/domain";
import {
  AC_SETPOINT_MAX,
  AC_SETPOINT_MIN,
  CURTAIN_POS_MAX,
  CURTAIN_POS_MIN,
  isValidCurtainPos,
  toLearnAction,
  toSetPosAction,
  toSetTempAction,
} from "../../../devices";
import type { DeviceCommandAction } from "../../../devices";
import { commandDevice } from "./send-device-command.handler";

const ACTIONS = ["turn_on", "turn_off", "set_temp", "learn_code", "set_pos"] as const;

// POST /devices/:deviceId/commands (portal: channel "web", mobile: channel "mobile")
//   { "action": "turn_on" | "turn_off" }  hoặc  { "action": "set_temp", "temperature": 16..30 } (chỉ điều hoà).
//   { "action": "learn_code", "slot": "off" | 16..30 } (chỉ điều hoà): học mã remote IR cho ô TẮT / BẬT ở nhiệt độ đó.
//   { "action": "set_pos", "position": 0..100 } (chỉ rèm): mở rèm tới N % (0 = đóng); giao diện dùng 50 / 100.
// set_temp / learn_code / set_pos được đổi thành chuỗi `set_temp_<NN>` / `learn_off` / `learn_t<NN>` / `set_pos_<N>` — đúng chuỗi
// lưu ở device_commands.command và ký xuống gateway.
export function sendDeviceCommandController(channel: CustomerChannel): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = requireEnum(body.action, "action", ACTIONS);
    let commandAction: DeviceCommandAction;
    if (action === "set_temp") {
      commandAction = toSetTempAction(requireInt(body.temperature, "temperature", { min: AC_SETPOINT_MIN, max: AC_SETPOINT_MAX }));
    } else if (action === "set_pos") {
      // Hợp đồng: thiếu / không phải số nguyên / ngoài 0..100 đều là 400 INVALID_INPUT (không nhận chuỗi "50")
      if (!isValidCurtainPos(body.position)) {
        throw new HttpError(400, "INVALID_INPUT", `position must be an integer between ${CURTAIN_POS_MIN} and ${CURTAIN_POS_MAX}`);
      }
      commandAction = toSetPosAction(body.position);
    } else if (action === "learn_code") {
      // slot là "off" hoặc số nguyên 16..30 (cùng luật validate với temperature)
      commandAction = toLearnAction(
        body.slot === "off" ? "off" : requireInt(body.slot, "slot", { min: AC_SETPOINT_MIN, max: AC_SETPOINT_MAX })
      );
    } else {
      commandAction = action;
    }
    res.json(await commandDevice(getAuth(req), parseIdParam(req.params.deviceId), commandAction, channel, requestMeta(req)));
  };
}
