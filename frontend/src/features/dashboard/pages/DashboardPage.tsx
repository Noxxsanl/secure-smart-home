"use client";

import { Server, Cpu, Wifi, Radio } from "lucide-react";
import StatsCard from "@/features/dashboard/components/StatsCard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import { useDashboardStats } from "@/features/dashboard/hooks/useDashboardStats";
import { useDevices } from "@/features/devices/providers/DevicesProvider";
import { useAddDevice } from "@/features/devices/providers/AddDeviceProvider";

export default function DashboardPage() {
  const { user } = useAuth();
  const { canCreateDevice } = usePermissions();
  const { openModal } = useAddDevice();
  const { devices } = useDevices();
  const { stats, isLoading } = useDashboardStats();

  const alertDevices = devices.filter(
    (d) => d.isUnderAttack || d.securityStatus !== "Normal"
  ).length;

  const totalGateway  = stats?.total_gateway  ?? 0;
  const totalSensor   = stats?.total_sensor   ?? 0;
  const gatewayOnline = stats?.gateway_online ?? 0;
  const sensorOnline  = stats?.sensor_online  ?? 0;

  return (
    <div className="w-full space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Welcome back, {user?.username ?? "admin"}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            IoT device management, alerts and security monitoring.
          </p>
        </div>
        {canCreateDevice && (
          <button
            onClick={openModal}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + Add Device
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 xl:grid-cols-4">
        <StatsCard title="Total Gateway"  value={isLoading ? "—" : totalGateway}
          subtitle="Gateway nodes registered in the system."
          accent="bg-blue-50 text-blue-600" iconBg="bg-blue-50"
          icon={<Server className="h-4 w-4 text-blue-600" />} />
        <StatsCard title="Total Sensor"   value={isLoading ? "—" : totalSensor}
          subtitle="Sensor nodes registered in the system."
          accent="bg-violet-50 text-violet-600" iconBg="bg-violet-50"
          icon={<Cpu className="h-4 w-4 text-violet-600" />} />
        <StatsCard title="Gateway Online" value={isLoading ? "—" : gatewayOnline}
          subtitle="Gateways connected and reporting in the last 60s."
          accent="bg-emerald-50 text-emerald-600" iconBg="bg-emerald-50"
          icon={<Wifi className="h-4 w-4 text-emerald-600" />} />
        <StatsCard title="Sensor Online"  value={isLoading ? "—" : sensorOnline}
          subtitle="Sensors connected and reporting in the last 60s."
          accent="bg-amber-50 text-amber-600" iconBg="bg-amber-50"
          icon={<Radio className="h-4 w-4 text-amber-600" />} />
      </div>

      {/* Detail cards */}
      <div className="grid gap-3 xl:grid-cols-3">

        {/* Device resiliency */}
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Health overview</p>
          <h2 className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">Device resiliency</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { label: "Total Gateway",  value: isLoading ? "—" : totalGateway },
              { label: "Gateway online", value: isLoading ? "—" : gatewayOnline },
              { label: "Total Sensor",   value: isLoading ? "—" : totalSensor },
              { label: "Sensor online",  value: isLoading ? "—" : sensorOnline },
            ].map(({ label, value }) => (
              <div key={label} className="rounded border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 p-3">
                <p className="text-xs font-medium text-gray-400 dark:text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-slate-100">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Security preview */}
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Security preview</p>
              <h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">Recent threat alerts</h3>
            </div>
            <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">Live</span>
          </div>
          <div className="mt-3">
            {alertDevices > 0 ? (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">{alertDevices} thiết bị đang bị tấn công</p>
                <p className="mt-1 text-red-500">Kiểm tra trang Devices để biết chi tiết.</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-slate-500">No active threat alerts.</p>
            )}
          </div>
        </div>

        {/* Recent events */}
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Activity</p>
          <h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">Recent events</h3>
          <div className="mt-3">
            <p className="text-sm text-gray-400 dark:text-slate-500">No recent events to display.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
