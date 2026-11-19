"use client";

import { GatewayDetailPage } from "@shh/devices";
import { LogTable } from "@shh/audit";

// Gateway (@shh/devices) + bảng Gateway & Provision Log (@shh/audit).
export default function Page() {
  return <GatewayDetailPage renderLogs={(p) => <LogTable {...p} />} />;
}
