// Class Tailwind lặp lại nhiều lần trong console — gom một chỗ để mọi trang
// cùng nhịp viền/nền/dark mode. Tailwind v4 quét cả file .ts trong
// packages/ (khai báo @source trong globals.css của từng app).

export const CARD = "rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800";

export const CARD_HEADER =
  "flex items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5";

export const TOOLBAR =
  "flex flex-wrap items-center gap-2.5 border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5";

export const TABLE_HEAD_ROW = "border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900";

export const TH = "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400";

export const TR = "bg-white dark:bg-slate-800 transition-colors hover:bg-brand-soft/30";

export const LABEL = "mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400";

export const INPUT =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60";

export const TEXTAREA =
  "w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60";

export const SELECT =
  "h-9 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60";

export const SELECT_SM =
  "h-8 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs font-medium text-gray-700 dark:text-slate-300 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export const SEARCH_INPUT =
  "h-8 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_DANGER =
  "inline-flex items-center justify-center gap-1.5 rounded bg-critical px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_WARNING_SOFT =
  "inline-flex items-center gap-1.5 rounded border border-warning/30 bg-warning-soft px-3.5 py-1.5 text-sm font-medium text-warning transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_DANGER_SOFT =
  "inline-flex items-center gap-1.5 rounded border border-critical/20 bg-critical-soft px-3.5 py-1.5 text-sm font-medium text-critical transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_SUCCESS_SOFT =
  "inline-flex items-center gap-1.5 rounded border border-success/30 bg-success-soft px-3.5 py-1.5 text-sm font-medium text-success transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_BRAND_SOFT =
  "inline-flex items-center gap-1.5 rounded border border-brand/30 bg-brand-soft px-3.5 py-1.5 text-sm font-medium text-brand transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_SM =
  "inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-brand hover:bg-brand-soft hover:text-brand disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_SM_BRAND =
  "inline-flex items-center gap-1 rounded border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_SM_DANGER =
  "inline-flex items-center gap-1 rounded border border-critical/20 bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_SM_WARNING =
  "inline-flex items-center gap-1 rounded border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_SM_SUCCESS =
  "inline-flex items-center gap-1 rounded border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-medium text-success transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const SEGMENTED = "flex items-center gap-0.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5";

export function segmentButton(active: boolean): string {
  return `inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition ${
    active ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
  }`;
}

export const COUNT_PILL = "rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold";

export const MUTED_DASH = "text-gray-300 dark:text-slate-600";
