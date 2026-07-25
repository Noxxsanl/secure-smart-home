import StatusBadge from "@/shared/ui/StatusBadge";

type DeviceStatusBadgeProps = {
  status: "online" | "offline" | "active" | "inactive" | "blocked";
};

// Thin wrapper kept for existing call sites (DevicesPage/DeviceDetailPage) —
// the actual status→color mapping now lives in the shared `StatusBadge` so
// every module (Home/Gateway/Device/OTA) stays visually consistent.
export default function DeviceStatusBadge({ status }: DeviceStatusBadgeProps) {
  return <StatusBadge status={status} />;
}
