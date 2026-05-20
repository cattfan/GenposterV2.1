import {
  FileDown,
  FileUp,
  MoreHorizontal,
  Package,
  Save,
  Trash2,
} from "lucide-react";
import type { Asset, Entity, GenerateBindingPreset, PageTemplate } from "@/models";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ux";
import { PageRenderer } from "@/features/render/PageRenderer";
import type { PresetCardPagePreviewContext } from "@/features/generate/presetCardPreview";
import { formatTemplateDisplayName } from "@/lib/templateNames";
import { packPageLabel } from "@/features/packs/packTemplateUtils";

interface PresetGalleryItem {
  preset: GenerateBindingPreset;
  pages: PageTemplate[];
}

interface Props {
  packs: Array<{ packTemplateId: string; name: string; orderedPages: string[] }>;
  packId: string | undefined;
  onPackIdChange: (id: string) => void;
  selectedPack: { packTemplateId: string; name: string; orderedPages: string[] } | undefined;
  presets: PresetGalleryItem[];
  entities: Entity[];
  assets: Asset[];
  previewContextKey: (presetId: string, pageTemplateId: string) => string;
  getPreviewContext: (
    key: string,
  ) => PresetCardPagePreviewContext | undefined;
  resolvePreviewTemplate: (
    preset: GenerateBindingPreset,
    page: PageTemplate,
  ) => PageTemplate | null;
  onImport: () => void;
  onCreatePreset: () => void;
  onOpenPreset: (preset: GenerateBindingPreset, pageIndex?: number) => void;
  onExportPreset: (preset: GenerateBindingPreset) => void;
  onDeletePreset: (preset: GenerateBindingPreset) => void;
}

export function PresetGalleryView({
  packs,
  packId,
  onPackIdChange,
  selectedPack,
  presets,
  entities,
  assets,
  previewContextKey,
  getPreviewContext,
  resolvePreviewTemplate,
  onImport,
  onCreatePreset,
  onOpenPreset,
  onExportPreset,
  onDeletePreset,
}: Props) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 sm:max-w-sm sm:flex-1">
          <Label className="text-xs">Bộ mẫu</Label>
          <Select value={packId} onValueChange={onPackIdChange}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn bộ mẫu..." />
            </SelectTrigger>
            <SelectContent>
              {packs.map((p) => (
                <SelectItem key={p.packTemplateId} value={p.packTemplateId}>
                  {formatTemplateDisplayName(p.name, "Bộ khuôn")} ({p.orderedPages.length} trang)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onImport}>
            <FileUp className="mr-2 size-4" /> Nhập khuôn
          </Button>
          <Button type="button" onClick={onCreatePreset} disabled={!selectedPack}>
            <Save className="mr-2 size-4" /> Tạo khuôn mới
          </Button>
        </div>
      </div>

      {presets.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Chưa có khuôn mẫu nào"
          description={
            selectedPack
              ? "Bấm 'Tạo khuôn mới' để bắt đầu thiết kế từ bộ mẫu đã chọn."
              : "Chọn một bộ mẫu ở trên, rồi bấm 'Tạo khuôn mới' để bắt đầu."
          }
          action={
            selectedPack ? (
              <Button type="button" onClick={onCreatePreset}>
                <Save className="mr-2 size-4" /> Tạo khuôn mới
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {presets.map(({ preset, pages }) => (
            <div key={preset.presetId} className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b p-4">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpenPreset(preset)}
                >
                  <div className="truncate text-lg font-semibold">
                    {formatTemplateDisplayName(preset.name, "Khuôn")}
                  </div>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" aria-label="Thao tác khuôn">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onOpenPreset(preset)}>
                      <Package className="mr-2 size-4" /> Mở khuôn
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExportPreset(preset)}>
                      <FileDown className="mr-2 size-4" /> Xuất khuôn
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDeletePreset(preset)}
                    >
                      <Trash2 className="mr-2 size-4" /> Xóa khuôn
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="p-4">
                {pages.length === 0 ? (
                  <div className="grid min-h-28 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    Bộ mẫu hoặc trang mẫu không còn tồn tại.
                  </div>
                ) : (
                  <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
                    <div className="flex w-max min-w-full gap-3">
                    {pages.map((page, index) => {
                      const previewTemplate = resolvePreviewTemplate(preset, page);
                      if (!previewTemplate) return null;
                      const previewContext = getPreviewContext(
                        previewContextKey(preset.presetId, page.pageTemplateId),
                      );
                      if (!previewContext) return null;
                      const previewScale = Math.min(
                        150 / previewTemplate.canvas.width,
                        190 / previewTemplate.canvas.height,
                      );

                      return (
                        <button
                          key={`${preset.presetId}:${page.pageTemplateId}`}
                          type="button"
                          className="group flex w-[172px] shrink-0 flex-col gap-2 rounded-xl border bg-background p-2 text-left shadow-sm transition hover:border-primary/50"
                          onClick={() => onOpenPreset(preset, index)}
                        >
                          <div className="truncate text-sm font-medium">{packPageLabel(index)}</div>
                          <div className="grid h-[205px] place-items-center overflow-hidden border bg-muted/20">
                            <PageRenderer
                              template={previewTemplate}
                              entities={entities}
                              assets={assets}
                              entity={previewContext.entity}
                              entityPool={previewContext.entityPool}
                              slotItems={previewContext.slotItems}
                              scale={previewScale}
                              seedKey={`${preset.presetId}:${page.pageTemplateId}:preview`}
                              hideImagePlaceholderText
                            />
                          </div>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
