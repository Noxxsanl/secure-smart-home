"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_RECORD_SECONDS, MIC_ERRORS, MIN_RECORD_MS, micErrorMessage, pickRecorderMime, recorderUnsupportedReason,
  type RecordedAudio, type RecorderPhase,
} from "../model/assistant";

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  timer: ReturnType<typeof setInterval>;
  mimeType: string;
  discard: boolean;
  onComplete: (audio: RecordedAudio) => void;
};

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Ghi âm bằng micro của trình duyệt (MediaRecorder). Chỉ xin quyền micro khi `start()` được gọi (người dùng bấm),
 * tự dừng ở 30 giây, tắt hẳn track micro sau khi dừng. Dừng (tay hoặc tự động) → `onComplete(audio)`;
 * `cancel()` bỏ bản ghi. Lỗi hiển thị bằng câu tiếng Việt ở `error`.
 */
export function useVoiceRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const s = session.current;
      if (s) {
        s.discard = true;
        clearInterval(s.timer);
        if (s.recorder.state !== "inactive") s.recorder.stop();
        stopTracks(s.stream);
        session.current = null;
      }
    };
  }, []);

  function stop() {
    const s = session.current;
    if (s && s.recorder.state !== "inactive") s.recorder.stop();
  }

  function cancel() {
    const s = session.current;
    if (!s) return;
    s.discard = true;
    stop();
  }

  async function start(onComplete: (audio: RecordedAudio) => void) {
    if (session.current || phase !== "idle") return;
    setError(null);

    const unsupported = recorderUnsupportedReason();
    if (unsupported) {
      setError(unsupported);
      return;
    }
    const mimeType = pickRecorderMime();
    if (!mimeType) {
      setError(MIC_ERRORS.unsupported);
      return;
    }

    setPhase("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (alive.current) {
        setError(micErrorMessage(err));
        setPhase("idle");
      }
      return;
    }
    // Panel đã đóng trong lúc chờ người dùng cấp quyền.
    if (!alive.current) {
      stopTracks(stream);
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      stopTracks(stream);
      setError(MIC_ERRORS.unsupported);
      setPhase("idle");
      return;
    }

    const startedAt = Date.now();
    const next: Session = {
      recorder, stream, chunks: [], startedAt, mimeType, discard: false, onComplete,
      timer: setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(Math.min(elapsed, MAX_RECORD_SECONDS));
        if (elapsed >= MAX_RECORD_SECONDS) stop(); // tự dừng ở 30 giây
      }, 250),
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) next.chunks.push(event.data);
    };
    recorder.onerror = () => {
      next.discard = true;
      if (alive.current) setError(MIC_ERRORS.failed);
      if (recorder.state !== "inactive") recorder.stop();
    };
    recorder.onstop = () => {
      clearInterval(next.timer);
      stopTracks(next.stream); // tắt đèn micro ngay khi dừng
      if (session.current === next) session.current = null;
      if (!alive.current) return;
      setPhase("idle");
      setSeconds(0);
      if (next.discard) return;
      const durationMs = Date.now() - next.startedAt;
      const blob = new Blob(next.chunks, { type: next.mimeType });
      if (blob.size === 0 || durationMs < MIN_RECORD_MS) {
        setError(MIC_ERRORS.tooShort);
        return;
      }
      next.onComplete({ blob, mimeType: next.mimeType, durationMs });
    };

    session.current = next;
    setSeconds(0);
    setPhase("recording");
    try {
      recorder.start();
    } catch {
      clearInterval(next.timer);
      stopTracks(stream);
      session.current = null;
      setError(MIC_ERRORS.failed);
      setPhase("idle");
    }
  }

  return { phase, seconds, error, clearError: () => setError(null), start, stop, cancel };
}
