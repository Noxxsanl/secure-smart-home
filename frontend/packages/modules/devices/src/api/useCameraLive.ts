"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import {
  LIVE_RETRY_DELAYS_MS,
  LIVE_STATE_MESSAGES,
  LIVE_UNREACHABLE_MESSAGE,
  cameraLiveUrl,
  classifyClose,
  drawBitmap,
  parseLiveState,
  type LiveState,
} from "../model/cameraLive";

export type CameraLiveView = {
  /** Người dùng đã bấm "Xem trực tiếp" (và chưa dừng / chưa bị dừng do lỗi). */
  watching: boolean;
  /** Đang nhận hình. */
  live: boolean;
  /** Câu hướng dẫn tiếng Việt: trạng thái kết nối hoặc lý do dừng; null khi đang live / chưa xem. */
  message: string | null;
  /** Số khung vẽ được trong 1 s gần nhất. */
  fps: number;
  start: () => void;
  stop: () => void;
};

type Conn = { state: LiveState; fps: number };
const INITIAL: Conn = { state: "connecting", fps: 0 };

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const tabVisible = () => document.visibilityState === "visible";

/**
 * Cổng khách: xem trực tiếp camera qua WebSocket /api/portal/cameras/:deviceId/live, vẽ lên `canvasRef`.
 * Chỉ phát khi người dùng bấm `start`; tab ẩn → đóng WS, hiện lại → nối lại; rớt bất thường → thử lại 1/2/4 s.
 * Khi đang giải mã chỉ giữ 1 khung chờ (mới nhất), khung cũ bị bỏ.
 */
export function useCameraLive(deviceId: number, canvasRef: RefObject<HTMLCanvasElement | null>): CameraLiveView {
  const [watching, setWatching] = useState(false);
  const [conn, setConn] = useState<Conn>(INITIAL);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const visible = useSyncExternalStore(subscribeVisibility, tabVisible, () => true);
  const [prevDevice, setPrevDevice] = useState(deviceId);

  // Đổi camera → quay về trạng thái chưa xem (effect bên dưới tự đóng WS cũ).
  if (prevDevice !== deviceId) {
    setPrevDevice(deviceId);
    setWatching(false);
    setStopReason(null);
    setConn(INITIAL);
  }

  const active = watching && visible;
  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let frames = 0;
    let gotFrame = false;
    let pending: Blob | null = null;
    let decoding = false;

    const fpsTimer = setInterval(() => {
      const n = frames;
      frames = 0;
      setConn((c) => (c.fps === n ? c : { ...c, fps: n }));
    }, 1000);

    async function pump() {
      if (decoding) return;
      decoding = true;
      while (pending && !disposed) {
        const blob: Blob = pending;
        pending = null;
        try {
          const bitmap = await createImageBitmap(blob);
          const canvas = canvasRef.current;
          if (!disposed && canvas) {
            drawBitmap(canvas, bitmap);
            frames += 1;
            if (!gotFrame) {
              gotFrame = true;
              attempt = 0;
              setConn((c) => ({ ...c, state: "live" }));
            }
          }
          bitmap.close();
        } catch {
          // Khung JPEG hỏng → bỏ, chờ khung kế.
        }
      }
      decoding = false;
    }

    function fail(message: string) {
      disposed = true;
      setStopReason(message);
      setWatching(false);
    }

    function open() {
      let socket: WebSocket;
      try {
        socket = new WebSocket(cameraLiveUrl(deviceId));
      } catch {
        fail(LIVE_UNREACHABLE_MESSAGE);
        return;
      }
      ws = socket;
      socket.binaryType = "blob";
      socket.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data === "string") {
          const state = parseLiveState(ev.data);
          if (state) {
            if (state === "live") attempt = 0;
            setConn((c) => ({ ...c, state }));
          }
        } else if (ev.data instanceof Blob) {
          pending = ev.data; // khung mới nhất thay khung chờ cũ
          void pump();
        }
      };
      socket.onclose = (ev: CloseEvent) => {
        if (disposed) return;
        pending = null;
        const verdict = classifyClose(ev.code);
        if (!verdict.retry) return fail(verdict.message);
        if (attempt >= LIVE_RETRY_DELAYS_MS.length) return fail(LIVE_UNREACHABLE_MESSAGE);
        const delay = LIVE_RETRY_DELAYS_MS[attempt++];
        gotFrame = false;
        setConn((c) => ({ ...c, state: "reconnecting" }));
        retryTimer = setTimeout(open, delay);
      };
    }

    open();
    return () => {
      disposed = true;
      pending = null;
      clearInterval(fpsTimer);
      clearTimeout(retryTimer);
      if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.close(1000);
      }
    };
  }, [active, deviceId, canvasRef]);

  function start() {
    setStopReason(null);
    setConn(INITIAL);
    setWatching(true);
  }
  function stop() {
    setStopReason(null);
    setWatching(false);
  }

  const live = active && conn.state === "live";
  let message: string | null = null;
  if (watching) {
    if (!visible) message = "Đã tạm dừng khi tab bị ẩn";
    else if (conn.state !== "live") message = LIVE_STATE_MESSAGES[conn.state];
  } else {
    message = stopReason;
  }

  return { watching, live, message, fps: live ? conn.fps : 0, start, stop };
}
