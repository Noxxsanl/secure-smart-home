import Link from "next/link";
import { Sofa, BedDouble, CookingPot, Bath, Briefcase, Car, Trees, DoorClosed, Thermometer, Droplets } from "lucide-react";
import type { RoomSummary } from "@smarthome/shared/mock/portal";
import type { RoomType } from "@smarthome/shared/mock/types";

const ROOM_ICONS: Record<RoomType, React.ElementType> = {
  living_room: Sofa, bedroom: BedDouble, kitchen: CookingPot, bathroom: Bath,
  office: Briefcase, garage: Car, garden: Trees, door: DoorClosed,
};

export default function RoomTile({ room }: { room: RoomSummary }) {
  const Icon = ROOM_ICONS[room.room_type] ?? Sofa;
  return (
    <Link
      href={`/rooms/${room.id}`}
      className="flex flex-col gap-3 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 transition hover:border-brand/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
          <Icon className="h-5 w-5 text-gray-500 dark:text-slate-400" />
        </div>
        {room.on_count > 0 && (
          <span className="rounded bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
            {room.on_count} đang bật
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{room.name}</p>
        <p className="text-xs text-gray-400 dark:text-slate-500">{room.device_count} thiết bị</p>
      </div>
      {room.has_climate_data ? (
        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1"><Thermometer className="h-3.5 w-3.5 text-critical" />{room.temperature}°C</span>
          <span className="inline-flex items-center gap-1"><Droplets className="h-3.5 w-3.5 text-info" />{room.humidity}%</span>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-slate-500">Chưa có cảm biến khí hậu</p>
      )}
    </Link>
  );
}
