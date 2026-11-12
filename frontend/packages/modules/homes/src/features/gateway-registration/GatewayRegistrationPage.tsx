"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Camera, Cpu, FileUp, Info, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { ConfirmModal, InlineError, BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL, SELECT } from "@shh/ui";
import { FetchError } from "@shh/api-client";
import { errorMessage, isErrorCode, revalidateDashboard, useHomeOptions } from "@shh/api-client/dashboard";
import type {
  Customer, DeviceInOtherHomeError, HardwareNodeKind, RegisterGatewayResult,
} from "@shh/api-client/dashboard";
import { useAuth } from "@shh/auth";
import { registerGateway } from "../../api/smartHomes.api";
import {
  DEFAULT_ROOM_NAME, MAX_NODES, NODE_KIND_LABELS, newNodeRow, parseNvsCsv, toRegisterInput, validateGatewayForm,
  type GatewayForm, type NodeRow,
} from "../../model/gatewayRegistration";
import CustomerPicker from "./CustomerPicker";
import RegistrationResult from "./RegistrationResult";

const MAX_NVS_FILE_BYTES = 64 * 1024;

function emptyForm(): GatewayForm {
  // Bộ demo: 1 gateway + 1 node phòng khách + 1 camera
  return { homeName: "", gatewayId: "", gatewaySecret: "", nodes: [newNodeRow("node"), newNodeRow("camera")] };
}

type TransferPrompt = { deviceId: string; homeName: string | null; count: number };

