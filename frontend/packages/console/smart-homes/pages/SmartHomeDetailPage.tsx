"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Ban, Camera as CameraIcon, Eye, KeyRound, PauseCircle, Pencil, PlayCircle, Server, ShieldCheck,
} from "lucide-react";
import { useSmartHomeDetail } from "@smarthome/console/smart-homes/hooks/useSmartHomeDetail";
import type { SmartHomeDetail } from "@smarthome/console/smart-homes/hooks/useSmartHomeDetail";
import RoomCard from "@smarthome/console/smart-homes/components/RoomCard";
import HomeActivationPanel from "@smarthome/console/smart-homes/components/HomeActivationPanel";
import HomeLogPanel from "@smarthome/console/smart-homes/components/HomeLogPanel";
import RenameHomeDialog from "@smarthome/console/smart-homes/components/RenameHomeDialog";
import AccessRequestDialog from "@smarthome/console/smart-homes/components/AccessRequestDialog";
import OnlineIndicator from "@smarthome/console/devices/components/OnlineIndicator";
import AccessGrantNotice from "@smarthome/console/components/AccessGrantNotice";
import ConfirmModal from "@smarthome/console/components/ConfirmModal";
import Panel, { PanelEmpty } from "@smarthome/console/components/Panel";
import { LoadErrorBar, PageError, PageLoading } from "@smarthome/console/components/PageStates";
import { usePermissions } from "@smarthome/console/auth/usePermissions";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import Timeline from "@smarthome/shared/ui/Timeline";
import { useToast } from "@smarthome/shared/ui/Toast";
import { updateSmartHome } from "@smarthome/console/api/smartHomes.api";
import { revokeOperatorAccess } from "@smarthome/console/api/operatorAccess.api";
import { parseRouteId } from "@smarthome/console/lib/ids";
import { useNow } from "@smarthome/console/lib/hooks";
import { formatDate, formatDateTime, formatRelative, formatRemaining, formatRssi, initialsOf } from "@smarthome/console/lib/format";
import {
  CATEGORY_LABELS, MEMBER_ROLE_LABELS, PACKAGE_LABELS, ROOM_TYPE_LABELS, describeAction, describeTrigger,
} from "@smarthome/console/lib/labels";
import {
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_SUCCESS_SOFT, BTN_WARNING_SOFT, COUNT_PILL, MUTED_DASH,
  TABLE_HEAD_ROW, TH, TR,
} from "@smarthome/console/lib/ui";
import type { ConsoleDevice, ConsoleMember, ConsoleRoom } from "@smarthome/console/api/types";

type Tab = "overview" | "rooms" | "devices" | "members" | "automation" | "camera" | "history" | "log";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Thông tin" },
  { value: "rooms", label: "Rooms" },
  { value: "devices", label: "Devices" },
  { value: "members", label: "Members" },
  { value: "automation", label: "Automation" },
  { value: "camera", label: "Camera" },
  { value: "history", label: "History" },
  { value: "log", label: "Log" },
];

type DialogKind = "rename" | "access" | "suspend" | "reactivate" | "end-grant";

export default function SmartHomeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading, error, refresh } = useSmartHomeDetail(parseRouteId(id));

  if (!detail) {
    if (!error || isLoading) return <PageLoading />;
    return (
      <PageError
        error={error}
        backHref="/smart-homes"
        backLabel="Trở về Smart Homes"
        notFoundText="Không tìm thấy Smart Home này."
        onRetry={() => void refresh()}
      />
    );
  }
  return <SmartHomeDetailView detail={detail} loadError={error} refresh={refresh} />;
}

