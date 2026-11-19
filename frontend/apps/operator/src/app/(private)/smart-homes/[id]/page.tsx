"use client";

import { SmartHomeDetailPage } from "@shh/homes";
import { HomeLogPanel } from "@shh/audit";

// Smart Home (@shh/homes) + tab Log theo nhà (@shh/audit).
export default function Page() {
  return <SmartHomeDetailPage renderLogs={(p) => <HomeLogPanel {...p} />} />;
}
