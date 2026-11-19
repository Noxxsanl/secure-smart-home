"use client";

import { CATEGORY_LABELS } from "@shh/api-client/dashboard";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Wifi, HardDrive, Radio, Clock, QrCode, Link2, Layers, Power, RotateCcw, UploadCloud, Network,
  Cpu, Globe,
} from "lucide-react";
import { useGatewayDetail } from "../../api/useGatewayDetail";
import SimulatorControls from "../../ui/SimulatorControls";
import { useSimulatorControls } from "../../api/useSimulatorControls";
import {
  OnlineIndicator, InfoCell, ConfirmModal, Panel, PanelEmpty, LoadErrorBar, PageError, PageLoading, StatusBadge, useToast, BTN_DANGER_SOFT, BTN_SECONDARY, BTN_WARNING_SOFT, CARD, MUTED_DASH, TABLE_HEAD_ROW, TH, TR,
} from "@shh/ui";
import { factoryResetGateway, restartGateway } from "../../api/gateways.api";
import { parseRouteId, formatDateTime, formatRelative, formatRssi } from "@shh/utils";
import type { GatewayDetail } from "@shh/api-client/dashboard";

/** Props mà trang truyền cho bảng log (`LogTable` của @shh/audit). */
export type GatewayLogSlotProps = { logs: GatewayDetail["logs"]; emptyTitle: string; emptyDescription: string };

type GatewayDetailPageProps = {
  /** Bảng "Gateway & Provision Log" — app ghép từ @shh/audit. */
  renderLogs?: (props: GatewayLogSlotProps) => React.ReactNode;
};

export default function GatewayDetailPage({ renderLogs }: GatewayDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading, error, refresh } = useGatewayDetail(parseRouteId(id));

  if (!detail) {
    if (!error || isLoading) return <PageLoading />;
    return (
      <PageError
        error={error}
        backHref="/gateways"
        backLabel="Trở về Gateways"
        notFoundText="Không tìm thấy Gateway này."
        onRetry={() => void refresh()}
      />
    );
  }
  return <GatewayDetailView detail={detail} loadError={error} refresh={refresh} renderLogs={renderLogs} />;
}

