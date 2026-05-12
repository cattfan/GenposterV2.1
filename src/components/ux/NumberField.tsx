// Ô nhập số chuẩn UX:
// - Giữ Shift + Arrow → bước 10
// - Giữ Alt + Arrow → bước 0.1 (nếu float được cho phép)
// - Hỗ trợ công thức đơn giản: 100+20, 50*2, 200/2
// - Suffix hiển thị đơn vị (px, %, deg)
// Phục vụ Requirement 6.6.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface NumberFieldProps {
  value: number | undefined;
  onChange: (value: number) => void;
  /** Tooltip label */
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Đơn vị hiển thị suffix */
  suffix?: string;
  /** Cho phép giá trị thập phân */
  allowFloat?: boolean;
  /** Placeholder khi nhiều giá trị (mixed) */
  mixed?: boolean;
  className?: string;
  disabled?: boolean;
  /** Icon/prefix bên trái (ví dụ W, H, X, Y) */
  prefix?: React.ReactNode;
}

function evaluateFormula(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Chỉ cho phép các ký tự số, dấu chấm, dấu âm, và toán tử cơ bản
  if (!/^[\d+\-*/.()\s]+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  try {
    const result = Function(`"use strict"; return (${trimmed});`)();
    if (typeof result === "number" && Number.isFinite(result)) return result;
  } catch {
    /* ignore */
  }
  return null;
}

export function NumberField({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  suffix,
  allowFloat = false,
  mixed = false,
  className,
  disabled,
  prefix,
}: NumberFieldProps) {
  const [text, setText] = useState<string>(() => (value == null ? "" : String(value)));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value == null ? "" : String(allowFloat ? value : Math.round(value)));
  }, [value, allowFloat]);

  const clamp = (n: number) => {
    let next = n;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    return allowFloat ? next : Math.round(next);
  };

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      setText(value == null ? "" : String(value));
      return;
    }
    const parsed = evaluateFormula(raw);
    if (parsed == null) {
      setText(value == null ? "" : String(value));
      return;
    }
    const clamped = clamp(parsed);
    onChange(clamped);
    setText(String(clamped));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const direction = e.key === "ArrowUp" ? 1 : -1;
      let currentStep = step;
      if (e.shiftKey) currentStep = step * 10;
      else if (e.altKey && allowFloat) currentStep = step * 0.1;
      const base = value ?? 0;
      const next = clamp(base + direction * currentStep);
      onChange(next);
      setText(String(next));
      // reselect for continuous dragging
      requestAnimationFrame(() => ref.current?.select());
    } else if (e.key === "Enter") {
      commit(text);
      ref.current?.blur();
    } else if (e.key === "Escape") {
      setText(value == null ? "" : String(value));
      ref.current?.blur();
    }
  };

  return (
    <label
      className={cn(
        "group flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
      title={label}
    >
      {prefix && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground select-none">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={mixed ? "—" : undefined}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        className="ux-number-input h-full min-w-0 flex-1 bg-transparent text-right outline-none placeholder:text-muted-foreground/60"
      />
      {suffix && (
        <span className="shrink-0 text-xs text-muted-foreground select-none">{suffix}</span>
      )}
    </label>
  );
}
