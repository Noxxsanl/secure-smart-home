import { Sofa, BedDouble, CookingPot, Bath, Briefcase, Car, Trees, DoorClosed } from "lucide-react";
import type { Room, RoomType } from "@/shared/mock/types";

const ROOM_ICONS: Record<RoomType, React.ElementType> = {
  living_room: Sofa, bedroom: BedDouble, kitchen: CookingPot, bathroom: Bath,
  office: Briefcase, garage: Car, garden: Trees, door: DoorClosed,
};

type RoomCardProps = {
  room: Room;
  deviceCount: number;
  active: boolean;
  onClick: () => void;
};

export default function RoomCard({ room, deviceCount, active, onClick }: RoomCardProps) {
  const Icon = ROOM_ICONS[room.room_type] ?? Sofa;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3.5 text-left transition
        ${active ? "border-brand ring-1 ring-brand/30 bg-brand-soft/40" : "border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600"}`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
        <Icon className="h-4 w-4 text-gray-500 dark:text-slate-400" />
      </div>
      <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-slate-100">{room.name}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500">{deviceCount} thiết bị</p>
    </button>
  );
}