function GatewayDetailView({
  detail, loadError, refresh, renderLogs,
}: { detail: GatewayDetail; loadError: unknown; refresh: () => Promise<unknown> } & GatewayDetailPageProps) {
  const { gateway, home, nodes, logs } = detail;
  const { showToast } = useToast();
  const sim = useSimulatorControls(gateway.id, () => void refresh());
  const [action, setAction] = useState<"restart" | "reset" | null>(null);
  const claimedHome = !!home && home.status !== "unclaimed";

  return (
    <div className="w-full space-y-3">
      <div>
        <Link href="/gateways" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Gateways
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <h1 className="font-mono text-lg font-semibold text-gray-900 dark:text-slate-100">{gateway.uid}</h1>
          <StatusBadge status={gateway.status} />
          {gateway.device_status !== "active" && <StatusBadge status={gateway.device_status} />}
          {gateway.is_simulated && (
            <span className="rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400">Mô phỏng</span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          {home ? (
            <>Thuộc: <Link href={`/smart-homes/${home.id}`} className="text-brand hover:brightness-90">{home.name}</Link></>
          ) : "Chưa gán vào Smart Home nào."}
        </p>
      </div>

      {!!loadError && <LoadErrorBar error={loadError} onRetry={() => void refresh()} />}

      <div className={`overflow-hidden ${CARD}`}>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="RSSI" icon={<Radio size={14} />}>{formatRssi(gateway.rssi)}</InfoCell>
          <InfoCell label="Firmware" icon={<HardDrive size={14} />}>
            {gateway.firmware_version ? `v${gateway.firmware_version}` : "—"}
          </InfoCell>
          <InfoCell label="WiFi SSID" icon={<Wifi size={14} />}>{gateway.wifi_ssid ?? "—"}</InfoCell>
          <InfoCell label="MQTT"><StatusBadge status={gateway.mqtt_status} /></InfoCell>
        </div>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="Last seen" icon={<Clock size={14} />}>
            <span title={gateway.last_seen ? formatDateTime(gateway.last_seen) : undefined}>{formatRelative(gateway.last_seen)}</span>
          </InfoCell>
          <InfoCell label="Provision" icon={<QrCode size={14} />}><StatusBadge status={gateway.provision_status} /></InfoCell>
          <InfoCell label="Pair status" icon={<Link2 size={14} />}>{gateway.paired_count}/{gateway.node_count} đã ghép</InfoCell>
          <InfoCell label="Node" icon={<Layers size={14} />}>{gateway.node_count} node · {gateway.device_count} thiết bị</InfoCell>
        </div>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="IP gần nhất" icon={<Globe size={14} />}>
            <span className="font-mono text-xs">{gateway.last_ip ?? "—"}</span>
          </InfoCell>
          <InfoCell label="Tạo lúc" icon={<Network size={14} />}>{formatDateTime(gateway.created_at)}</InfoCell>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/ota" className={BTN_SECONDARY}>
          <UploadCloud className="h-3.5 w-3.5" /> OTA cho Gateway này
        </Link>
        <button type="button" onClick={() => setAction("restart")} className={BTN_WARNING_SOFT}>
          <RotateCcw className="h-3.5 w-3.5" /> Restart
        </button>
        <button type="button" onClick={() => setAction("reset")} className={BTN_DANGER_SOFT}>
          <Power className="h-3.5 w-3.5" /> Factory Reset
        </button>
      </div>

      <SimulatorControls sim={sim} category="gateway" isSimulated={gateway.is_simulated} />

      <Panel title={`Thiết bị qua Gateway này (${nodes.length})`} subtitle="Các thiết bị gắn với Node đã ghép với Gateway.">
        {nodes.length === 0 ? (
          <PanelEmpty>Gateway này chưa có thiết bị nào.</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Thiết bị</th>
                  <th className={TH}>Node</th>
                  <th className={TH}>Phòng</th>
                  <th className={TH}>Loại</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Kết nối</th>
                  <th className={TH}>Thấy lần cuối</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {nodes.map((d) => (
                  <tr key={d.id} className={TR}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900 dark:text-slate-100">{d.device_name}</p>
                      <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{d.device_uid}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">
                      {d.node_uid ?? <span className={MUTED_DASH}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">{d.room_name ?? <span className={MUTED_DASH}>—</span>}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><Cpu size={12} />{CATEGORY_LABELS[d.category]}</span>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-2.5"><OnlineIndicator online={d.online} /></td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-slate-500">{formatRelative(d.last_seen)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/devices/${d.id}`} className="text-xs font-semibold text-brand hover:brightness-90">Chi tiết →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Gateway & Provision Log" subtitle="50 sự kiện mới nhất của Gateway này.">
        {renderLogs?.({
          logs,
          emptyTitle: "Chưa có log nào",
          emptyDescription: "Gateway này chưa ghi nhận sự kiện gateway hoặc provision.",
        })}
      </Panel>

      {action === "restart" && (
        <ConfirmModal
          title="Restart Gateway"
          subtitle={gateway.uid}
          icon={RotateCcw}
          description="Gateway sẽ khởi động lại và mất kết nối tạm thời (vài chục giây); thiết bị trong nhà không nhận lệnh trong lúc đó. Tiếp tục?"
          confirmLabel="Restart"
          onConfirm={async () => {
            await restartGateway(gateway.id);
            void refresh();
            showToast("Đã gửi lệnh Restart. Gateway sẽ khởi động lại trong ít giây.");
          }}
          onClose={() => setAction(null)}
        />
      )}

      {action === "reset" && (
        <ConfirmModal
          title="Factory Reset Gateway"
          subtitle={gateway.uid}
          icon={Power}
          danger
          description={
            <>
              Factory Reset xoá toàn bộ cấu hình WiFi và ghép nối trên Gateway này; Gateway phải được cấu hình lại từ đầu.
              Hành động này không thể hoàn tác.
              {claimedHome && (
                <span className="mt-2 block text-xs text-gray-500 dark:text-slate-400">
                  Nhà đã được khách hàng kích hoạt — tài khoản Operator cần có quyền truy cập còn hiệu lực
                  (xin ở trang Smart Home) mới thực hiện được.
                </span>
              )}
            </>
          }
          confirmLabel="Factory Reset"
          onConfirm={async () => {
            await factoryResetGateway(gateway.id);
            void refresh();
            showToast("Đã gửi lệnh Factory Reset tới Gateway.");
          }}
          onClose={() => setAction(null)}
          errorOverrides={{
            ACCESS_GRANT_REQUIRED: home
              ? "Nhà này đã được khách hàng kích hoạt nên Factory Reset cần quyền truy cập có thời hạn. Mở trang Smart Home của nhà và bấm “Yêu cầu quyền truy cập”, rồi thử lại."
              : "Cần quyền truy cập có thời hạn để Factory Reset Gateway này. Liên hệ Admin để được cấp quyền.",
          }}
        />
      )}
    </div>
  );
}
