import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatBindingPickerLabel,
  findBindingPickerOption,
  type BindingPickerGroup,
  type BindingPickerOption,
} from "@/features/generate/bindingPickerOptions";
import { cn } from "@/lib/utils";

const GROUP_ORDER: BindingPickerGroup[] = ["Cố định", "Dữ liệu", "Metadata", "Ảnh"];

export interface BindingFieldPickerPanelProps {
  value: string;
  options: BindingPickerOption[];
  onSelect: (value: string) => void;
  quickValues?: readonly string[];
  searchPlaceholder?: string;
  className?: string;
}

export function BindingFieldPickerPanel({
  value,
  options,
  onSelect,
  quickValues = [],
  searchPlaceholder = "Tìm trường...",
  className,
}: BindingFieldPickerPanelProps) {
  const grouped = useMemo(() => {
    const map = new Map<BindingPickerGroup, BindingPickerOption[]>();
    for (const group of GROUP_ORDER) map.set(group, []);
    for (const option of options) {
      const bucket = map.get(option.group) ?? [];
      bucket.push(option);
      map.set(option.group, bucket);
    }
    return GROUP_ORDER.map((group) => ({ group, items: map.get(group) ?? [] })).filter(
      (entry) => entry.items.length > 0,
    );
  }, [options]);

  const quickOptions = useMemo(
    () =>
      quickValues
        .map((quickValue) => findBindingPickerOption(options, quickValue))
        .filter((option): option is BindingPickerOption => !!option),
    [options, quickValues],
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {quickOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b p-2">
          {quickOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={value === option.value ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      <Command>
        <CommandInput placeholder={searchPlaceholder} className="h-9" />
        <CommandList className="max-h-64">
          <CommandEmpty>Không có trường phù hợp.</CommandEmpty>
          {grouped.map(({ group, items }) => (
            <CommandGroup key={group} heading={group}>
              {items.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.sample ?? ""} ${option.value}`}
                  onSelect={() => onSelect(option.value)}
                >
                  <Check
                    className={cn("size-3.5", value === option.value ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {formatBindingPickerLabel(option)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}

interface BindingFieldPickerProps extends BindingFieldPickerPanelProps {
  triggerClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

export function BindingFieldPicker({
  value,
  options,
  onSelect,
  quickValues,
  searchPlaceholder,
  triggerClassName,
  placeholder = "Chọn trường",
  disabled,
  open: controlledOpen,
  onOpenChange,
}: BindingFieldPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const selected = findBindingPickerOption(options, value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-9 w-full justify-between px-2 text-xs font-normal", triggerClassName)}
        >
          <span className="min-w-0 truncate text-left">
            {selected ? formatBindingPickerLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,320px)] p-0" align="start">
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
