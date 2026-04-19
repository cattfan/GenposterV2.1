import { useRef, useCallback } from "react";
import type { PageTemplate, Slot } from "@/models";

export function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-8 w-full border rounded px-2 text-sm"
      />
    </div>
  );
}

export function Canvas({
  template,
  zoom,
  selectedSlotId,
  onSelect,
  onUpdateSlot,
}: {
  template: PageTemplate;
  zoom: number;
  selectedSlotId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateSlot: (slotId: string, patch: Partial<Slot>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative shadow-2xl"
      style={{
        width: template.canvas.width * zoom,
        height: template.canvas.height * zoom,
        background: template.canvas.background ?? "#fff",
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onSelect(null);
      }}
    >
      {template.slots
        .slice()
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((slot) => (
          <SlotEditor
            key={slot.slotId}
            slot={slot}
            zoom={zoom}
            selected={slot.slotId === selectedSlotId}
            onSelect={() => onSelect(slot.slotId)}
            onUpdate={(patch) => onUpdateSlot(slot.slotId, patch)}
            template={template}
          />
        ))}
    </div>
  );
}

function SlotEditor({
  slot,
  zoom,
  selected,
  onSelect,
  onUpdate,
  template,
}: {
  slot: Slot;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Slot>) => void;
  template: PageTemplate;
}) {
  const startDrag = useCallback(
    (e: React.MouseEvent, mode: "move" | "resize") => {
      e.stopPropagation();
      onSelect();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { x: slot.x, y: slot.y, w: slot.width, h: slot.height };
      const onMove = (ev: MouseEvent) => {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        if (mode === "move") {
          onUpdate({ x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) });
        } else {
          onUpdate({
            width: Math.max(20, Math.round(orig.w + dx)),
            height: Math.max(20, Math.round(orig.h + dy)),
          });
        }
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [slot, zoom, onSelect, onUpdate],
  );

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: slot.x * zoom,
    top: slot.y * zoom,
    width: slot.width * zoom,
    height: slot.height * zoom,
    transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
    cursor: "move",
    outline: selected ? "2px solid hsl(var(--primary))" : "1px dashed rgba(0,0,0,0.15)",
    outlineOffset: 0,
    boxSizing: "border-box",
  };

  let content: React.ReactNode = null;
  if (slot.kind === "text") {
    const s = slot.style ?? {};
    content = (
      <div
        style={{
          color: s.color ?? "#0f172a",
          fontSize: (s.fontSize ?? 24) * zoom,
          fontWeight: s.fontWeight ?? 500,
          lineHeight: s.lineHeight ?? 1.2,
          textAlign: s.textAlign ?? "left",
          textTransform: s.textTransform ?? "none",
          letterSpacing: (s.letterSpacing ?? 0) * zoom,
          whiteSpace: "pre-wrap",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {slot.staticText}
      </div>
    );
  } else if (slot.kind === "image") {
    content = slot.staticImage ? (
      <img
        src={slot.staticImage}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: (slot.style?.fit === "stretch"
            ? "fill"
            : slot.style?.fit ?? "cover") as React.CSSProperties["objectFit"],
          borderRadius: (slot.style?.borderRadius ?? 0) * zoom,
        }}
      />
    ) : (
      <div className="w-full h-full bg-muted/50 grid place-items-center text-xs text-muted-foreground">
        Image (bind data)
      </div>
    );
  } else if (slot.kind === "shape") {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: slot.style?.fill ?? "#000",
          borderRadius:
            slot.shapeKind === "circle" ? "50%" : (slot.style?.borderRadius ?? 0) * zoom,
        }}
      />
    );
  } else if (slot.kind === "section") {
    const sec = template.sections.find((s) => s.sectionId === slot.sectionRefId);
    content = (
      <div className="w-full h-full bg-accent/30 border-2 border-dashed border-accent grid place-items-center text-accent-foreground text-xs p-2 text-center">
        📦 Section: {sec?.title ?? "(chưa gán)"}
      </div>
    );
  }

  return (
    <div style={baseStyle} onMouseDown={(e) => startDrag(e, "move")}>
      {content}
      {selected && (
        <div
          onMouseDown={(e) => startDrag(e, "resize")}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "hsl(var(--primary))",
            cursor: "nwse-resize",
            borderRadius: 2,
          }}
        />
      )}
    </div>
  );
}
