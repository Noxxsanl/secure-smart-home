"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";

type ToastState = { msg: string; ok: boolean } | null;

type ToastContextValue = {
  showToast: (msg: string, ok?: boolean) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Generalizes the `useState<Toast>` + `setTimeout` pattern repeated in
// DevicesPage/AuditPage into one provider so new pages don't reimplement it.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-lg transition
            ${toast.ok ? "bg-success text-white" : "bg-critical text-white"}`}
        >
          {toast.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
