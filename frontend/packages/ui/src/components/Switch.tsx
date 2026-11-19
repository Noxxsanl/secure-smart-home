"use client";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string; // aria-label — switch không có chữ hiển thị
};

export default function Switch({ checked, onChange, disabled = false, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40
        ${checked ? "bg-brand" : "bg-gray-200 dark:bg-slate-600"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
          ${checked ? "translate-x-5.5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
