type ClarifyChipsProps = {
  options: string[];
  disabled?: boolean;
  onPick: (option: string) => void;
};

// Chip "hỏi lại" của Trợ lý (VD "8:00 sáng" / "20:00 tối") và câu mẫu — bấm là gửi chữ đó.
export default function ClarifyChips({ options, disabled = false, onPick }: ClarifyChipsProps) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-8">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option)}
          className="rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-semibold text-brand transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
