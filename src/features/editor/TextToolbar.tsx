// Floating text formatting toolbar — hiện trên text element khi đang edit hoặc select text.
// Khi contentEditable đang active, dùng execCommand để format selection.
// Khi không edit, cập nhật element style trực tiếp.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DesignTextElement, ElementStyle } from "@/models";

const FONT_SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120];

/** Check if there's a text selection inside a contentEditable */
function hasSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.rangeCount > 0;
}

interface TextToolbarProps {
  element: DesignTextElement;
  scale: number;
  canvasWidth: number;
  availableFontFamilies: string[];
  onUpdateStyle: (patch: Partial<ElementStyle>) => void;
  onUpdateText: (text: string) => void;
}

export function TextToolbar({
  element,
  scale,
  canvasWidth,
  availableFontFamilies,
  onUpdateStyle,
}: TextToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const style = element.style ?? {};
  const isBold = Number(style.fontWeight ?? 400) >= 600;
  const isItalic = style.fontStyle === "italic";
  const isUnderline = style.textDecoration?.includes("underline") ?? false;
  const isStrikethrough = style.textDecoration?.includes("line-through") ?? false;
  const textAlign = style.textAlign ?? "left";

  const toggleBold = useCallback(() => {
    if (hasSelection()) {
      document.execCommand("bold", false);
    } else {
      onUpdateStyle({ fontWeight: isBold ? 400 : 700 });
    }
  }, [isBold, onUpdateStyle]);

  const toggleItalic = useCallback(() => {
    if (hasSelection()) {
      document.execCommand("italic", false);
    } else {
      onUpdateStyle({ fontStyle: isItalic ? "normal" : "italic" });
    }
  }, [isItalic, onUpdateStyle]);

  const toggleUnderline = useCallback(() => {
    if (hasSelection()) {
      document.execCommand("underline", false);
    } else {
      const base = style.textDecoration ?? "none";
      const hasU = base.includes("underline");
      const hasS = base.includes("line-through");
      if (hasU) {
        onUpdateStyle({ textDecoration: hasS ? "line-through" : "none" });
      } else {
        onUpdateStyle({ textDecoration: hasS ? "underline line-through" : "underline" });
      }
    }
  }, [style.textDecoration, onUpdateStyle]);

  const toggleStrikethrough = useCallback(() => {
    if (hasSelection()) {
      document.execCommand("strikeThrough", false);
    } else {
      const base = style.textDecoration ?? "none";
      const hasU = base.includes("underline");
      const hasS = base.includes("line-through");
      if (hasS) {
        onUpdateStyle({ textDecoration: hasU ? "underline" : "none" });
      } else {
        onUpdateStyle({ textDecoration: hasU ? "underline line-through" : "line-through" });
      }
    }
  }, [style.textDecoration, onUpdateStyle]);

  const setAlign = useCallback(
    (align: "left" | "center" | "right") => {
      onUpdateStyle({ textAlign: align });
    },
    [onUpdateStyle],
  );

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const compute = () => setToolbarWidth(el.offsetWidth);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const margin = 8;
  const rawLeft = element.x * scale;
  const maxLeft = Math.max(margin, canvasWidth - toolbarWidth - margin);
  const left = Math.min(Math.max(rawLeft, margin), maxLeft);
  const top = Math.max(margin, element.y * scale - 40);

  return (
    <div
      ref={toolbarRef}
      className="pointer-events-auto absolute z-50 flex max-w-[calc(100%-16px)] flex-wrap items-center gap-0.5 rounded-lg border bg-card px-1 py-0.5 shadow-lg"
      style={{
        left,
        top,
        transform: "translateX(0)",
      }}
      onMouseDown={(e) => {
        // Prevent stealing focus from contentEditable
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Bold */}
      <Button
        size="icon"
        variant={isBold ? "default" : "ghost"}
        className="size-7"
        onClick={toggleBold}
        aria-pressed={isBold}
      >
        <Bold className="size-3.5" />
      </Button>

      {/* Italic */}
      <Button
        size="icon"
        variant={isItalic ? "default" : "ghost"}
        className="size-7"
        onClick={toggleItalic}
        aria-pressed={isItalic}
      >
        <Italic className="size-3.5" />
      </Button>

      {/* Underline */}
      <Button
        size="icon"
        variant={isUnderline ? "default" : "ghost"}
        className="size-7"
        onClick={toggleUnderline}
        aria-pressed={isUnderline}
      >
        <Underline className="size-3.5" />
      </Button>

      {/* Strikethrough */}
      <Button
        size="icon"
        variant={isStrikethrough ? "default" : "ghost"}
        className="size-7"
        onClick={toggleStrikethrough}
        aria-pressed={isStrikethrough}
      >
        <Strikethrough className="size-3.5" />
      </Button>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Font family */}
      <Select
        value={String(style.fontFamily ?? "Be Vietnam Pro")}
        onValueChange={(value) => onUpdateStyle({ fontFamily: value })}
      >
        <SelectTrigger className="h-7 w-[120px] gap-1 border-none px-1.5 text-xs shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableFontFamilies.map((family) => (
            <SelectItem key={family} value={family} className="text-xs">
              <span style={{ fontFamily: family }}>{family}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size */}
      <Select
        value={String(style.fontSize ?? 48)}
        onValueChange={(value) => onUpdateStyle({ fontSize: Number(value) })}
      >
        <SelectTrigger className="h-7 w-[56px] gap-0.5 border-none px-1.5 text-xs shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZE_PRESETS.map((size) => (
            <SelectItem key={size} value={String(size)} className="text-xs">
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Text align */}
      <Button
        size="icon"
        variant={textAlign === "left" ? "default" : "ghost"}
        className="size-7"
        onClick={() => setAlign("left")}
      >
        <AlignLeft className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant={textAlign === "center" ? "default" : "ghost"}
        className="size-7"
        onClick={() => setAlign("center")}
      >
        <AlignCenter className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant={textAlign === "right" ? "default" : "ghost"}
        className="size-7"
        onClick={() => setAlign("right")}
      >
        <AlignRight className="size-3.5" />
      </Button>

      {/* Color */}
      <div className="ml-0.5 flex items-center">
        <Label className="sr-only">Text color</Label>
        <Input
          type="color"
          value={style.color ?? "#0f172a"}
          onChange={(event) => onUpdateStyle({ color: event.target.value })}
          className="size-7 cursor-pointer rounded border p-0.5"
        />
      </div>
    </div>
  );
}
