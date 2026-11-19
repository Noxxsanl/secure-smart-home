// Topic MQTT của lệnh điều khiển (CONTRACT §7). Mọi topic bắt đầu bằng home/{home_id}/gateway/{gw} để áp ACL theo nhà.
export const ACK_TOPIC_FILTER = "home/+/gateway/+/device/+/command/ack";

export function gatewayBaseTopic(homeId: number, gatewayUid: string): string {
  return `home/${homeId}/gateway/${gatewayUid}`;
}
