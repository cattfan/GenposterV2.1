import { useEffect, useState } from "react";
import type { Slot } from "@/models";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  BindingFieldPickerPanel,
  type BindingFieldPickerPanelProps,
} from "@/features/generate/BindingFieldPicker";
import type { BindingPickerOption } from "@/features/generate/bindingPickerOptions";

export interface CanvasBindingPickerState {
  slot: Slot;
  mode: "text" | "image";
  value: string;
  options: BindingPickerOption[];
  quickValues: readonly string[];
}

interface Props extends Omit<BindingFieldPickerPanelProps, "className"> {
  slot: Slot;
  scale: number;
  enabled: boolean;
}

export function CanvasBindingPickerOverlay({
  slot,
  scale,
  enabled,
  value,
  options,
  onSelect,
  quickValues,
  searchPlaceholder,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(enabled);
  }, [enabled, slot.slotId]);

  if (!enabled) return null;

  const anchorStyle = {
    left: slot.x * scale,
    top: slot.y * scale,
    width: Math.max(1, slot.width * scale),
    height: Math.max(1, slot.height * scale),
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="pointer-events-none absolute z-30" style={anchorStyle} />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="z-50 w-[min(100vw-2rem,320px)] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <BindingFieldPickerPanel
          value={value}
          options={options}
          quickValues={quickValues}
          searchPlaceholder={searchPlaceholder}
          onSelect={(next) => {
            onSelect(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
