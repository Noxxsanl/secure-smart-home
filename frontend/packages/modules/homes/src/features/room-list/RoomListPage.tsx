"use client";

import { DoorClosed } from "lucide-react";
import { EmptyState, Skeleton, ErrorPanel } from "@shh/ui";
import { HomeGate, useCurrentOverview } from "@shh/auth";
import RoomTile from "../../ui/RoomTile";

function Rooms() {
  const { data, error, mutate } = useCurrentOverview();

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Phòng</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          {data ? `${data.rooms.length} phòng trong ${data.home.name}.` : "Đang tải…"}
        </p>
      </div>

      {!data ? (
        error ? (
          <ErrorPanel error={error} onRetry={() => mutate()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}
          </div>
        )
      ) : data.rooms.length === 0 ? (
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <EmptyState
            icon={DoorClosed}
            title="Chưa có phòng nào"
            description="Phòng được tạo cùng gói kit. Nếu vẫn trống, hãy hoàn tất cài đặt WiFi cho Gateway trên ứng dụng di động."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.rooms.map((room) => <RoomTile key={room.id} room={room} />)}
        </div>
      )}
    </div>
  );
}

export default function RoomListPage() {
  return <HomeGate>{() => <Rooms />}</HomeGate>;
}