function SmartHomeDetailView({
  detail, loadError, refresh,
}: { detail: SmartHomeDetail; loadError: unknown; refresh: () => Promise<unknown> }) {
  const perms = usePermissions();
  const { showToast } = useToast();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("overview");
  const [dialog, setDialog] = useState<DialogKind | null>(null);

  const { home, devices, rooms, members, automation_rules: rules, timeline, access } = detail;
  const restricted = access.restricted;
  const grant = access.grant;
  const grantRemaining = grant ? formatRemaining(grant.expires_at, now) : null;
  const cameras = devices.filter((d) => d.category === "camera");
  const activeMembers = members.filter((m) => !m.pending);

  const counts: Partial<Record<Tab, number>> = {
    rooms: rooms.length,
    devices: devices.length,
    members: restricted ? undefined : members.length,
    automation: restricted ? undefined : rules.length,
    camera: cameras.length,
  };

  const requestAccessButton = perms.canRequestAccess ? (
    <button type="button" onClick={() => setDialog("access")} className={BTN_PRIMARY}>
      <KeyRound className="h-3.5 w-3.5" /> Yêu cầu quyền truy cập
    </button>
  ) : undefined;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/smart-homes" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Smart Homes
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{home.name}</h1>
            <StatusBadge status={home.status} />
            <span className="rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-500 dark:text-slate-400">{home.package}</span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{home.address || "Chưa có địa chỉ"}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {perms.canRenameHome(home.status) && (
            <button type="button" onClick={() => setDialog("rename")} className={BTN_SECONDARY}>
              <Pencil className="h-3.5 w-3.5" /> Đổi tên / địa chỉ
            </button>
          )}
          {perms.canSuspendHome && home.status === "active" && (
            <button type="button" onClick={() => setDialog("suspend")} className={BTN_WARNING_SOFT}>
              <PauseCircle className="h-3.5 w-3.5" /> Tạm ngưng
            </button>
          )}
          {perms.canSuspendHome && home.status === "suspended" && (
            <button type="button" onClick={() => setDialog("reactivate")} className={BTN_SUCCESS_SOFT}>
              <PlayCircle className="h-3.5 w-3.5" /> Kích hoạt lại
            </button>
          )}
        </div>
      </div>

      {!!loadError && <LoadErrorBar error={loadError} onRetry={() => void refresh()} />}

      {home.status === "suspended" && (
        <div className="rounded-md border border-critical/20 bg-critical-soft px-4 py-2.5 text-sm text-critical">
          Nhà đang tạm ngưng: khách hàng vẫn xem được dữ liệu nhưng không điều khiển được thiết bị hay chỉnh automation.
          {perms.canSuspendHome ? " Bấm “Kích hoạt lại” để khôi phục." : " Chỉ Admin kích hoạt lại được."}
        </div>
      )}

      {restricted && (
        <AccessGrantNotice action={requestAccessButton}>
          Nhà này đã được khách hàng kích hoạt. Thông tin cá nhân (thành viên, automation, nhiệt độ/độ ẩm, lịch sử) đang bị ẩn —
          cần quyền truy cập có thời hạn, mọi lần xem đều được ghi log.
        </AccessGrantNotice>
      )}

      {perms.isOperator && grant && !restricted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success/30 bg-success-soft px-4 py-2.5">
          <div className="flex min-w-0 items-start gap-2.5 text-sm text-success">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Bạn đang có quyền truy cập nhà này đến <span className="font-semibold">{formatDateTime(grant.expires_at)}</span>
              {grantRemaining && <> (còn {grantRemaining})</>}. Lý do: {grant.reason}
            </p>
          </div>
          <button type="button" onClick={() => setDialog("end-grant")} className={BTN_SM}>
            <Ban className="h-3 w-3" /> Kết thúc sớm
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-slate-700">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium transition
              ${tab === value ? "border-b-2 border-brand text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"}`}
          >
            {label}
            {counts[value] !== undefined && <span className={COUNT_PILL}>{counts[value]}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab detail={detail} activeMemberCount={activeMembers.length} onChanged={() => void refresh()} />
      )}
      {tab === "rooms" && <RoomsTab rooms={rooms} devices={devices} restricted={restricted} />}
      {tab === "devices" && <DevicesTab devices={devices} />}
      {tab === "members" && (
        restricted
          ? <AccessGrantNotice action={requestAccessButton}>Cần quyền truy cập để xem thành viên của nhà đã kích hoạt.</AccessGrantNotice>
          : <MembersTab members={members} />
      )}
      {tab === "automation" && (
        restricted
          ? <AccessGrantNotice action={requestAccessButton}>Cần quyền truy cập để xem các rule tự động hoá của nhà đã kích hoạt.</AccessGrantNotice>
          : (
            <Panel
              title="Rule tự động hoá"
              subtitle="Rule do khách hàng tạo trên ứng dụng — nhân viên chỉ xem."
              action={<Link href="/automation" className="text-xs font-semibold text-brand hover:brightness-90">Mở Automation →</Link>}
            >
              {rules.length === 0 ? (
                <PanelEmpty>Nhà này chưa có rule nào.</PanelEmpty>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {rules.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-100">
                          {r.name}
                          {r.origin === "ai_suggested" && (
                            <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">Gợi ý AI</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Nếu {describeTrigger(r)} → {describeAction(r)}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-slate-500">
                          Chạy gần nhất: {formatRelative(r.last_triggered_at, "chưa chạy")}
                        </p>
                      </div>
                      <StatusBadge status={r.enabled ? "active" : "inactive"} label={r.enabled ? "Bật" : "Tắt"} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )
      )}
      {tab === "camera" && <CameraTab cameras={cameras} />}
      {tab === "history" && (
        restricted
          ? <AccessGrantNotice action={requestAccessButton}>Cần quyền truy cập để xem lịch sử hoạt động của nhà đã kích hoạt.</AccessGrantNotice>
          : (
            <Panel title="Lịch sử nhà" subtitle="Tạo nhà, mã kích hoạt, chủ nhà, thành viên, gateway — mới nhất trước.">
              <div className="p-4">
                <Timeline
                  items={timeline.map((e) => ({
                    id: e.id,
                    timestamp: e.timestamp,
                    label: e.label,
                    description: e.description ?? undefined,
                  }))}
                />
              </div>
            </Panel>
          )
      )}
      {tab === "log" && (
        <HomeLogPanel homeId={home.id} defaultCategory={home.status === "unclaimed" ? "provision" : "device"} />
      )}

      {dialog === "rename" && (
        <RenameHomeDialog
          home={home}
          onClose={() => setDialog(null)}
          onSaved={() => { void refresh(); showToast("Đã cập nhật thông tin nhà."); }}
        />
      )}

      {dialog === "access" && (
        <AccessRequestDialog
          homeId={home.id}
          homeName={home.name}
          onClose={() => setDialog(null)}
          onGranted={() => { void refresh(); showToast("Đã cấp quyền truy cập — dữ liệu nhà đã được mở."); }}
        />
      )}

      {dialog === "suspend" && (
        <ConfirmModal
          title="Tạm ngưng Smart Home"
          subtitle={home.name}
          icon={PauseCircle}
          danger
          description="Nhà chuyển sang chế độ chỉ xem: khách hàng không điều khiển được thiết bị hay chỉnh automation cho tới khi bạn kích hoạt lại."
          confirmLabel="Tạm ngưng"
          onConfirm={async () => {
            await updateSmartHome(home.id, { status: "suspended" });
            await refresh();
            showToast("Đã tạm ngưng Smart Home.");
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "reactivate" && (
        <ConfirmModal
          title="Kích hoạt lại Smart Home"
          subtitle={home.name}
          icon={PlayCircle}
          description="Khách hàng sẽ điều khiển được thiết bị và chỉnh automation trở lại."
          confirmLabel="Kích hoạt lại"
          onConfirm={async () => {
            await updateSmartHome(home.id, { status: "active" });
            await refresh();
            showToast("Đã kích hoạt lại Smart Home.");
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "end-grant" && grant && (
        <ConfirmModal
          title="Kết thúc quyền truy cập"
          subtitle={home.name}
          icon={Ban}
          danger
          description="Quyền truy cập của bạn vào dữ liệu nhà này kết thúc ngay. Muốn xem lại phải gửi yêu cầu mới."
          confirmLabel="Kết thúc"
          onConfirm={async () => {
            await revokeOperatorAccess(grant.id);
            await refresh();
            showToast("Đã kết thúc quyền truy cập.");
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab "Thông tin"
// ---------------------------------------------------------------------------
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2 text-sm">
      <dt className="w-28 shrink-0 text-gray-400 dark:text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-gray-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

function OverviewTab({
  detail, activeMemberCount, onChanged,
}: { detail: SmartHomeDetail; activeMemberCount: number; onChanged: () => void }) {
  const { home, owner, gateway, rooms, devices, automation_rules: rules, activation, access } = detail;
  const restricted = access.restricted;
  const onlineCount = devices.filter((d) => d.online).length;

  const stats: { label: string; value: string }[] = [
    { label: "Phòng", value: String(rooms.length) },
    { label: "Thiết bị online", value: `${onlineCount}/${devices.length}` },
    { label: "Thành viên", value: restricted ? "—" : String(activeMemberCount) },
    { label: "Rule automation", value: restricted ? "—" : String(rules.length) },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <p className="text-xl font-semibold text-gray-900 dark:text-slate-100">{s.value}</p>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {home.status === "unclaimed" && <HomeActivationPanel home={home} activation={activation} onChanged={onChanged} />}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Thông tin">
          <dl className="divide-y divide-gray-50 dark:divide-slate-700/60 py-1">
            <InfoRow label="Chủ nhà">
              {owner ? (
                <>
                  <Link href={`/customers/${owner.id}`} className="font-medium text-brand hover:brightness-90">{owner.name}</Link>{" "}
                  <span className="font-mono text-xs text-gray-400 dark:text-slate-500">({owner.user_tag})</span>
                </>
              ) : home.owner_name ?? <span className="text-gray-400 dark:text-slate-500">Chưa có chủ sở hữu</span>}
            </InfoRow>
            {home.status === "unclaimed" && home.expected_owner_name && (
              <InfoRow label="Chủ dự kiến">{home.expected_owner_name}</InfoRow>
            )}
            {owner && (owner.email || owner.phone) && (
              <InfoRow label="Liên hệ">{[owner.phone, owner.email].filter(Boolean).join(" · ")}</InfoRow>
            )}
            <InfoRow label="Địa chỉ">{home.address || <span className={MUTED_DASH}>—</span>}</InfoRow>
            <InfoRow label="Gói">{PACKAGE_LABELS[home.package]}</InfoRow>
            <InfoRow label="Múi giờ">{home.timezone}</InfoRow>
            <InfoRow label="Kích hoạt">{home.activated_at ? formatDateTime(home.activated_at) : "Chưa kích hoạt"}</InfoRow>
            <InfoRow label="Tạo lúc">
              {formatDate(home.created_at)}{home.created_by_username ? ` · bởi ${home.created_by_username}` : ""}
            </InfoRow>
          </dl>
        </Panel>

        <Panel title="Gateway">
          {gateway ? (
            <div className="space-y-2.5 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Server size={14} className="text-gray-400 dark:text-slate-500" />
                <span className="font-mono text-gray-900 dark:text-slate-100">{gateway.uid}</span>
                <StatusBadge status={gateway.status} />
                {gateway.is_simulated && (
                  <span className="rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400">Mô phỏng</span>
                )}
              </div>
              <p className="text-gray-500 dark:text-slate-400">
                Firmware: <span className="font-mono">{gateway.firmware_version ? `v${gateway.firmware_version}` : "—"}</span>
                {" · "}RSSI: {formatRssi(gateway.rssi)}
                {" · "}Nodes: {gateway.paired_count}/{gateway.node_count}
              </p>
              <p className="text-gray-500 dark:text-slate-400">Thấy lần cuối: {formatRelative(gateway.last_seen)}</p>
              <Link href={`/gateways/${gateway.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:brightness-90">
                Xem chi tiết Gateway →
              </Link>
            </div>
          ) : (
            <PanelEmpty>Chưa gán Gateway.</PanelEmpty>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab "Rooms"
// ---------------------------------------------------------------------------
function RoomsTab({ rooms, devices, restricted }: { rooms: ConsoleRoom[]; devices: ConsoleDevice[]; restricted: boolean }) {
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const activeRoom = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0] ?? null;
  const roomDevices = activeRoom ? devices.filter((d) => d.room_id === activeRoom.id) : [];

  if (rooms.length === 0) {
    return <Panel title="Rooms"><PanelEmpty>Nhà này chưa có phòng nào.</PanelEmpty></Panel>;
  }

  return (
    <div className="space-y-3">
      {restricted && (
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Số liệu nhiệt độ/độ ẩm của từng phòng được ẩn cho tới khi bạn có quyền truy cập.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            climateHidden={restricted}
            active={activeRoom?.id === room.id}
            onClick={() => setSelectedRoomId(room.id)}
          />
        ))}
      </div>

      {activeRoom && (
        <Panel title={activeRoom.name} subtitle={ROOM_TYPE_LABELS[activeRoom.room_type as keyof typeof ROOM_TYPE_LABELS] ?? activeRoom.room_type}>
          {roomDevices.length === 0 ? (
            <PanelEmpty>Phòng này chưa có thiết bị.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {roomDevices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{d.device_name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{CATEGORY_LABELS[d.category]}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <OnlineIndicator online={d.online} />
                    <StatusBadge status={d.status} />
                    <Link href={`/devices/${d.id}`} className={BTN_SM}>
                      <Eye className="h-3 w-3" /> Chi tiết
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab "Devices"
// ---------------------------------------------------------------------------
function DevicesTab({ devices }: { devices: ConsoleDevice[] }) {
  return (
    <Panel title="Thiết bị của nhà" subtitle="Chỉ gồm thông tin sức khoẻ thiết bị — số đo cảm biến xem ở trang chi tiết (cần quyền truy cập với nhà đã kích hoạt).">
      {devices.length === 0 ? (
        <PanelEmpty>Nhà này chưa có thiết bị.</PanelEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-left text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th className={TH}>Thiết bị</th>
                <th className={TH}>Phòng</th>
                <th className={TH}>Loại</th>
                <th className={TH}>Trạng thái</th>
                <th className={TH}>Kết nối</th>
                <th className={TH}>Thấy lần cuối</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {devices.map((d) => (
                <tr key={d.id} className={TR}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900 dark:text-slate-100">{d.device_name}</p>
                    <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{d.device_uid}</p>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">{d.room_name ?? <span className={MUTED_DASH}>—</span>}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">{CATEGORY_LABELS[d.category]}</td>
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
  );
}

// ---------------------------------------------------------------------------
// Tab "Members" (chỉ xem — thành viên tự quản lý qua ứng dụng)
// ---------------------------------------------------------------------------
function MembersTab({ members }: { members: ConsoleMember[] }) {
  return (
    <Panel title="Thành viên" subtitle="Chỉ xem — chủ nhà tự mời và phân quyền thành viên trên ứng dụng.">
      {members.length === 0 ? (
        <PanelEmpty>Chưa có thành viên nào.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-slate-700">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold uppercase text-white">
                {m.initials ?? initialsOf(m.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-100">
                  {m.name}
                  {m.pending && <StatusBadge status="pending" label="Lời mời chờ chấp nhận" />}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {MEMBER_ROLE_LABELS[m.role]}
                  {m.email ? ` · ${m.email}` : ""}
                  {m.pending && m.invite_expires_at ? ` · lời mời hết hạn ${formatDateTime(m.invite_expires_at)}` : ""}
                  {!m.pending && m.expires_at ? ` · quyền hết hạn ${formatDateTime(m.expires_at)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Tab "Camera"
// ---------------------------------------------------------------------------
function CameraTab({ cameras }: { cameras: ConsoleDevice[] }) {
  if (cameras.length === 0) {
    return <Panel title="Camera"><PanelEmpty>Nhà này chưa có camera.</PanelEmpty></Panel>;
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cameras.map((c) => (
          <div key={c.id} className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <div className="flex h-24 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
              <CameraIcon className="h-6 w-6 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-slate-100">{c.device_name}</p>
            <p className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{c.device_uid}</p>
            <div className="mt-2 flex items-center gap-2">
              <OnlineIndicator online={c.online} />
              <StatusBadge status={c.status} />
              <Link href={`/devices/${c.id}`} className="ml-auto text-xs font-semibold text-brand hover:brightness-90">Chi tiết →</Link>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500">
        Dashboard chỉ theo dõi trạng thái camera; xem trực tiếp và snapshot chưa được hỗ trợ.
      </p>
    </div>
  );
}
