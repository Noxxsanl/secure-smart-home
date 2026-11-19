"use client";

import { useState } from "react";
import Link from "next/link";
import { DoorClosed, DoorOpen, Droplets, Thermometer } from "lucide-react";
import { AccessGrantNotice, BTN_SECONDARY, MUTED_DASH, Panel, PanelEmpty, TABLE_HEAD_ROW, TH, TR } from "@shh/ui";
import { errorMessage, isAccessGrantRequired } from "@shh/api-client/dashboard";
import type { DeviceCategory, TelemetryRange } from "@shh/api-client/dashboard";
import { formatDateTime, formatRelative } from "@shh/utils";
import TelemetryChart from "../../ui/TelemetryChart";
import { useSensorData } from "../../api/useSensorData";

export type DeviceTelemetryPanelProps = {
  deviceId: number;
  deviceName: string;
  category: DeviceCategory;
  homeId: number | null;
};

function bucketLabel(seconds: number | null): string {
  if (seconds === null) return "";
  return seconds >= 3600 ? `${Math.round(seconds / 3600)} giờ` : `${Math.round(seconds / 60)} phút`;
}

// Console: số đo của cảm biến nhiệt/ẩm (biểu đồ + bảng gần nhất) hoặc trạng thái cảm
// biến cửa; loại thiết bị khác không hiện gì. Operator xem nhà đã kích hoạt mà chưa
// có quyền → hộp nhắc xin quyền truy cập (403 ACCESS_GRANT_REQUIRED).
export default function DeviceTelemetryPanel({ deviceId, deviceName, category, homeId }: DeviceTelemetryPanelProps) {
  const [range, setRange] = useState<TelemetryRange>("24h");
  const isSensor = category === "sensor";
  const isDoor = category === "door_contact";
  const telemetry = useSensorData(deviceId, range, isSensor || isDoor);
  const grantRequired = isAccessGrantRequired(telemetry.error);
  const recentPoints = [...telemetry.points].reverse().slice(0, 12);

  return (
    <>
      {(isSensor || isDoor) && grantRequired && (
        <AccessGrantNotice
          action={homeId ? (
            <Link href={`/smart-homes/${homeId}`} className={BTN_SECONDARY}>Mở trang Smart Home</Link>
          ) : undefined}
        >
          Thiết bị thuộc nhà đã được khách hàng kích hoạt — xem số đo cần quyền truy cập có thời hạn. Mở trang Smart Home của nhà
          và bấm “Yêu cầu quyền truy cập”.
        </AccessGrantNotice>
      )}
  
      {isDoor && !grantRequired && (
        <Panel title="Trạng thái cửa" subtitle="Bản ghi gần nhất từ cảm biến cửa.">
          <div className="flex items-center gap-3 p-4 text-sm">
            {telemetry.latest?.door_open === null || telemetry.latest === null ? (
              <span className="text-gray-400 dark:text-slate-500">Chưa có dữ liệu cửa.</span>
            ) : (
              <>
                {telemetry.latest.door_open
                  ? <DoorOpen className="h-5 w-5 text-warning" />
                  : <DoorClosed className="h-5 w-5 text-success" />}
                <span className="font-semibold text-gray-900 dark:text-slate-100">{telemetry.latest.door_open ? "Cửa đang mở" : "Cửa đang đóng"}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">{formatRelative(telemetry.latest.received_at)}</span>
              </>
            )}
          </div>
        </Panel>
      )}
  
      {isSensor && !grantRequired && (
        <>
          <TelemetryChart
            points={telemetry.points}
            range={range}
            onRangeChange={setRange}
            isLoading={telemetry.isLoading && telemetry.points.length === 0}
            errorMessage={telemetry.error ? errorMessage(telemetry.error) : null}
            title={deviceName}
          />
  
          <Panel
            title="Dữ liệu gần nhất"
            subtitle={telemetry.bucketSeconds ? `Trung bình theo từng ${bucketLabel(telemetry.bucketSeconds)}.` : undefined}
          >
            {recentPoints.length === 0 ? (
              <PanelEmpty>Chưa có dữ liệu cảm biến trong khoảng này.</PanelEmpty>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-left text-sm">
                  <thead>
                    <tr className={TABLE_HEAD_ROW}>
                      <th className={TH}>Thời gian</th>
                      <th className={TH}><span className="flex items-center gap-1"><Thermometer size={11} /> Nhiệt độ (°C)</span></th>
                      <th className={TH}><span className="flex items-center gap-1"><Droplets size={11} /> Độ ẩm (%)</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {recentPoints.map((p) => (
                      <tr key={p.t} className={TR}>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{formatDateTime(p.t)}</td>
                        <td className="px-4 py-2.5 font-semibold text-warning">
                          {p.temperature !== null ? `${p.temperature.toFixed(1)}°C` : <span className={MUTED_DASH}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-info">
                          {p.humidity !== null ? `${p.humidity.toFixed(0)}%` : <span className={MUTED_DASH}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
