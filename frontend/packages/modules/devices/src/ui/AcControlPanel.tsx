"use client";

import { useState } from "react";
import { BookOpen, Check, CircleAlert, Minus, Plus, Power, Radio } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_SM_BRAND } from "@shh/ui";
import type { CustomerDevice } from "@shh/api-client/portal";
import type { DevicePowerControl } from "../model/power";
import type { AcLearnControl } from "../model/acLearn";
import { AC_SETPOINT_MAX, AC_SETPOINT_MIN } from "../model/appliance";
import {
  AC_SLOTS,
  LEARN_WINDOW_SECONDS,
  isSlotLearned,
  learnInstruction,
  learnedCount,
  slotLabel,
} from "../model/acCodes";
import type { AcSlot } from "../model/acCodes";

type AcControlPanelProps = {
  device: CustomerDevice;
  power: DevicePowerControl;
  learn: AcLearnControl;
};

const ROUND_BUTTON = `inline-flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition
  hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent
  dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:disabled:text-slate-600 dark:disabled:hover:bg-transparent`;

// Điều khiển chi tiết điều hòa, giống màn TFT của Node: BẬT/TẮT, nhiệt độ lớn với −/+, lưới 16 ô mã IR
// (TẮT, 16..30°C) và chế độ "Học mã". Mọi lệnh đi qua `power` / `learn` (hook ở api/), panel chỉ hiển thị.
export default function AcControlPanel({ device, power, learn }: AcControlPanelProps) {
  const [learnMode, setLearnMode] = useState(false);

  const on = power.powerOf(device);
  const setpoint = power.setpointOf(device);
  const learning = learn.learningSlot !== null;
  const blocked = power.blockReason(device);
  // Đang học mã thì khoá toàn bộ điều khiển khác của điều hòa.
  const canToggle = power.canToggle(device) && !learning;
  const canAdjust = power.canAdjustSetpoint(device) && !learning;
  const sending = power.isPending(device) || power.isSetpointPending(device);
  const codes = device.ac_codes;
  const learned = learnedCount(codes);

  // Ô đang là trạng thái hiện tại: tắt → TẮT; bật → ô nhiệt độ đặt.
  const currentSlot: AcSlot | null = on === false ? "off" : on === true && setpoint !== null ? setpoint : null;

  function pressCell(slot: AcSlot) {
    if (learnMode) {
      void learn.learn(device, slot);
    } else if (slot === "off") {
      void power.setPower(device, false);
    } else {
      power.setSetpoint(device, slot);
    }
  }

  function cellEnabled(slot: AcSlot): boolean {
    if (learning || blocked !== null) return false;
    if (learnMode) return true;
    if (isSlotLearned(codes, slot) === false) return false;
    return slot === "off" ? canToggle : canAdjust;
  }

  const statusText = on === null ? "Chưa rõ" : on ? "Đang bật" : "Đang tắt";

  return (
    <div className="mt-3 space-y-4 rounded border border-gray-100 dark:border-slate-700 p-4">
      {/* 1. Trạng thái + BẬT / TẮT */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500">Trạng thái điều hòa</p>
          <p
            aria-live="polite"
            className={`text-base font-semibold ${on ? "text-success" : "text-gray-900 dark:text-slate-100"}`}
          >
            {statusText}
            {sending && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-slate-500">Đang gửi lệnh…</span>}
          </p>
        </div>
        <div role="group" aria-label="Bật hoặc tắt điều hòa" className="flex gap-2">
          <button
            type="button"
            aria-pressed={on === true}
            disabled={!canToggle || on === true}
            onClick={() => void power.setPower(device, true)}
            className={BTN_PRIMARY}
          >
            <Power className="h-4 w-4" /> BẬT
          </button>
          <button
            type="button"
            aria-pressed={on === false}
            disabled={!canToggle || on === false}
            onClick={() => void power.setPower(device, false)}
            className={BTN_SECONDARY}
          >
            <Power className="h-4 w-4" /> TẮT
          </button>
        </div>
      </div>

      {/* 2. Nhiệt độ đặt cỡ lớn */}
      <div
        role="group"
        aria-label={`Nhiệt độ đặt của ${device.device_name}`}
        className="flex items-center justify-center gap-5 py-1"
      >
        <button
          type="button"
          aria-label="Giảm 1°C"
          disabled={!canAdjust || (setpoint !== null && setpoint <= AC_SETPOINT_MIN)}
          onClick={() => power.adjustSetpoint(device, -1)}
          className={ROUND_BUTTON}
        >
          <Minus className="h-5 w-5" />
        </button>
        <p
          aria-live="polite"
          aria-label={setpoint === null ? "Chưa biết nhiệt độ đặt" : `Nhiệt độ đặt ${setpoint} độ C`}
          className={`min-w-[7.5rem] text-center text-5xl font-semibold tabular-nums ${
            power.isSetpointPending(device) ? "text-brand" : "text-gray-900 dark:text-slate-100"
          }`}
        >
          {setpoint === null ? "--" : setpoint}
          <span className="text-2xl font-medium text-gray-400 dark:text-slate-500">°C</span>
        </p>
        <button
          type="button"
          aria-label="Tăng 1°C"
          disabled={!canAdjust || (setpoint !== null && setpoint >= AC_SETPOINT_MAX)}
          onClick={() => power.adjustSetpoint(device, 1)}
          className={ROUND_BUTTON}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* 3. Lưới mã + chế độ học */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Mã remote đã học</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              {learned === null
                ? "Node chưa báo các mã đã học."
                : `${learned}/${AC_SLOTS.length} mã đã học · ô xanh bấm được để phát mã`}
            </p>
          </div>
          <button
            type="button"
            aria-pressed={learnMode}
            disabled={learning || blocked !== null}
            onClick={() => setLearnMode((v) => !v)}
            className={learnMode ? BTN_SM_BRAND : BTN_SM}
          >
            <BookOpen className="h-3.5 w-3.5" /> {learnMode ? "Xong học mã" : "Học mã"}
          </button>
        </div>

        <div role="group" aria-label="Các mã điều hòa" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {AC_SLOTS.map((slot) => (
            <CodeCell
              key={String(slot)}
              slot={slot}
              learned={isSlotLearned(codes, slot)}
              current={currentSlot === slot}
              learnMode={learnMode}
              learningThis={learn.learningSlot === slot}
              enabled={cellEnabled(slot)}
              onPress={() => pressCell(slot)}
            />
          ))}
        </div>

        <div aria-live="polite" className="mt-3 space-y-2 text-sm">
          {learn.learningSlot !== null ? (
            <LearningBanner slot={learn.learningSlot} secondsLeft={learn.secondsLeft} />
          ) : learn.notice ? (
            <p
              role={learn.notice.kind === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded border px-3 py-2 ${
                learn.notice.kind === "success"
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-critical/30 bg-critical-soft text-critical"
              }`}
            >
              {learn.notice.kind === "success" ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="flex-1">{learn.notice.text}</span>
              <button type="button" onClick={learn.dismissNotice} className="text-xs underline">
                Đóng
              </button>
            </p>
          ) : learnMode ? (
            <p className="rounded bg-brand-soft px-3 py-2 text-brand">
              Chế độ học mã: chạm một ô để học mã đó. Sau khi chạm, bạn có {LEARN_WINDOW_SECONDS} giây để bấm remote thật
              hướng vào Node. Chạm ô đã học để học lại (ghi đè).
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-slate-500">
        {blocked ?? "Đặt nhiệt độ hoặc chạm một ô mã khi điều hòa đang tắt sẽ bật điều hòa. "}
        Trạng thái hiển thị là lệnh Node đã phát. Điều khiển hồng ngoại chỉ có một chiều, nên nếu bạn dùng remote thật thì
        trạng thái trên đây có thể lệch với điều hòa.
      </p>
    </div>
  );
}

type CodeCellProps = {
  slot: AcSlot;
  /** null = Node chưa báo bitmask. */
  learned: boolean | null;
  current: boolean;
  learnMode: boolean;
  learningThis: boolean;
  enabled: boolean;
  onPress: () => void;
};

function CodeCell({ slot, learned, current, learnMode, learningThis, enabled, onPress }: CodeCellProps) {
  const label = slotLabel(slot);
  const base = "relative flex h-12 flex-col items-center justify-center rounded border text-sm font-semibold transition disabled:cursor-not-allowed";
  const tone = learningThis
    ? "animate-pulse border-brand bg-brand-soft text-brand"
    : learned === true
      ? "border-success/40 bg-success-soft text-success hover:brightness-95 disabled:hover:brightness-100"
      : learned === false
        ? "border-dashed border-gray-300 bg-transparent text-gray-400 dark:border-slate-600 dark:text-slate-500 opacity-70"
        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
  // Ô học được trong chế độ học dù chưa học: bỏ độ mờ để người dùng thấy bấm được.
  const learnable = learnMode && learned === false && enabled ? "!opacity-100 hover:border-brand hover:text-brand" : "";
  const ring = current ? "ring-2 ring-brand ring-offset-1 dark:ring-offset-slate-900" : "";

  const title =
    learned === false && !learnMode
      ? `${label}: Chưa học`
      : learnMode
        ? learned
          ? `${label}: đã học — bấm để học lại`
          : `${label}: bấm để học mã`
        : current
          ? `${label}: đang đặt`
          : label;

  return (
    <button
      type="button"
      title={title}
      aria-label={
        learnMode
          ? `Học mã ${label}${learned ? " (đã học, học lại)" : ""}`
          : `Phát mã ${label}${learned === false ? " — chưa học" : ""}${current ? " — đang đặt" : ""}`
      }
      aria-current={current ? "true" : undefined}
      disabled={!enabled}
      onClick={onPress}
      className={`${base} ${tone} ${learnable} ${ring}`}
    >
      {label}
      {learned === true && <Check className="absolute right-1 top-1 h-3 w-3" aria-hidden />}
      {learned === false && <span className="text-[10px] font-normal">Chưa học</span>}
    </button>
  );
}

function LearningBanner({ slot, secondsLeft }: { slot: AcSlot; secondsLeft: number }) {
  const percent = Math.round((secondsLeft / LEARN_WINDOW_SECONDS) * 100);
  return (
    <div className="rounded border border-brand/30 bg-brand-soft px-3 py-2 text-brand">
      <p className="flex items-center gap-2 font-semibold">
        <Radio className="h-4 w-4 shrink-0 animate-pulse" aria-hidden />
        <span>Đang học mã {slotLabel(slot)}</span>
        {/* Đếm ngược chỉ hiển thị, không đọc từng giây cho trình đọc màn hình. */}
        <span aria-hidden>{secondsLeft > 0 ? `— còn ${secondsLeft} giây` : "— hết giờ, đang chờ Node trả lời…"}</span>
      </p>
      <p className="mt-1">{learnInstruction(slot)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-brand/15" aria-hidden>
        <div className="h-full bg-brand transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
