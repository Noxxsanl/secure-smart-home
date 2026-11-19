"use client";

import { useState } from "react";
import { Skeleton, ErrorPanel, CARD, CARD_HEADER } from "@shh/ui";
import { useDeviceSnapshots } from "../../api/useDeviceSnapshots";
import CameraSnapshotViewer from "../../ui/CameraSnapshotViewer";

export type HomeCameraSnapshotsProps = { deviceId: number; deviceName: string };

// Khối "Ảnh camera" trên trang chi tiết thiết bị của khách (category = camera).
// GET /devices/:id/snapshots, làm mới mỗi 15 s; xem trực tiếp là khối `HomeCameraLive` (feature camera-live) đặt phía trên.
export default function HomeCameraSnapshots({ deviceId, deviceName }: HomeCameraSnapshotsProps) {
  const { data, error, mutate } = useDeviceSnapshots(deviceId);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <section className={CARD} aria-label="Ảnh camera">
      <div className={CARD_HEADER}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Ảnh camera</h2>
      </div>
      {data ? (
        <CameraSnapshotViewer deviceName={deviceName} items={data.items} selectedId={selectedId} onSelect={setSelectedId} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={() => mutate()} />
      ) : (
        <div className="p-4">
          <Skeleton className="aspect-[4/3] w-full" />
        </div>
      )}
    </section>
  );
}
