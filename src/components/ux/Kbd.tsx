// Keyboard shortcut hint badge. Dùng trong tooltip/menu/dialog phím tắt.
// Phục vụ Requirement 10.

import { cn } from "@/lib/utils";

interface KbdProps {
  keys: string | string[];
  className?: string;
}

const MAC_SYMBOLS: Record<string, string> = {
  Ctrl: "⌘",
  Alt: "⌥",
  Shift: "⇧",
  Meta: "⌘",
  Enter: "↵",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
};

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function Kbd({ keys, className }: KbdProps) {
  const mac = isMac();
  const parts = typeof keys === "string" ? keys.split("+").map((s) => s.trim()) : keys;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {parts.map((k, i) => (
        <span key={i} className="ux-kbd">
          {mac ? (MAC_SYMBOLS[k] ?? k) : k}
        </span>
      ))}
    </span>
  );
}
