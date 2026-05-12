// Chỉ báo bước (wizard) dùng cho Pack Generate 3 bước.
// Phục vụ Requirement 11.1, 11.2.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  id: string;
  label: string;
  description?: string;
  /** Bước đã đủ điều kiện để nhảy tới? */
  enabled?: boolean;
}

interface StepIndicatorProps {
  steps: Step[];
  current: string;
  completed?: string[];
  onStepClick?: (stepId: string) => void;
  className?: string;
}

export function StepIndicator({
  steps,
  current,
  completed = [],
  onStepClick,
  className,
}: StepIndicatorProps) {
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <ol
      className={cn(
        "flex items-center gap-2 overflow-x-auto",
        className,
      )}
    >
      {steps.map((step, idx) => {
        const isCurrent = step.id === current;
        const isCompleted = completed.includes(step.id) || idx < currentIdx;
        const isEnabled = step.enabled !== false || isCompleted;
        const isClickable = isEnabled && onStepClick;

        return (
          <li key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                isCurrent
                  ? "bg-primary text-primary-foreground font-semibold"
                  : isCompleted
                    ? "bg-secondary text-secondary-foreground hover:bg-accent"
                    : "text-muted-foreground",
                isClickable && !isCurrent && "cursor-pointer hover:bg-accent",
                !isEnabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold",
                  isCurrent
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : isCompleted
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="size-3" /> : idx + 1}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </button>
            {idx < steps.length - 1 && (
              <span className="h-px w-6 shrink-0 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
