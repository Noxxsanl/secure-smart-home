import { dashApi, dashPath } from "@smarthome/console/api/client";
import type { CommandAccepted } from "@smarthome/console/api/types";

// §5 Gateways (FR-9.1, FR-9.2).

export function gatewaysKey() {
  return dashPath("/gateways");
}

export function gatewayKey(id: number) {
  return dashPath(`/gateways/${id}`);
}

/** 202 — lệnh gửi qua MQTT, gateway khởi động lại sau vài giây. */
export function restartGateway(id: number) {
  return dashApi<CommandAccepted>(`/gateways/${id}/restart`, { method: "POST" });
}

/** 202 — Operator trên nhà đã kích hoạt cần quyền truy cập (403 ACCESS_GRANT_REQUIRED). */
export function factoryResetGateway(id: number) {
  return dashApi<CommandAccepted>(`/gateways/${id}/factory-reset`, { method: "POST" });
}
