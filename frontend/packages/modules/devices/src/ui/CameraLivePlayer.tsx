"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Maximize2, Minimize2, Play, Square } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY } from "@shh/ui";

export type CameraLivePlayerProps = {
  deviceName: string;
  /** Canvas do hook `useCameraLive` (feature) vẽ khung lên. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  watching: boolean;
  live: boolean;
  message: string | null;
  fps: number;
  onStart: () => void;
  onStop: () => void;
};

// Khung hình 4:3 + nút điều khiển. Toàn màn hình áp lên khung (giữ overlay trạng thái).
export default function CameraLivePlayer({ deviceName, canvasRef, watching, live, message, fps, onStart, onStop }: CameraLivePlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Dừng xem → xoá khung cuối để không nhầm là còn hình trực tiếp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!watching && canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, [watching, canvasRef]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  return (
    // Rộng tối đa 640 px (+ đệm) = đúng VGA của camera: hiển thị 1:1, không phóng nhoè; toàn màn hình vẫn phủ kín
    <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
      <div
        ref={frameRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded bg-black [&:fullscreen]:aspect-auto [&:fullscreen]:h-screen"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-contain"
          role="img"
          aria-label={`Hình trực tiếp ${deviceName}`}
        />
        {live ? (
          <>
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-critical" aria-hidden /> TRỰC TIẾP
            </span>
            <span className="absolute right-3 top-3 rounded bg-black/60 px-2 py-1 text-xs font-medium tabular-nums text-white">
              {fps} fps
            </span>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <p role="status" className="max-w-sm text-sm text-slate-200">
              {message ?? "Bấm “Xem trực tiếp” để bắt đầu. Hình chỉ được phát khi bạn mở."}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {watching ? (
          <button type="button" className={BTN_SECONDARY} onClick={onStop}>
            <Square className="h-4 w-4" /> Dừng xem
          </button>
        ) : (
          <button type="button" className={BTN_PRIMARY} onClick={onStart}>
            <Play className="h-4 w-4" /> Xem trực tiếp
          </button>
        )}
        <button type="button" className={BTN_SECONDARY} onClick={toggleFullscreen} disabled={!watching}>
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
        </button>
      </div>
    </div>
  );
}
