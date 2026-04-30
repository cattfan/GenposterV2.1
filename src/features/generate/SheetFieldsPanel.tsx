import { useMemo, useState, type ReactNode } from "react";
import type { Entity, Slot } from "@/models";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Database, Image as ImageIcon, MousePointerClick, Search, Type } from "lucide-react";

const STANDARD_FIELDS: Array<{ key: string; label: string; path: string }> = [
  { key: "name", label: "Tên", path: "entity.name" },
  { key: "address", label: "Địa chỉ", path: "entity.address" },
  { key: "phone", label: "SĐT", path: "entity.phone" },
  { key: "priceRange", label: "Giá", path: "entity.priceRange" },
  { key: "style", label: "Phong cách", path: "entity.style" },
  { key: "openingHours", label: "Giờ mở cửa", path: "entity.openingHours" },
  { key: "categoryMain", label: "Loại / Mô hình", path: "entity.categoryMain" },
  { key: "categorySub", label: "Phong cách phụ", path: "entity.categorySub" },
];

interface FieldItem {
  label: string;
  path: string;
  sample?: string;
  isImageLike: boolean;
}

function looksLikeImageUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase();
  if (!text) return false;
  if (
    !text.startsWith("http://") &&
    !text.startsWith("https://") &&
    !text.startsWith("data:image")
  ) {
    return false;
  }
  return (
    /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/.test(text) ||
    text.includes("googleusercontent") ||
    text.includes("drive.google.com") ||
    text.includes("imgur") ||
    text.includes("cloudinary")
  );
}

