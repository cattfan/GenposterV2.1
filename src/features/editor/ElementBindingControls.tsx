// UI bind dữ liệu cho 1 DesignElement (text / image) trong DesignWorkspace
// inspector. Trước khi có file này, editor template chỉ có panel "Data binding"
// chỉ-xem ("Chỉ xem" + chỉ dẫn "mở trang Tạo nội dung") — designer phải rời
// editor mới gán được trường dữ liệu, dễ quên và là nguyên nhân gốc của bug
// "trùng dữ liệu chỉ tên đối tác đổi" trước Milestone A.
//
// File này chỉ render Select + helper text. Logic mutate là 1 callback duy
// nhất `onBindingChange(next: DataBindingRef | undefined)` — caller chịu
// trách nhiệm gọi `editor.updateElements`.

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ENTITY_FIELDS } from "@/engines/normalize/fieldRegistry";
import type { DataBindingRef, DesignElement } from "@/models";

const STATIC_VALUE = "__static__";
const AI_REWRITE_VALUE = "ai.rewrite";

const IMAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "asset.cover", label: "Ảnh đại diện (cover)" },
  { value: "asset.random", label: "Ảnh ngẫu nhiên của quán" },
  { value: "asset.random_global", label: "Ảnh ngẫu nhiên toàn hệ thống" },
];

interface Props {
  element: DesignElement;
  onBindingChange: (next: DataBindingRef | undefined) => void;
}

/** True nếu element là loại có thể bind text. */
function isTextBindable(element: DesignElement): boolean {
  // Element kind "shape" có thể có staticText (text trên nút/badge), cho bind text.
  return element.kind === "text" || element.kind === "shape";
}

/** True nếu element là loại có thể bind image. */
function isImageBindable(element: DesignElement): boolean {
  return element.kind === "image" || element.kind === "shape";
}

function deriveSelectedValue(element: DesignElement, mode: "text" | "image"): string {
  const path = element.binding?.path;
  if (!path) return STATIC_VALUE;
  if (mode === "text") {
    if (path === AI_REWRITE_VALUE) return AI_REWRITE_VALUE;
    if (path.startsWith("entity.")) return path;
    return STATIC_VALUE;
  }
  // image
  if (path === "asset.cover" || path === "asset.random" || path === "asset.random_global") {
    return path;
  }
  return STATIC_VALUE;
}

function buildBindingForPath(path: string): DataBindingRef | undefined {
  if (path === STATIC_VALUE) return undefined;
  // source "entity"/"asset" để designDocumentToPageTemplate giữ nguyên path
  // (Milestone A đã sửa để không drop non-legacy_template binding).
  if (path.startsWith("entity.") || path === AI_REWRITE_VALUE) {
    return { source: "entity", path };
  }
  if (path.startsWith("asset.")) {
    return { source: "asset", path };
  }
  return { source: "manual", path };
}

export function ElementBindingControls({ element, onBindingChange }: Props) {
  const showText = isTextBindable(element);
  const showImage = isImageBindable(element) && element.kind !== "text";

  if (!showText && !showImage) {
    return (
      <div className="text-[11px] text-muted-foreground">
        Khối này chưa hỗ trợ liên kết dữ liệu.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showText && (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Trường dữ liệu (chữ)</Label>
          <Select
            value={deriveSelectedValue(element, "text")}
            onValueChange={(value) => onBindingChange(buildBindingForPath(value))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Chọn trường..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-[10px]">Cố định</SelectLabel>
                <SelectItem value={STATIC_VALUE}>Tĩnh (giữ nguyên chữ)</SelectItem>
                <SelectItem value={AI_REWRITE_VALUE}>AI viết lại</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-[10px]">Trường entity</SelectLabel>
                {ENTITY_FIELDS.filter(
                  (field) => field.placeholderTokens.length > 0 && field.kind === "string",
                ).map((field) => (
                  <SelectItem key={field.id} value={field.bindingPath}>
                    {field.labelVi}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}

      {showImage && (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Nguồn ảnh</Label>
          <Select
            value={deriveSelectedValue(element, "image")}
            onValueChange={(value) => onBindingChange(buildBindingForPath(value))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Chọn nguồn..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STATIC_VALUE}>Tĩnh (ảnh đã upload)</SelectItem>
              {IMAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Liên kết được lưu vào template, sẽ tự áp khi mở trang &quot;Tạo nội dung&quot;.
      </p>
    </div>
  );
}
