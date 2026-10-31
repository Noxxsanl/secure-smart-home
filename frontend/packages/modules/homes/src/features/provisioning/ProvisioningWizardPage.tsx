"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, KeyRound, ShieldCheck, Copy, Check, AlertTriangle, RefreshCw, Server, Cpu,
} from "lucide-react";
import {
  Stepper, StatusBadge, useToast, InlineError, BTN_BRAND_SOFT, BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL,
} from "@shh/ui";
import AssignOwnerModal from "../../ui/AssignOwnerModal";
import { useAssignOwner, type AssignOwnerOptions } from "../../api/useAssignOwner";
import ActivationCodePanel from "../../ui/ActivationCodePanel";
import { createSmartHome } from "../../api/smartHomes.api";
import { revalidateDashboard, CATEGORY_LABELS, errorMessage } from "@shh/api-client/dashboard";
import { PACKAGE_TEMPLATES, templateSummary } from "../../model/templates";
import { useBeforeUnload } from "@shh/utils";
import type { Customer, PackageCode, ProvisionResult } from "@shh/api-client/dashboard";

const STEPS = ["Tạo Smart Home", "Phòng & thiết bị", "Gateway & Node UID", "Mã kích hoạt & QR", "Sẵn sàng bán"];

const LEAVE_WARNING = "Mã kích hoạt chỉ hiển thị một lần và chưa được in. Rời trang bây giờ sẽ phải tạo mã mới. Vẫn rời trang?";

function CountCheck({ label, actual, expected }: { label: string; actual: number; expected: number }) {
  const ok = actual === expected;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
      {ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {actual} {label}{!ok && ` (template: ${expected})`}
    </span>
  );
}

