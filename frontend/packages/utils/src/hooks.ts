"use client";

import { useEffect, useState } from "react";
import { nowMs } from "./format";

/** Trì hoãn giá trị (ô tìm kiếm) để không gọi API ở mỗi phím gõ. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Đồng hồ cập nhật định kỳ — dùng cho "còn X phút" của quyền truy cập/mã kích hoạt. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMs()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Cảnh báo của trình duyệt khi đóng/tải lại tab (VD đang hiện mã kích hoạt
 * in-một-lần). Điều hướng nội bộ của Next không kích hoạt beforeunload.
 */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome/Edge cũ chỉ hiện hộp thoại khi returnValue được gán.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
