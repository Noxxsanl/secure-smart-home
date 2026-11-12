"use client";

import { useEffect, useState } from "react";
import { useToast } from "@shh/ui";
import { useRevalidate, deviceKey, homesKey, overviewKey, roomsPrefix } from "@shh/api-client/portal";
import type { CustomerDevice } from "@shh/api-client/portal";
import { LEARN_TIMEOUT_MS, sendLearnCode } from "./portalDevices.api";
import { LEARN_WINDOW_SECONDS, learnErrorMessage, slotLabel } from "../model/acCodes";
import type { AcSlot } from "../model/acCodes";
import type { AcLearnControl, AcLearnNotice } from "../model/acLearn";

// Học mã IR cho điều hòa: Node chờ người dùng bấm remote ≤ 10 s, server chờ ≤ 15 s nên request treo lâu —
// dùng timeout riêng (LEARN_TIMEOUT_MS), đếm ngược cho người dùng và chỉ cho học từng ô một.
export function useAcLearn(): AcLearnControl {
  const { showToast } = useToast();
  const revalidate = useRevalidate();
  const [learningSlot, setLearningSlot] = useState<AcSlot | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(LEARN_WINDOW_SECONDS);
  const [notice, setNotice] = useState<AcLearnNotice | null>(null);

  useEffect(() => {
    if (learningSlot === null) return;
    const endsAt = Date.now() + LEARN_WINDOW_SECONDS * 1000;
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [learningSlot]);

  async function learn(device: CustomerDevice, slot: AcSlot) {
    if (learningSlot !== null) return;
    setNotice(null);
    setSecondsLeft(LEARN_WINDOW_SECONDS);
    setLearningSlot(slot);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LEARN_TIMEOUT_MS);
    try {
      await sendLearnCode(device.id, slot, controller.signal);
      const text = `Đã học mã ${slotLabel(slot)}. Bạn có thể bấm ô này để phát mã.`;
      setNotice({ kind: "success", text });
      showToast(text, true);
    } catch (err) {
      const text = learnErrorMessage(err);
      setNotice({ kind: "error", text });
      showToast(text, false);
    } finally {
      clearTimeout(timer);
      // Lấy ac_codes mới (ô chuyển sang "đã học") trước khi mở khoá điều khiển.
      await revalidate(overviewKey(device.home_id), deviceKey(device.id), roomsPrefix, (key) => key === homesKey);
      setLearningSlot(null);
    }
  }

  return { learningSlot, secondsLeft, notice, learn, dismissNotice: () => setNotice(null) };
}
