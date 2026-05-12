// Accordion section dùng trong Inspector panel. Ghi nhớ open/closed per-section.
// Phục vụ Requirement 6.1, 6.2.

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface InspectorSectionProps {
  /** Key lưu trạng thái mở/đóng */
  storageKey: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** Mặc định mở lần đầu (khi chưa có trong localStorage) */
  defaultOpen?: boolean;
  /** Badge nhỏ bên phải tiêu đề */
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function InspectorSection({
  storageKey,
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
  className,
}: InspectorSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ux:inspector:${storageKey}`);
      if (raw === "1") setOpen(true);
      else if (raw === "0") setOpen(false);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, [storageKey]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(`ux:inspector:${storageKey}`, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [mounted, storageKey, open]);

  return (
    <div className={cn("inspector-section", className)}>
      <button
        type="button"
        className="inspector-section-header focus-ring"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
          <span className="truncate">{title}</span>
          {badge ? <span className="shrink-0">{badge}</span> : null}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="inspector-section-body">{children}</div>}
    </div>
  );
}