// FR-2.7 — 5 bước: Tạo nhà → Xem phòng/thiết bị → UID Gateway/Node → Mã kích hoạt/QR → Sẵn sàng bán.
// Bước 1 gọi POST /smart-homes ĐÚNG MỘT LẦN (FR-2.2: backend tạo mọi thứ trong 1 transaction);
// các bước sau chỉ hiển thị dữ liệu từ response — không có request tạo thêm nào.
export default function ProvisioningWizardPage() {
  const { showToast } = useToast();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [packageCode, setPackageCode] = useState<PackageCode>("KIT_A");
  const [address, setAddress] = useState("");
  const [expectedOwner, setExpectedOwner] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [owner, setOwner] = useState<Customer | null>(null);
  const [copied, setCopied] = useState(false);

  // Bước 2–4 (sau khi tạo, trước khi xác nhận đã in tem): mã kích hoạt in-một-lần chưa được lưu lại ở đâu.
  const codeAtRisk = result !== null && step < 4;
  useBeforeUnload(codeAtRisk);

  async function handleCreate() {
    if (submittedRef.current || result) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) { setFormError("Nhập tên Smart Home (ít nhất 2 ký tự)."); return; }
    if (trimmedName.length > 128) { setFormError("Tên Smart Home tối đa 128 ký tự."); return; }
    if (address.trim().length > 255) { setFormError("Địa chỉ tối đa 255 ký tự."); return; }
    if (expectedOwner.trim().length > 128) { setFormError("Tên chủ nhà dự kiến tối đa 128 ký tự."); return; }

    submittedRef.current = true;
    setSubmitting(true);
    setFormError("");
    try {
      const created = await createSmartHome({
        name: trimmedName,
        package: packageCode,
        address: address.trim() || undefined,
        expected_owner_name: expectedOwner.trim() || undefined,
      });
      setResult(created);
      setStep(1);
      void revalidateDashboard("/smart-homes", "/stats");
    } catch (err) {
      submittedRef.current = false;
      setFormError(`${errorMessage(err)} Chưa có dữ liệu nào được tạo — sửa thông tin rồi bấm lại.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUids() {
    if (!result) return;
    const lines = [
      `Gateway: ${result.gateway.uid}`,
      ...result.nodes.map((n) => `${n.room_name}: ${n.node_uid} (${n.device_names.join(", ")})`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Trình duyệt không cho phép sao chép. Hãy chọn và sao chép thủ công.", false);
    }
  }

  function resetWizard() {
    submittedRef.current = false;
    setResult(null); setOwner(null); setStep(0);
    setName(""); setAddress(""); setExpectedOwner(""); setPackageCode("KIT_A"); setFormError("");
  }

  function guardLeave(e: React.MouseEvent) {
    if (codeAtRisk && !window.confirm(LEAVE_WARNING)) e.preventDefault();
  }

  const template = PACKAGE_TEMPLATES[packageCode];
  const expected = templateSummary(result?.home.package ?? packageCode);
  const resultDevices = result?.devices.filter((d) => d.category !== "gateway") ?? [];

  return (
    <div className="w-full max-w-4xl space-y-4">
      <Link href="/smart-homes" onClick={guardLeave} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Smart Homes
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Provisioning Wizard</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Chuẩn bị kit Smart Home cho đơn hàng — từ tạo nhà đến in tem, sẵn sàng bán.</p>
      </div>

      <div className={`${CARD} p-5`}>
        <Stepper steps={STEPS} currentStep={step} />

        <div className="mt-6">
          {/* Bước 1 — thông tin nhà + gói */}
          {step === 0 && (
            <form noValidate onSubmit={(e) => { e.preventDefault(); void handleCreate(); }} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="wiz-name" className={LABEL}>Tên Smart Home <span className="text-critical">*</span></label>
                  <input id="wiz-name" type="text" value={name} maxLength={128} onChange={(e) => setName(e.target.value)}
                    placeholder="VD: Kit KIT_A — Đơn #1042" className={INPUT} disabled={submitting} />
                  <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Tên tạm cho kho; khách hàng có thể đổi tên sau khi kích hoạt.</p>
                </div>
                <div>
                  <label htmlFor="wiz-address" className={LABEL}>Địa chỉ / vị trí kho (tuỳ chọn)</label>
                  <input id="wiz-address" type="text" value={address} maxLength={255} onChange={(e) => setAddress(e.target.value)}
                    placeholder="VD: Kho Quận 7 — kệ B2" className={INPUT} disabled={submitting} />
                </div>
                <div>
                  <label htmlFor="wiz-owner" className={LABEL}>Tên chủ nhà dự kiến (tuỳ chọn)</label>
                  <input id="wiz-owner" type="text" value={expectedOwner} maxLength={128} onChange={(e) => setExpectedOwner(e.target.value)}
                    placeholder="Chỉ là ghi chú, không cấp quyền" className={INPUT} disabled={submitting} />
                </div>
              </div>

              <div>
                <p className={LABEL}>Gói thiết bị</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["KIT_A", "KIT_B"] as PackageCode[]).map((p) => {
                    const summary = templateSummary(p);
                    return (
                      <button
                        key={p} type="button" onClick={() => setPackageCode(p)} disabled={submitting}
                        className={`rounded-md border-2 px-4 py-3 text-left transition
                          ${packageCode === p ? "border-brand bg-brand-soft/40" : "border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500"}`}
                      >
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{PACKAGE_TEMPLATES[p].title}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{PACKAGE_TEMPLATES[p].description}</p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                          {summary.rooms} phòng · 1 Gateway · {summary.nodes} Node · {summary.devices} thiết bị
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded border border-gray-100 dark:border-slate-700">
                <p className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  Xem trước template {packageCode}
                </p>
                <ul className="grid gap-px bg-gray-100 dark:bg-slate-700 sm:grid-cols-2">
                  {template.rooms.map((room) => (
                    <li key={room.node} className="bg-white dark:bg-slate-800 px-4 py-2.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                        {room.name} <span className="ml-1 font-mono text-[11px] text-gray-400 dark:text-slate-500">{room.node}</span>
                      </p>
                      <ul className="mt-0.5 space-y-0.5 text-xs text-gray-500 dark:text-slate-400">
                        {room.devices.map((d) => (
                          <li key={d.name}>· {d.name} <span className="text-gray-300 dark:text-slate-600">({CATEGORY_LABELS[d.category]})</span></li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>

              <InlineError>{formError}</InlineError>

              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  Hệ thống tạo nhà, phòng, Gateway, Node và mã kích hoạt trong một lần — lỗi ở bất kỳ bước nào thì không có gì được lưu.
                </p>
                <button type="submit" disabled={submitting || name.trim().length < 2} className={BTN_PRIMARY}>
                  {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {submitting ? "Đang tạo…" : "Tạo Smart Home →"}
                </button>
              </div>
            </form>
          )}

          {/* Bước 2 — phòng & thiết bị đã sinh */}
          {step === 1 && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded border border-success/30 bg-success-soft px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Đã tạo <span className="font-semibold">{result.home.name}</span> (trạng thái <span className="font-semibold">Unclaimed</span>) theo template {result.home.package}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CountCheck label="phòng" actual={result.rooms.length} expected={expected.rooms} />
                <CountCheck label="Gateway" actual={result.gateway ? 1 : 0} expected={expected.gateways} />
                <CountCheck label="Node" actual={result.nodes.length} expected={expected.nodes} />
                <CountCheck label="thiết bị" actual={resultDevices.length} expected={expected.devices} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.rooms.map((room) => (
                  <div key={room.id} className="rounded border border-gray-100 dark:border-slate-700 p-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{room.name}</p>
                    <ul className="mt-1 space-y-0.5 pl-3 text-xs text-gray-500 dark:text-slate-400">
                      {resultDevices.filter((d) => d.room_id === room.id).map((d) => (
                        <li key={d.id}>· {d.device_name} <span className="text-gray-300 dark:text-slate-600">({CATEGORY_LABELS[d.category]})</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setStep(2)} className={BTN_PRIMARY}>Xem UID Gateway &amp; Node →</button>
              </div>
            </div>
          )}

          {/* Bước 3 — UID để flash tại kho (không có secret) */}
          {step === 2 && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-600 dark:text-slate-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <p>
                  Dùng các UID dưới đây khi flash firmware tại kho. <span className="font-semibold">Secret Key của Gateway/Node không bao giờ hiển thị trên Dashboard</span> —
                  công cụ flash nội bộ lấy secret trực tiếp từ hệ thống và ghi vào thiết bị. Khi hoạt động, Gateway và Node xác thực bằng cặp UID + Secret đã flash.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded border border-gray-100 dark:border-slate-700 p-4">
                <div className="flex items-center gap-3">
                  <Server className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Gateway UID</p>
                    <p className="mt-0.5 font-mono text-sm text-gray-900 dark:text-slate-100">{result.gateway.uid}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400 dark:text-slate-500">Firmware {result.gateway.firmware_version ?? "—"}</span>
              </div>

              <div className="overflow-hidden rounded border border-gray-100 dark:border-slate-700">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Node UID ({result.nodes.length})</p>
                  <button type="button" onClick={copyUids} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:brightness-90">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Đã sao chép" : "Sao chép tất cả UID"}
                  </button>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {result.nodes.map((node) => (
                    <li key={node.node_uid} className="flex items-center justify-between gap-3 px-4 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Cpu className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{node.room_name}</p>
                          <p className="truncate text-xs text-gray-400 dark:text-slate-500">{node.device_names.join(", ")}</p>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-gray-700 dark:text-slate-300">{node.node_uid}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-between gap-2 pt-2">
                <button type="button" onClick={() => setStep(1)} className={BTN_SECONDARY}>← Quay lại</button>
                <button type="button" onClick={() => setStep(3)} className={BTN_PRIMARY}>Xem mã kích hoạt →</button>
              </div>
            </div>
          )}

          {/* Bước 4 — mã kích hoạt + QR + in tem (FR-2.4, 2.5) */}
          {step === 3 && result && (
            <div className="space-y-4">
              <ActivationCodePanel activation={result.activation} homeName={result.home.name} packageCode={result.home.package} />
              <div className="flex justify-between gap-2 pt-2">
                <button type="button" onClick={() => setStep(2)} className={BTN_SECONDARY}>← Quay lại</button>
                <button type="button" onClick={() => setStep(4)} className={BTN_PRIMARY}>Đã in tem, tiếp tục →</button>
              </div>
            </div>
          )}

          {/* Bước 5 — sẵn sàng bán + gán chủ (tuỳ chọn) */}
          {step === 4 && result && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100">Sẵn sàng bán — Ready to Sell</p>
              <p className="max-w-md text-sm text-gray-500 dark:text-slate-400">
                <span className="font-medium">{result.home.name}</span> ({result.home.package}) đã được đóng gói kèm tem kích hoạt, nằm trong Provisioning Queue chờ xuất kho.
              </p>

              {owner ? (
                <div className="flex flex-col items-center gap-1">
                  <StatusBadge status="active" label="Đã kích hoạt" />
                  <p className="text-sm text-gray-600 dark:text-slate-300">
                    Đã gán cho khách hàng <span className="font-medium">{owner.name}</span> <span className="font-mono text-xs">({owner.user_tag})</span>.
                  </p>
                </div>
              ) : (
                <>
                  <StatusBadge status="unclaimed" />
                  <div className="w-full max-w-md rounded border border-dashed border-gray-200 dark:border-slate-600 p-3 text-center">
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Khách hàng đã có tài khoản trên ứng dụng? Thay vì chờ khách tự quét QR, bạn có thể gán quyền sở hữu ngay bằng User ID.
                    </p>
                    <button type="button" onClick={() => setAssignOpen(true)} className={`mt-2 ${BTN_BRAND_SOFT}`}>
                      <KeyRound className="h-3.5 w-3.5" /> Gán cho khách hàng (User ID)
                    </button>
                  </div>
                </>
              )}

              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Link href={`/smart-homes/${result.home.id}`} className={BTN_SECONDARY}>Xem chi tiết nhà</Link>
                <button type="button" onClick={resetWizard} className={BTN_SECONDARY}>Tạo nhà khác</button>
                <Link href="/smart-homes" className={BTN_PRIMARY}>Về danh sách Smart Homes</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {result && assignOpen && (
        <AssignOwnerDialog
          homeId={result.home.id}
          homeName={result.home.name}
          initialQuery={result.home.expected_owner_name ?? ""}
          onClose={() => setAssignOpen(false)}
          onAssigned={(customer) => {
            setOwner(customer);
            void revalidateDashboard("/smart-homes", "/stats");
            showToast(`Đã gán "${result.home.name}" cho ${customer.name}.`);
          }}
        />
      )}
    </div>
  );
}

// Hộp thoại gán chủ = hook (api/useAssignOwner) + view (ui/AssignOwnerModal).
function AssignOwnerDialog({ homeName, ...options }: AssignOwnerOptions & { homeName: string }) {
  const state = useAssignOwner(options);
  return <AssignOwnerModal homeName={homeName} state={state} onClose={options.onClose} />;
}
