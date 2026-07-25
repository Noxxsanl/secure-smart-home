"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCustomerDetail } from "@/features/customers/hooks/useCustomerDetail";
import StatusBadge from "@/shared/ui/StatusBadge";

const METHOD_LABELS: Record<string, string> = {
  qr: "QR Code", code: "Activation Code", operator_assign: "Operator gán (User ID)",
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading } = useCustomerDetail(Number(id));

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Đang tải…
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <p className="text-critical">Không tìm thấy khách hàng.</p>
        <Link href="/customers" className="inline-flex items-center gap-2 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">
          <ArrowLeft className="h-4 w-4" /> Trở về Customers
        </Link>
      </div>
    );
  }

  const { customer, homes, warranties, activations } = detail;

  return (
    <div className="w-full space-y-3">
      <div>
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Customers
        </Link>
        <div className="mt-1.5 flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{customer.name}</h1>
          <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-brand">{customer.user_tag}</span>
        </div>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          {customer.phone} · {customer.email} · Tham gia: {new Date(customer.joined_at).toLocaleDateString("vi-VN")}
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Smart Home đã mua ({homes.length})</p>
          </div>
          {homes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Chưa sở hữu nhà nào.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {homes.map((h) => (
                <li key={h.id} className="px-4 py-2.5">
                  <Link href={`/smart-homes/${h.id}`} className="text-sm font-medium text-brand hover:brightness-90">{h.name}</Link>
                  <div className="mt-0.5"><StatusBadge status={h.status} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Bảo hành</p>
          </div>
          {warranties.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Không có bảo hành nào.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {warranties.map((w) => (
                <li key={w.id} className="px-4 py-2.5 text-sm">
                  <span className="font-mono text-gray-700 dark:text-slate-300">{w.package}</span>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">hết hạn {new Date(w.expires_at).toLocaleDateString("vi-VN")}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Lịch sử kích hoạt</p>
          </div>
          {activations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Chưa có lượt kích hoạt nào.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {activations.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-gray-400 dark:text-slate-500">{new Date(a.activated_at).toLocaleDateString("vi-VN")}</span>
                    <StatusBadge status={a.result === "success" ? "active" : "blocked"} label={a.result === "success" ? "SUCCESS" : "FAILED"} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">Phương thức: {METHOD_LABELS[a.method] ?? a.method}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
