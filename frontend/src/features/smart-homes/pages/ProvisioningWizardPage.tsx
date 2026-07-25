"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, QrCode, CheckCircle2, KeyRound } from "lucide-react";
import Stepper from "@/shared/ui/Stepper";
import StatusBadge from "@/shared/ui/StatusBadge";
import AssignOwnerModal from "@/features/smart-homes/components/AssignOwnerModal";
import { useToast } from "@/shared/ui/Toast";
import { smartHomeStore, roomStore, deviceStore, gatewayStore, customerStore } from "@/shared/mock/store";
import type { PackageCode, Room, MockDevice, SmartHome, Gateway } from "@/shared/mock/types";

const STEPS = ["Create Home", "Room/Device Preview", "Gateway & Node UID", "Activation Code", "Ready to Sell"];

type NodeGroup = {
  uid: string;
  label: string;
  deviceNames: string[];
};

function randomNodeUid(): string {
  return `ESP32-ND-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
}

// Node vật lý được gắn theo Phòng (1 board ESP32 xử lý mọi sensor/relay/camera
// trong phòng đó) và theo Cửa (khoá cửa luôn là 1 board riêng, tách khỏi node
// của phòng) — không phải mỗi thiết bị logic là 1 node phần cứng riêng.
function buildNodeGroups(rooms: Room[], devices: MockDevice[]): NodeGroup[] {
  const groups: NodeGroup[] = [];
  rooms.forEach((room) => {
    const roomDevices = devices.filter((d) => d.room_id === room.id);
    const doorDevices = roomDevices.filter((d) => d.category === "door_contact");
    const nonDoorDevices = roomDevices.filter((d) => d.category !== "door_contact");
    if (nonDoorDevices.length > 0) {
      groups.push({ uid: randomNodeUid(), label: room.name, deviceNames: nonDoorDevices.map((d) => d.device_name) });
    }
    doorDevices.forEach((d) => {
      groups.push({ uid: randomNodeUid(), label: `Cửa - ${room.name}`, deviceNames: [d.device_name] });
    });
  });
  return groups;
}

// Package → template used to auto-generate Rooms/Devices (Operator confirms,
// doesn't hand-enter every device — per doc §9.8).
const PACKAGE_TEMPLATES: Record<PackageCode, { room: Room["room_type"]; roomName: string; devices: { name: string; category: MockDevice["category"] }[] }[]> = {
  KIT_A: [
    { room: "living_room", roomName: "Living room", devices: [{ name: "Cảm biến nhiệt/ẩm", category: "sensor" }, { name: "Lightings", category: "relay" }] },
    { room: "bedroom", roomName: "Bedroom", devices: [{ name: "Cảm biến nhiệt/ẩm", category: "sensor" }] },
    { room: "kitchen", roomName: "Kitchen", devices: [{ name: "Cảm biến nhiệt/ẩm", category: "sensor" }] },
    { room: "bathroom", roomName: "Bathroom", devices: [{ name: "Door locks", category: "door_contact" }] },
  ],
  KIT_B: [
    { room: "living_room", roomName: "Living room", devices: [{ name: "Cảm biến nhiệt/ẩm", category: "sensor" }, { name: "Camera cửa chính", category: "camera" }] },
    { room: "bedroom", roomName: "Bedroom", devices: [{ name: "Cảm biến nhiệt/ẩm", category: "sensor" }] },
    { room: "office", roomName: "Office", devices: [{ name: "Lightings", category: "relay" }] },
  ],
};

export default function ProvisioningWizardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [homeName, setHomeName] = useState("");
  const [packageCode, setPackageCode] = useState<PackageCode>("KIT_A");

  const [home, setHome] = useState<SmartHome | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<MockDevice[]>([]);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [activationCode] = useState(() => Math.random().toString(36).slice(2, 10).toUpperCase());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignedOwnerName, setAssignedOwnerName] = useState<string | null>(null);

  function handleAssignOwner(customerId: number) {
    if (!home) return;
    smartHomeStore.assignOwner(home.id, customerId);
    const customer = customerStore.get(customerId);
    setAssignedOwnerName(customer?.name ?? null);
    showToast(`Đã gán "${home.name}" cho ${customer?.name ?? "khách hàng"}.`);
  }

  function handleCreateHome() {
    if (!homeName.trim()) return;
    const created = smartHomeStore.createUnclaimed({ name: homeName.trim(), package: packageCode });
    const createdRooms: Room[] = [];
    const createdDevices: MockDevice[] = [];
    PACKAGE_TEMPLATES[packageCode].forEach((tpl) => {
      const room = roomStore.createForHome(created.id, tpl.roomName, tpl.room);
      createdRooms.push(room);
      tpl.devices.forEach((d) => {
        createdDevices.push(deviceStore.createInRoom({ device_name: d.name, category: d.category, room_id: room.id, home_id: created.id, location: tpl.roomName }));
      });
    });
    setHome(created);
    setRooms(createdRooms);
    setDevices(createdDevices);
    setStep(1);
  }

  // Sinh UID cho cả Gateway lẫn từng Node (thiết bị) trong nhà — đây là bước
  // Operator cầm UID này đi flash WiFi + Secret Key vật lý tại kho, để khi
  // hoạt động Gateway và từng Node xác thực lẫn nhau bằng UID + Secret đó.
  function handleGenerateUids() {
    if (!home) return;
    const gw = gatewayStore.createForHome(home.id);
    smartHomeStore.update(home.id, { gateway_id: gw.id });
    setGateway(gw);
    setNodeGroups(buildNodeGroups(rooms, devices));
    setStep(2);
  }

  return (
    <div className="w-full max-w-3xl space-y-4">
      <Link href="/smart-homes" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Smart Homes
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Provisioning Wizard</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Tạo Smart Home mới cho đơn hàng — từ tạo nhà đến sẵn sàng bán.</p>
      </div>

      <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <Stepper steps={STEPS} currentStep={step} />

        <div className="mt-6">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Tên Smart Home</label>
                <input
                  type="text" value={homeName} onChange={(e) => setHomeName(e.target.value)}
                  placeholder="VD: Nhà Quận 2"
                  className="h-10 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Package</label>
                <div className="grid grid-cols-2 gap-3">
                  {(["KIT_A", "KIT_B"] as PackageCode[]).map((p) => (
                    <button
                      key={p} type="button" onClick={() => setPackageCode(p)}
                      className={`rounded-md border-2 px-4 py-3 text-left transition
                        ${packageCode === p ? "border-brand bg-brand-soft/40" : "border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500"}`}
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{p}</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500">{PACKAGE_TEMPLATES[p].length} phòng mẫu</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={!homeName.trim()} onClick={handleCreateHome}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50">
                  Tiếp tục →
                </button>
              </div>
            </div>
          )}

          {step === 1 && home && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-slate-300">
                Hệ thống đã tự sinh <strong>{rooms.length} phòng</strong> và <strong>{devices.length} thiết bị</strong> theo template <span className="font-mono">{home.package}</span>.
              </p>
              <div className="space-y-2">
                {rooms.map((room) => (
                  <div key={room.id} className="rounded border border-gray-100 dark:border-slate-700 p-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{room.name}</p>
                    <ul className="mt-1 space-y-0.5 pl-3 text-xs text-gray-500 dark:text-slate-400">
                      {devices.filter((d) => d.room_id === room.id).map((d) => (
                        <li key={d.id}>· {d.device_name} <span className="capitalize text-gray-300 dark:text-slate-600">({d.category})</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={handleGenerateUids}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90">
                  Sinh UID Gateway &amp; Node →
                </button>
              </div>
            </div>
          )}

          {step === 2 && gateway && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-slate-300">
                Gateway và {nodeGroups.length} Node (mỗi phòng và mỗi cửa là 1 node phần cứng riêng) đã được sinh UID —
                Operator dùng các UID này để flash WiFi + Secret Key vật lý tại kho.
              </p>

              <div className="rounded border border-gray-100 dark:border-slate-700 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Gateway UID</p>
                <p className="mt-1 font-mono text-sm text-gray-900 dark:text-slate-100">{gateway.uid}</p>
              </div>

              <div className="overflow-hidden rounded border border-gray-100 dark:border-slate-700">
                <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Node UID ({nodeGroups.length})</p>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {nodeGroups.map((node) => (
                    <li key={node.uid} className="flex items-center justify-between gap-3 px-4 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{node.label}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">{node.deviceNames.join(", ")}</p>
                      </div>
                      <span className="font-mono text-xs text-gray-700 dark:text-slate-300">{node.uid}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-gray-400 dark:text-slate-500">
                Operator flash firmware, cấu hình WiFi &amp; thiết lập Secret Key trực tiếp tại kho cho cả Gateway và từng Node —
                Dashboard không bao giờ hiển thị Secret Key. Khi hoạt động, Gateway và Node xác thực lẫn nhau bằng cặp UID + Secret Key đã flash.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setStep(3)}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90">
                  Sinh mã kích hoạt →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-slate-300">Mã kích hoạt và QR để in tem — khách hàng quét khi đăng ký trên Mobile App.</p>
              <div className="flex flex-col items-center gap-3 rounded border border-gray-100 dark:border-slate-700 p-6">
                <div className="flex h-32 w-32 items-center justify-center rounded border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-900">
                  <QrCode className="h-14 w-14 text-gray-400 dark:text-slate-500" />
                </div>
                <p className="font-mono text-lg font-bold tracking-widest text-gray-900 dark:text-slate-100">{activationCode}</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setStep(4)}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90">
                  Xác nhận in tem →
                </button>
              </div>
            </div>
          )}

          {step === 4 && home && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100">Sẵn sàng bán — Ready to Sell</p>
              <p className="max-w-sm text-sm text-gray-500 dark:text-slate-400">
                <span className="font-medium">{home.name}</span> đã được đóng gói với mã kích hoạt <span className="font-mono">{activationCode}</span>, sẵn sàng xuất kho.
              </p>

              {assignedOwnerName ? (
                <div className="flex flex-col items-center gap-1">
                  <StatusBadge status="active" label="Đã kích hoạt" />
                  <p className="text-sm text-gray-600 dark:text-slate-300">Đã gán cho khách hàng <span className="font-medium">{assignedOwnerName}</span>.</p>
                </div>
              ) : (
                <>
                  <StatusBadge status="unclaimed" />
                  <div className="w-full max-w-sm rounded border border-dashed border-gray-200 dark:border-slate-600 p-3 text-center">
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Nếu khách hàng đã có tài khoản trên Mobile App (thay vì chờ họ tự quét QR), Operator có thể gán quyền sở hữu ngay bây giờ.
                    </p>
                    <button type="button" onClick={() => setAssignOpen(true)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded border border-brand/30 bg-brand-soft px-3.5 py-1.5 text-sm font-semibold text-brand transition hover:brightness-95">
                      <KeyRound className="h-3.5 w-3.5" /> Gán cho khách hàng (User ID)
                    </button>
                  </div>
                </>
              )}

              <div className="mt-2 flex gap-2">
                <Link href={`/smart-homes/${home.id}`} className="rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-600">
                  Xem chi tiết nhà
                </Link>
                <button type="button" onClick={() => router.push("/smart-homes")}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90">
                  Về danh sách Smart Homes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {home && (
        <AssignOwnerModal
          open={assignOpen}
          homeName={home.name}
          onClose={() => setAssignOpen(false)}
          onAssign={handleAssignOwner}
        />
      )}
    </div>
  );
}
