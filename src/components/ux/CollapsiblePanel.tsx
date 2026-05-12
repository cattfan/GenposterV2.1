// Panel trái/phải có thể thu gọn/mở rộng, ghi nhớ trạng thái theo key.
// Phục vụ Requirement 3.2, 3.3, 3.5.

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type PanelSide = "left" | "right";

interface CollapsiblePanelProps {
  /** Unique key để lưu trạng thái collapsed + width trong localStorage */
  storageKey: string;
  side: PanelSide;
  /** Tiêu đề hiển thị trên panel khi mở rộng */
  title?: React.ReactNode;
  /** Icon hiển thị khi panel thu gọn */
  collapsedIcon?: React.ReactNode;
  /** Tooltip khi panel thu gọn */
  collapsedLabel?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  children: React.ReactNode;
  /** Ép panel collapse từ parent (ví dụ ở mobile) */
  forceCollapsed?: boolean;
}

export function CollapsiblePanel({
  storageKey,
  side,
  title,
  collapsedIcon,
  collapsedLabel,
  defaultWidth = 280,
  minWidth = 240,
  maxWidth = 480,
  className,
  children,
  forceCollapsed,
}: CollapsiblePanelProps) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ux:panel:${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { collapsed?: boolean; width?: number };
        if (typeof parsed.collapsed === "boolean") setCollapsed(parsed.collapsed);
        if (typeof parsed.width === "number") {
          setWidth(Math.max(minWidth, Math.min(maxWidth, parsed.width)));
        }
      }
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, [storageKey, minWidth, maxWidth]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        `ux:panel:${storageKey}`,
        JSON.stringify({ collapsed, width }),
      );
    } catch {
      /* ignore */
    }
  }, [mounted, storageKey, collapsed, width]);

  const effectiveCollapsed = forceCollapsed || collapsed;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const dx = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      setWidth(Math.max(minWidth, Math.min(maxWidth, startWidth + dx)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (effectiveCollapsed) {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-col items-center border-border bg-card",
          side === "left" ? "border-r" : "border-l",
          className,
        )}
        style={{ width: 40 }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={collapsedLabel ?? "Mở panel"}
          aria-label={collapsedLabel ?? "Mở panel"}
          className="flex h-10 w-full items-center justify-center text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
        >
          {collapsedIcon ??
            (side === "left" ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            ))}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col border-border bg-card",
        side === "left" ? "border-r" : "border-l",
        className,
      )}
      style={{ width }}
    >
      {title && (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3 text-sm font-semibold">
          <div className="min-w-0 flex-1 truncate">{title}</div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Thu gọn"
            aria-label="Thu gọn"
            className="ml-2 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
          >
            {side === "left" ? (
              <ChevronLeft className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startResize}
        title="Kéo để chỉnh độ rộng"
        className={cn(
          "absolute top-0 bottom-0 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40",
          side === "left" ? "-right-0.5" : "-left-0.5",
        )}
      />
    </div>
  );
}
