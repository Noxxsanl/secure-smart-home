"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { X, Server, Cpu, MapPin, Tag } from "lucide-react";
import api from "@/shared/api/client";
import { FetchError } from "@/shared/api/errors";
import { RegisterModal } from "@/features/devices/components/RegisterModal";
import type { RegisterDeviceResponse } from "@/shared/types/api";

interface AddDeviceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddDeviceModal({ open, onClose, onSuccess }: AddDeviceModalProps) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [type, setType] = useState<"sensor" | "gateway">("sensor");
  const [location, setLocation] = useState("");
  const [nameError, setNameError] = useState("");
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{
    device_id: string;
    secret_key: string;
  } | null>(null);

  if (!open) return null;

  function reset() {
    setName("");
    setType("sensor");
    setLocation("");
    setNameError("");
    setApiError("");
    setSubmitting(false);
    setCredentials(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    setApiError("");
    if (!name.trim()) {
      setNameError("Tên thiết bị không được để trống.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<RegisterDeviceResponse>("/api/devices/register", {
        device_name: name.trim(),
        device_type: type,
        location: location.trim() || undefined,
      });
      setCredentials({ device_id: data.device.device_id, secret_key: data.device.secret_key });
    } catch (err: unknown) {
      if (err instanceof FetchError && err.status === 403) {
        setApiError("Không có quyền truy cập.");
      } else {
        setApiError("Đã có lỗi xảy ra. Vui lòng thử lại.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCredentialClose() {
    mutate("/api/devices");
    reset();
    onClose();
    onSuccess?.();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        />

        <div className="relative z-10 w-full max-w-120 overflow-hidden rounded-xl bg-white dark:bg-slate-800 shadow-lg">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                <Server className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Đăng ký thiết bị</h2>
                <p className="text-xs text-gray-400 dark:text-slate-500">Thêm thiết bị mới vào hệ thống</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 transition hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-300"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-5 px-6 py-6">

              {/* Device name */}
              <div>
                <label htmlFor="add-name" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Tên thiết bị
                  <span className="ml-1 text-red-500">*</span>
                </label>
                <div className="relative">
                  <Tag className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                  <input
                    id="add-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError("");
                    }}
                    placeholder="VD: Gateway phòng server"
                    className={`h-11 w-full rounded-xl border pl-10 pr-4 text-sm text-gray-900 dark:text-slate-100 outline-none transition placeholder:text-gray-300 dark:placeholder:text-slate-500
                      ${nameError
                        ? "border-red-400 bg-red-50 dark:bg-red-900/20 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                        : "border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                      }`}
                  />
                </div>
                {nameError && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                    <span className="h-1 w-1 rounded-full bg-red-500" />
                    {nameError}
                  </p>
                )}
              </div>

              {/* Device type */}
              <div>
                <label htmlFor="add-type" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Loại thiết bị
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["sensor", "gateway"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition
                        ${type === t
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
                          : "border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-600"
                        }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                        ${type === t ? "bg-blue-100 dark:bg-blue-900/40" : "bg-gray-100 dark:bg-slate-600"}`}>
                        {t === "sensor"
                          ? <Cpu className={`h-4 w-4 ${type === t ? "text-blue-600" : "text-gray-500 dark:text-slate-400"}`} />
                          : <Server className={`h-4 w-4 ${type === t ? "text-blue-600" : "text-gray-500 dark:text-slate-400"}`} />
                        }
                      </div>
                      <div>
                        <p className={`text-sm font-semibold capitalize ${type === t ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-slate-300"}`}>
                          {t === "sensor" ? "Sensor" : "Gateway"}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">
                          {t === "sensor" ? "Cảm biến đo lường" : "Trạm trung gian"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div>
                <label htmlFor="add-location" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Vị trí
                  <span className="ml-2 text-xs font-normal text-gray-400 dark:text-slate-500">(tuỳ chọn)</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                  <input
                    id="add-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="VD: Tầng 2 – Khu A"
                    className="h-11 w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-100 outline-none transition placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                  />
                </div>
              </div>

              {/* API error */}
              {apiError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  {apiError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-700 px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                className="h-10 rounded-lg border border-gray-200 dark:border-slate-600 px-5 text-sm font-medium text-gray-600 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Đang đăng ký…
                  </>
                ) : (
                  "Đăng ký thiết bị"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {credentials && (
        <RegisterModal
          deviceId={credentials.device_id}
          secretKey={credentials.secret_key}
          onClose={handleCredentialClose}
        />
      )}
    </>
  );
}
