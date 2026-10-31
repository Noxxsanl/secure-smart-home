// Lệnh quản trị gateway (FR-9.1, 9.2): restart / factory-reset qua MQTT, fire-and-forget.
//
//   commandGateway      use case của console: kiểm gateway + grant của Operator → sendGatewayCommand.
//   sendGatewayCommand  ghi device_commands + audit rồi trả ngay; việc gửi chạy nền (cũng được module khác gọi qua control.facade).
//
// Chữ ký lệnh là HMAC-SHA256 bằng secret của GATEWAY ký qua getGatewaySigner (module devices) — control không cầm secret.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { newUuid } from "../../../../shared/crypto";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { requireOperatorHomeAccess } from "../../../homes";
import { getDeviceRow, getGatewaySigner, requireGateway } from "../../../devices";
import type { DeviceRow, GatewayAction } from "../../../devices";
import { gatewayBaseTopic } from "../../domain/command-topics";
import type { SendGatewayCommandInput, SendGatewayCommandResult } from "../../domain/command.types";
import { getSimulatedHandler, runSimulated } from "../../domain/simulated-command";
import { publishJson } from "../../infrastructure/command-mqtt.client";
import { insertCommandRow, markCommand, markGatewayCommandAcked } from "../../infrastructure/device-command.repository";

async function dispatchGatewayCommand(gateway: DeviceRow, action: GatewayAction, commandUuid: string, rowId: number): Promise<void> {
  const simulatedHandler = getSimulatedHandler();
  if (gateway.is_simulated && simulatedHandler) {
    const outcome = await runSimulated(simulatedHandler, { kind: "gateway", commandId: commandUuid, device: gateway, action });
    if (outcome.kind === "ack" && outcome.status === "ok") {
      await markGatewayCommandAcked(rowId, new Date());
    } else {
      await markCommand(rowId, "failed", outcome.kind === "timeout" ? outcome.errorCode : "DEVICE_ERROR");
    }
    return;
  }
  if (gateway.home_id === null) {
    await markCommand(rowId, "failed", "NO_HOME");
    return;
  }
  const signer = await getGatewaySigner(gateway.id);
  if (!signer) {
    await markCommand(rowId, "failed", "NO_GATEWAY");
    return;
  }
  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    command_id: commandUuid,
    action,
    ts,
    hmac: signer.sign(`${commandUuid}:${gateway.device_id}:${action}:${ts}`),
  };
  const published = await publishJson(`${gatewayBaseTopic(gateway.home_id, gateway.device_id)}/command`, payload);
  await markCommand(rowId, published ? "sent" : "failed", published ? null : "BROKER_DOWN");
}

/**
 * Restart / factory-reset gateway, fire-and-forget (CONTRACT §6): ghi device_commands + audit
 * (GATEWAY_RESTART | GATEWAY_FACTORY_RESET) rồi trả ngay; việc gửi MQTT/simulator chạy nền và cập nhật
 * status 'sent'/'acked'/'failed'. Người gọi chịu trách nhiệm quyền (factory-reset của OPERATOR trên
 * nhà đã claim cần grant — requireOperatorHomeAccess). Gateway chưa gán nhà → 409 GATEWAY_NOT_ASSIGNED.
 */
export async function sendGatewayCommand(input: SendGatewayCommandInput): Promise<SendGatewayCommandResult> {
  const gateway = await getDeviceRow(input.gatewayId);
  if (!gateway || gateway.device_type !== "gateway") throw notFound("Gateway not found");
  if (gateway.home_id === null) throw new HttpError(409, "GATEWAY_NOT_ASSIGNED", "Gateway is not assigned to a home");

  const commandUuid = newUuid();
  const rowId = await insertCommandRow(gateway, input.action, input.issuedBy, "operator", "dashboard", new Date());

  const restart = input.action === "restart";
  await logEvent({
    eventType: restart ? "GATEWAY_RESTART" : "GATEWAY_FACTORY_RESET",
    homeId: gateway.home_id,
    deviceId: gateway.id,
    actorUserId: input.issuedBy,
    message: restart
      ? `Yêu cầu khởi động lại gateway ${gateway.device_id}`
      : `Yêu cầu khôi phục cài đặt gốc gateway ${gateway.device_id}`,
    ip: input.meta?.ip ?? null,
    userAgent: input.meta?.userAgent ?? null,
    details: { command_id: rowId, action: input.action },
  });

  void dispatchGatewayCommand(gateway, input.action, commandUuid, rowId).catch((err: unknown) => {
    console.error("[commands] gateway command dispatch failed:", err instanceof Error ? err.message : "unknown error");
  });
  return { commandId: commandUuid, rowId };
}

/**
 * Use case của console: gửi lệnh gateway. Factory-reset xoá cấu hình của khách nên Operator trên nhà đã claim phải có grant
 * (403 ACCESS_GRANT_REQUIRED); restart chỉ là thao tác vận hành nên không cần.
 */
export async function commandGateway(
  auth: AuthContext,
  id: number,
  action: GatewayAction,
  meta: RequestMeta
): Promise<{ command_id: string }> {
  const row = await requireGateway(id);
  if (action === "factory_reset" && row.home_id !== null && row.home_status !== null) {
    await requireOperatorHomeAccess(auth, { id: row.home_id, status: row.home_status });
  }
  const result = await sendGatewayCommand({ gatewayId: id, action, issuedBy: auth.userId, meta });
  return { command_id: result.commandId };
}