// Admin/Operator gắn gateway THẬT (cùng node cảm biến và camera của nó) vào một tài khoản khách hàng bất kỳ.
// device_id/secret phải trùng giá trị đã nạp vào NVS của chip. Secret chỉ nằm trong state của trang và body request,
// không hiển thị lại, không lưu, không log (invariant 1, 2) — xoá khỏi state ngay khi đăng ký xong.
export default function GatewayRegistrationPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { homes } = useHomeOptions();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<GatewayForm>(emptyForm);
  const [homeNameTouched, setHomeNameTouched] = useState(false);
  const [formError, setFormError] = useState("");
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transfer, setTransfer] = useState<TransferPrompt | null>(null);
  const [result, setResult] = useState<RegisterGatewayResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const customerHomes = useMemo(
    () => (customer ? homes.filter((h) => h.owner_customer_id === customer.id) : []),
    [homes, customer],
  );

  function selectCustomer(next: Customer | null) {
    setCustomer(next);
    setFormError("");
    if (next && !homeNameTouched) {
      const owned = homes.find((h) => h.owner_customer_id === next.id);
      setForm((f) => ({ ...f, homeName: owned?.name ?? `Nhà của ${next.name}` }));
    }
  }

  function updateNode(key: number, patch: Partial<NodeRow>) {
    setForm((f) => ({ ...f, nodes: f.nodes.map((n) => (n.key === key ? { ...n, ...patch } : n)) }));
  }

  function changeNodeKind(node: NodeRow, kind: HardwareNodeKind) {
    // Đổi loại thì đổi luôn phòng mặc định nếu người dùng chưa sửa tên phòng
    const roomName = node.roomName === DEFAULT_ROOM_NAME[node.kind] ? DEFAULT_ROOM_NAME[kind] : node.roomName;
    updateNode(node.key, { kind, roomName });
  }

  async function importNvs(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_NVS_FILE_BYTES) {
      setImportNote({ ok: false, text: "File quá lớn — chọn đúng file nvs_dev.csv của gateway." });
      return;
    }
    const parsed = parseNvsCsv(await file.text());
    if (typeof parsed === "string") {
      setImportNote({ ok: false, text: parsed });
      return;
    }
    setForm((f) => ({
      ...f,
      gatewayId: parsed.gatewayId,
      gatewaySecret: parsed.gatewaySecret,
      nodes: parsed.nodes.map((n) => newNodeRow(n.kind, n.deviceId, n.secret)),
    }));
    setFormError("");
    setImportNote({
      ok: true,
      text: `Đã điền gateway và ${parsed.nodes.length} node/camera từ file (bỏ qua WiFi và các mục khác). Kiểm tra lại rồi bấm Đăng ký.`,
    });
  }

  async function send(customerId: number, transferDevices: boolean) {
    const created = await registerGateway(toRegisterInput(customerId, form, transferDevices));
    setResult(created);
    // Secret không cần nữa — bỏ khỏi bộ nhớ của trang
    setForm((f) => ({ ...f, gatewaySecret: "", nodes: f.nodes.map((n) => ({ ...n, secret: "" })) }));
    void revalidateDashboard("/smart-homes", "/gateways", "/devices", "/customers", "/stats");
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!customer) { setFormError("Chọn tài khoản khách hàng sẽ sở hữu gateway."); return; }
    const invalid = validateGatewayForm(form);
    if (invalid) { setFormError(invalid); return; }

    setSubmitting(true);
    setFormError("");
    try {
      await send(customer.id, false);
    } catch (err) {
      if (isErrorCode(err, "DEVICE_IN_OTHER_HOME")) {
        const body = (err instanceof FetchError ? err.data : null) as Partial<DeviceInOtherHomeError> | null;
        const info: TransferPrompt = { deviceId: body?.device_id ?? "", homeName: body?.home_name ?? null, count: body?.count ?? 1 };
        if (isAdmin) {
          setTransfer(info);
        } else {
          setFormError(
            `Thiết bị ${info.deviceId} đang thuộc nhà ${info.homeName ? `"${info.homeName}"` : "khác"}. ` +
            "Chỉ Admin chuyển được thiết bị giữa các nhà — liên hệ Admin, hoặc nhập đúng tên nhà hiện tại của khách.",
          );
        }
      } else {
        setFormError(errorMessage(err, {
          ACCESS_GRANT_REQUIRED:
            "Khách đã có nhà cùng tên — cần quyền truy cập nhà đó để thêm thiết bị. Mở trang Smart Home của nhà, bấm “Yêu cầu quyền truy cập”, rồi đăng ký lại.",
          CUSTOMER_NOT_FOUND: "Không tìm thấy khách hàng (tài khoản có thể đã bị khoá). Chọn lại khách hàng.",
        }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setCustomer(null);
    setForm(emptyForm());
    setHomeNameTouched(false);
    setFormError("");
    setImportNote(null);
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Đăng ký Gateway</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Gắn gateway thật cùng node cảm biến và camera của nó vào tài khoản khách hàng. Dùng đúng Device ID và Secret đã nạp
          vào chip (NVS).
        </p>
      </div>

      {result ? (
        <RegistrationResult result={result} onReset={reset} />
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
          {/* 1. Khách hàng */}
          <section className={`${CARD} space-y-3 p-5`}>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">1. Tài khoản khách hàng</h2>
            <CustomerPicker selected={customer} onSelect={selectCustomer} disabled={submitting} />
          </section>

          {/* 2. Nhà */}
          <section className={`${CARD} space-y-3 p-5`}>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">2. Nhà</h2>
            <div>
              <label htmlFor="register-home-name" className={LABEL}>Tên nhà <span className="text-critical">*</span></label>
              <input
                id="register-home-name" type="text" value={form.homeName} maxLength={128} disabled={submitting}
                onChange={(e) => { setHomeNameTouched(true); setForm((f) => ({ ...f, homeName: e.target.value })); }}
                placeholder="VD: Nhà của tôi" className={INPUT}
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                Trùng tên một nhà khách đang sở hữu thì thiết bị được thêm/cập nhật vào nhà đó; tên mới thì tạo nhà mới
                (khách là chủ nhà).
              </p>
            </div>
            {customerHomes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500 dark:text-slate-400">Nhà hiện có của khách:</span>
                {customerHomes.map((h) => (
                  <button
                    key={h.id} type="button" disabled={submitting}
                    onClick={() => { setHomeNameTouched(true); setForm((f) => ({ ...f, homeName: h.name })); }}
                    className={`rounded border px-2 py-0.5 transition ${form.homeName.trim() === h.name
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-gray-200 text-gray-600 hover:border-brand dark:border-slate-600 dark:text-slate-300"}`}
                  >
                    {h.name}{h.gateway_uid ? ` · ${h.gateway_uid}` : ""}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 3. Thiết bị */}
          <section className={`${CARD} space-y-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">3. Gateway, node và camera</h2>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={submitting} className={BTN_SECONDARY}>
                <FileUp className="h-3.5 w-3.5" /> Điền từ file NVS (.csv)
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void importNvs(e)} />
            </div>
            <p className="-mt-2 text-xs text-gray-400 dark:text-slate-500">
              File nvs_dev.csv của gateway được đọc ngay trên trình duyệt, không tải lên máy chủ.
            </p>
            {importNote && (
              <p className={`text-xs ${importNote.ok ? "text-success" : "text-critical"}`}>{importNote.text}</p>
            )}

            <div className="rounded border border-gray-100 dark:border-slate-700 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                <Server className="h-3.5 w-3.5" /> Gateway
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="register-gw-id" className={LABEL}>Device ID <span className="text-critical">*</span></label>
                  <input
                    id="register-gw-id" type="text" value={form.gatewayId} maxLength={64} disabled={submitting}
                    autoComplete="off" spellCheck={false}
                    onChange={(e) => setForm((f) => ({ ...f, gatewayId: e.target.value }))}
                    placeholder="identity/device_uuid — VD: gw-s3-demo-01" className={`${INPUT} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor="register-gw-secret" className={LABEL}>Secret <span className="text-critical">*</span></label>
                  <input
                    id="register-gw-secret" type="password" value={form.gatewaySecret} maxLength={64} disabled={submitting}
                    autoComplete="new-password"
                    onChange={(e) => setForm((f) => ({ ...f, gatewaySecret: e.target.value }))}
                    placeholder="identity/device_secret" className={`${INPUT} font-mono`}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {form.nodes.map((node, index) => (
                <div key={node.key} className="rounded border border-gray-100 dark:border-slate-700 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                      {node.kind === "camera" ? <Camera className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                      {NODE_KIND_LABELS[node.kind]} #{index + 1}
                    </p>
                    <button
                      type="button" disabled={submitting} aria-label={`Bỏ ${NODE_KIND_LABELS[node.kind]} #${index + 1}`}
                      onClick={() => setForm((f) => ({ ...f, nodes: f.nodes.filter((n) => n.key !== node.key) }))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-critical disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Bỏ
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[9rem_1fr_1fr_10rem]">
                    <div>
                      <label htmlFor={`register-node-kind-${node.key}`} className={LABEL}>Loại</label>
                      <select
                        id={`register-node-kind-${node.key}`} value={node.kind} disabled={submitting}
                        onChange={(e) => changeNodeKind(node, e.target.value as HardwareNodeKind)} className={`${SELECT} w-full`}
                      >
                        <option value="node">{NODE_KIND_LABELS.node}</option>
                        <option value="camera">{NODE_KIND_LABELS.camera}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`register-node-id-${node.key}`} className={LABEL}>Device ID</label>
                      <input
                        id={`register-node-id-${node.key}`} type="text" value={node.deviceId} maxLength={64} disabled={submitting}
                        autoComplete="off" spellCheck={false}
                        onChange={(e) => updateNode(node.key, { deviceId: e.target.value })}
                        placeholder={node.kind === "camera" ? "VD: cam-door-01" : "VD: node-living-01"} className={`${INPUT} font-mono`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`register-node-secret-${node.key}`} className={LABEL}>Secret</label>
                      <input
                        id={`register-node-secret-${node.key}`} type="password" value={node.secret} maxLength={64} disabled={submitting}
                        autoComplete="new-password"
                        onChange={(e) => updateNode(node.key, { secret: e.target.value })}
                        className={`${INPUT} font-mono`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`register-node-room-${node.key}`} className={LABEL}>Phòng</label>
                      <input
                        id={`register-node-room-${node.key}`} type="text" value={node.roomName} maxLength={64} disabled={submitting}
                        onChange={(e) => updateNode(node.key, { roomName: e.target.value })} className={INPUT}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button" disabled={submitting || form.nodes.length >= MAX_NODES}
                onClick={() => setForm((f) => ({ ...f, nodes: [...f.nodes, newNodeRow("node")] }))}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:brightness-90 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm node / camera
              </button>
            </div>

            <div className="flex items-start gap-2.5 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 px-3 py-2.5 text-xs text-gray-600 dark:text-slate-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              <p>
                Mỗi node cảm biến tự có: cảm biến nhiệt/ẩm, Điều hòa (phát mã IR thật) và Đèn · Quạt · Rèm cửa (mô phỏng — chưa có
                phần cứng nhận lệnh) trong phòng của node. Camera nằm trong phòng riêng. Đăng ký lại cùng gateway sẽ cập nhật
                Secret và mở khoá thiết bị, giữ tên khách đã đặt.
              </p>
            </div>
          </section>

          <InlineError>{formError}</InlineError>

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
              {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Đang đăng ký…" : "Đăng ký"}
            </button>
          </div>
        </form>
      )}

      {transfer && customer && (
        <ConfirmModal
          title="Chuyển thiết bị sang nhà này?"
          icon={ArrowRightLeft}
          danger
          confirmLabel="Chuyển và đăng ký"
          description={
            <p>
              Thiết bị <span className="font-mono">{transfer.deviceId}</span>
              {transfer.count > 1 ? ` và ${transfer.count - 1} thiết bị khác` : ""} đang thuộc nhà{" "}
              <span className="font-semibold">{transfer.homeName ?? "khác"}</span>. Chuyển sang nhà{" "}
              <span className="font-semibold">{form.homeName.trim()}</span> của {customer.name} sẽ xoá các thiết bị này (gồm mọi
              thiết bị đang nối qua gateway đó) khỏi nhà cũ cùng số đo, ảnh camera và lịch sử điều khiển của chúng. Chủ nhà cũ
              nhận được thông báo. Không hoàn tác được.
            </p>
          }
          onConfirm={() => send(customer.id, true)}
          onClose={() => setTransfer(null)}
        />
      )}
    </div>
  );
}