function truncate(value: unknown, max = 40): string {
  if (value == null) return "";
  const text = String(value).trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getSlotMode(slot: Slot): "text" | "image" | null {
  if (slot.kind === "text") return "text";
  if (slot.kind === "image") return "image";
  if (slot.kind === "shape") return slot.staticText?.trim() ? "text" : "image";
  return null;
}

export function SheetFieldsPanel({
  entities,
  sheetOptions,
  selectedSheet,
  onSelectSheet,
  selectedSlots,
  previewEntity,
  onBindToSelectedSlot,
  showSheetSelector = true,
}: {
  entities: Entity[];
  sheetOptions: string[];
  selectedSheet: string;
  onSelectSheet: (sheet: string) => void;
  selectedSlots: Slot[];
  previewEntity: Entity | undefined;
  onBindToSelectedSlot: (path: string, isImageLike: boolean) => void;
  showSheetSelector?: boolean;
}) {
  const [query, setQuery] = useState("");

  const sheetEntities = useMemo(() => {
    if (selectedSheet === "__all__") return entities;
    return entities.filter((entity) => entity.sheetName === selectedSheet);
  }, [entities, selectedSheet]);

  const fields: FieldItem[] = useMemo(() => {
    const list: FieldItem[] = [];
    const seen = new Set<string>();

    for (const field of STANDARD_FIELDS) {
      const hasValue = sheetEntities.some((entity) => {
        const value = (entity as unknown as Record<string, unknown>)[field.key];
        return value != null && value !== "";
      });
      if (!hasValue) continue;

      list.push({
        label: field.label,
        path: field.path,
        sample: previewEntity
          ? truncate((previewEntity as unknown as Record<string, unknown>)[field.key])
          : "",
        isImageLike: false,
      });
      seen.add(field.path);
    }

    const metaKeys = new Map<string, { count: number; imageHits: number }>();
    for (const entity of sheetEntities) {
      for (const [key, value] of Object.entries(entity.metadata ?? {})) {
        if (value == null || value === "") continue;
        const current = metaKeys.get(key) ?? { count: 0, imageHits: 0 };
        current.count += 1;
        if (looksLikeImageUrl(value)) current.imageHits += 1;
        metaKeys.set(key, current);
      }
    }

    Array.from(metaKeys.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .forEach(([key, info]) => {
        const path = `entity.metadata.${key}`;
        if (seen.has(path)) return;
        list.push({
          label: key,
          path,
          sample: previewEntity ? truncate(previewEntity.metadata?.[key]) : "",
          isImageLike: info.imageHits > 0 && info.imageHits >= info.count * 0.5,
        });
      });

    return list;
  }, [sheetEntities, previewEntity]);

  const selectedModes = selectedSlots
    .map(getSlotMode)
    .filter((mode): mode is "text" | "image" => !!mode);
  const canBindNow = selectedModes.length > 0;
  const textTargetCount = selectedModes.filter((mode) => mode === "text").length;
  const imageTargetCount = selectedModes.filter((mode) => mode === "image").length;

  const filteredFields = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return fields;
    return fields.filter((field) => {
      const haystack = `${field.label} ${field.path} ${field.sample ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [fields, query]);

  const textFields = filteredFields.filter((field) => !field.isImageLike);
  const imageFields = filteredFields.filter((field) => field.isImageLike);

  const fieldEnabled = (field: FieldItem): boolean => {
    if (!canBindNow) return false;
    if (field.isImageLike) return imageTargetCount > 0;
    return textTargetCount > 0;
  };

  const activeSheetLabel = selectedSheet === "__all__" ? "Tất cả" : selectedSheet;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Database className="size-3.5" />
              Trường dữ liệu
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Nguồn: <span className="font-medium text-foreground">{activeSheetLabel}</span>
            </div>
          </div>
          <Badge variant={canBindNow ? "default" : "secondary"} className="shrink-0">
            {canBindNow ? `${selectedModes.length} khối` : "Chưa chọn khối"}
          </Badge>
        </div>

        {showSheetSelector && (
          <div className="mt-3 flex flex-wrap gap-1">
            <SheetChip
              active={selectedSheet === "__all__"}
              label="Tất cả"
              onClick={() => onSelectSheet("__all__")}
            />
            {sheetOptions.map((sheet) => (
              <SheetChip
                key={sheet}
                active={selectedSheet === sheet}
                label={sheet}
                onClick={() => onSelectSheet(sheet)}
              />
            ))}
          </div>
        )}

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm trường, ví dụ: tên, địa chỉ, giá..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {!canBindNow ? (
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-background p-3 text-xs text-muted-foreground">
          <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
          <span>Chọn khung chữ hoặc ảnh trên vùng thiết kế, rồi bấm trường bên dưới để liên kết.</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {textTargetCount > 0 && <Badge variant="outline">{textTargetCount} khung chữ</Badge>}
          {imageTargetCount > 0 && <Badge variant="outline">{imageTargetCount} khung ảnh</Badge>}
          <span className="self-center">Bấm trường phù hợp để gán nhanh.</span>
        </div>
      )}

      {filteredFields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Không tìm thấy trường phù hợp.
        </div>
      ) : (
        <div className="space-y-3">
          <FieldSection
            title="Chữ"
            icon={<Type className="size-3.5" />}
            fields={textFields}
            selectedSlots={selectedSlots}
            isEnabled={fieldEnabled}
            onBind={onBindToSelectedSlot}
          />
          <FieldSection
            title="Ảnh"
            icon={<ImageIcon className="size-3.5" />}
            fields={imageFields}
            selectedSlots={selectedSlots}
            isEnabled={fieldEnabled}
            onBind={onBindToSelectedSlot}
            emptyText="Không có cột ảnh trong nguồn dữ liệu này."
          />
        </div>
      )}
    </div>
  );
}

function SheetChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-transparent bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function FieldSection({
  title,
  icon,
  fields,
  selectedSlots,
  isEnabled,
  onBind,
  emptyText,
}: {
  title: string;
  icon: ReactNode;
  fields: FieldItem[];
  selectedSlots: Slot[];
  isEnabled: (field: FieldItem) => boolean;
  onBind: (path: string, isImageLike: boolean) => void;
  emptyText?: string;
}) {
  if (fields.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          {icon}
          {title}
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {fields.length}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {fields.map((field) => {
          const enabled = isEnabled(field);
          const active = selectedSlots.some((slot) => slot.bindingPath === field.path);
          return (
            <button
              key={field.path}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onBind(field.path, field.isImageLike)}
              title={`Gán ${field.label}`}
              className={cn(
                "group w-full rounded-lg border p-2 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : enabled
                    ? "border-border bg-background hover:border-primary hover:bg-primary/5"
                    : "border-border/60 bg-muted/20 text-muted-foreground/60",
              )}
            >
              <div className="flex items-start gap-2">
                <div
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {active ? (
                    <Check className="size-3.5" />
                  ) : field.isImageLike ? (
                    <ImageIcon className="size-3.5" />
                  ) : (
                    <Type className="size-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold">{field.label}</span>
                  </div>
                  {field.sample ? (
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {field.sample}
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-muted-foreground/70">Không có dữ liệu mẫu</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
