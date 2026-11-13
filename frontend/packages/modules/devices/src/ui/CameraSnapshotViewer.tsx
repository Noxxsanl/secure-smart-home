"use client";

import { useState } from "react";
import { Camera, ImageOff } from "lucide-react";
import { snapshotImageUrl } from "@shh/api-client/portal";
import type { CameraSnapshot } from "@shh/api-client/portal";
import { formatDateTimeSeconds } from "@shh/utils";

const TRIGGER_LABELS: Record<CameraSnapshot["trigger"], string> = {
  motion: "Chuyển động",
  request: "Theo yêu cầu",
};

const triggerBadge = (trigger: CameraSnapshot["trigger"]) =>
  trigger === "motion"
    ? "bg-warning-soft text-warning"
    : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300";

type CameraSnapshotViewerProps = {
  deviceName: string;
  /** Mới nhất trước. */
  items: CameraSnapshot[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

// Ảnh lớn 4:3 + thời gian chụp + nhãn, dưới là dải thumbnail. Thuần hiển thị.
export default function CameraSnapshotViewer({ deviceName, items, selectedId, onSelect }: CameraSnapshotViewerProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 py-10 text-center">
        <Camera className="h-8 w-8 text-gray-300 dark:text-slate-600" />
        <p className="mt-3 max-w-sm text-sm text-gray-500 dark:text-slate-400">
          Chưa có ảnh nào. Camera sẽ gửi ảnh khi phát hiện chuyển động.
        </p>
      </div>
    );
  }

  return <SnapshotGallery deviceName={deviceName} items={items} selectedId={selectedId} onSelect={onSelect} />;
}

function SnapshotGallery({ deviceName, items, selectedId, onSelect }: CameraSnapshotViewerProps) {
  // Ảnh tải lỗi (file đã bị dọn theo hạn lưu, phiên hết hạn, mất mạng) → câu hướng dẫn thay cho biểu tượng ảnh vỡ.
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const markFailed = (id: number) => setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  const current = items.find((s) => s.id === selectedId) ?? items[0];

  return (
    // Cùng khổ với khối "Xem trực tiếp" (≤ 640 px, căn giữa) — ảnh SVGA 800x600 thu nhẹ, không chiếm hết bề ngang
    <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
      <div className="aspect-[4/3] w-full overflow-hidden rounded bg-gray-100 dark:bg-slate-900">
        {failed.has(current.id) ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <ImageOff className="h-8 w-8 text-gray-300 dark:text-slate-600" />
            <p className="mt-3 max-w-sm text-sm text-gray-500 dark:text-slate-400">
              Không hiển thị được ảnh này. Ảnh có thể đã quá hạn lưu (7 ngày) — hãy tải lại trang hoặc đăng nhập lại.
            </p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh cần cookie phiên, không qua trình tối ưu ảnh của Next
          <img
            key={current.id}
            src={snapshotImageUrl(current.id)}
            alt={`Ảnh chụp của ${deviceName} lúc ${formatDateTimeSeconds(current.captured_at)}`}
            loading="lazy"
            onError={() => markFailed(current.id)}
            className="h-full w-full object-contain"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
          {formatDateTimeSeconds(current.captured_at)}
        </span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${triggerBadge(current.trigger)}`}>
          {TRIGGER_LABELS[current.trigger]}
        </span>
      </div>

      <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Ảnh gần đây">
        {items.map((s) => {
          const active = s.id === current.id;
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={active}
                aria-label={`Xem ảnh lúc ${formatDateTimeSeconds(s.captured_at)} (${TRIGGER_LABELS[s.trigger]})`}
                className={`flex h-14 w-[74px] overflow-hidden rounded border-2 bg-gray-100 dark:bg-slate-900 transition ${
                  active ? "border-brand" : "border-transparent hover:border-gray-300 dark:hover:border-slate-500"
                }`}
              >
                {failed.has(s.id) ? (
                  <ImageOff className="m-auto h-5 w-5 text-gray-300 dark:text-slate-600" aria-hidden="true" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh cần cookie phiên, không qua trình tối ưu ảnh của Next
                  <img
                    src={snapshotImageUrl(s.id)}
                    alt={`Ảnh nhỏ lúc ${formatDateTimeSeconds(s.captured_at)}`}
                    loading="lazy"
                    onError={() => markFailed(s.id)}
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
