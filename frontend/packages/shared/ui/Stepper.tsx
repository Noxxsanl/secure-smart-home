import { Check } from "lucide-react";

type StepperProps = {
  steps: string[];
  currentStep: number; // 0-indexed
};

export default function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center">
      {steps.map((label, idx) => {
        const done = idx < currentStep;
        const active = idx === currentStep;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition
                  ${done ? "bg-brand text-white" : active ? "bg-brand-soft text-brand ring-2 ring-brand" : "bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500"}`}
              >
                {done ? <Check size={13} /> : idx + 1}
              </div>
              <span className={`whitespace-nowrap text-[11px] font-medium ${active ? "text-brand" : done ? "text-gray-700 dark:text-slate-300" : "text-gray-400 dark:text-slate-500"}`}>
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`mx-2 h-0.5 flex-1 rounded ${done ? "bg-brand" : "bg-gray-100 dark:bg-slate-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
