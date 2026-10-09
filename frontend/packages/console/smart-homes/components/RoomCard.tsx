import { Sofa, BedDouble, CookingPot, Bath, Briefcase, Car, Trees, DoorClosed, Thermometer, Droplets, Lock } from "lucide-react";
import type { ConsoleRoom } from "@smarthome/console/api/types";

const ROOM_ICONS: Record<string, React.ElementType> = {
  living_room: Sofa, bedroom: BedDouble, kitchen: CookingPot, bathroom: Bath,
  office: Briefcase, garage: Car, garden: Trees, door: DoorClosed,
};

type RoomCardProps = {
  room: ConsoleRoom;
  active: boolean;
  /** Operator chưa có quyền truy cập: số liệu khí hậu bị ẩn. */
  climateHidden?: boolean;
  onClick: () => void;
};

export default function RoomCard({ room, active, climateHidden = false, onClick }: RoomCardProps) {
  const Icon = ROOM_ICONS[room.room_type] ?? Sofa;
  const hasClimate = room.temperature !== null || room.humidity !== null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3.5 text-left transition
        ${active ? "border-brand ring-1 ring-brand/30 bg-brand-soft/40" : "border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
          <Icon className="h-4 w-4 text-gray-500 dark:text-slate-400" />
        </div>
        {climateHidden ? (
          <span title="Cần quyền truy cập để xem số liệu khí hậu" className="text-gray-300 dark:text-slate-600">
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : hasClimate ? (
          <div className="text-right text-xs leading-5">
            {room.temperature !== null && (
              <p className="flex items-center justify-end gap-1 font-semibold text-warning">
                <Thermometer className="h-3 w-3" />{room.temperature.toFixed(1)}°C
              </p>
            )}
            {room.humidity !== null && (
              <p className="flex items-center justify-end gap-1 font-semibold text-info">
                <Droplets className="h-3 w-3" />{Math.round(room.humidity)}%
              </p>
            )}
          </div>
        ) : null}
      </div>
      <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-slate-100">{room.name}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500">
        {room.device_count} thiết bị
        {room.online_count !== undefined && ` · ${room.online_count} online`}
      </p>
    </button>
  );
}
