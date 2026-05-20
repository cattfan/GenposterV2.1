// MappingOverview — bảng trực quan "trường dữ liệu nào của sheet đang được gắn
// vào slot nào trong page hiện tại". Logic core ở [mappingOverview.utils.ts]
// để file này chỉ export component (giúp react-refresh fast-refresh).

import { useMemo } from "react";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Entity, PageTemplate } from "@/models";
import {
  buildMappingOverview,
  type MappingRow,
} from "./mappingOverview.utils";

interface AutoBindPreview {
  /** Tổng số slot có thể auto-bind. */
  totalChangeable: number;
  /** Tách theo tầng để user hiểu confidence. */
  byTier: { token: number; name: number; heuristic: number };
}

interface Props {
  template: PageTemplate | undefined;
  /**
   * Entities thuộc sheet đang dùng — caller nên đẩy pool TRƯỚC khi áp filter
   * onlyPartner / quota (vd: `globalAvailableEntities`) để cột "có data" hiển
   * thị đúng ngữ nghĩa "sheet có data hay không", không bị lệch theo filter
   * tạm thời của user.
   */
  entitiesInSheet: Entity[];
  /** Click slot -> highlight ngoài canvas (PackTabContent gọi setSelectedSlotIds). */
  onSelectSlot?: (slotId: string) => void;
  /** Bấm nút "Tự liên kết theo mẫu" -> chạy autoBindPlaceholders cho template hiện tại. */
  onAutoBind?: () => void;
  /** Có đang chạy auto-bind không (để hiện loader). */
  autoBindBusy?: boolean;
  /**
   * Preview dry-run của auto-bind 3 tầng. Caller (PackTabContent) tính qua
   * `previewAutoBindForDrafts` để hiện gợi ý "X token + Y theo tên + Z heuristic".
   */
  autoBindPreview?: AutoBindPreview;
  /**
   * Slot đang được chọn ngoài canvas. Khi mảng này không rỗng, mỗi row hiện
   * thêm nút "+ Gắn vào khối đang chọn" để user click field → bind 1 phát.
   */
  selectedSlotIds?: string[];
  /**
   * Callback khi user bấm "+ Gắn vào khối đang chọn" trên row của 1 field.
   * Caller áp `bindingPath` vào toàn bộ slot đang chọn.
   */
  onBindFieldToSelected?: (bindingPath: string) => void;
  /**
   * Callback khi user bấm "Nhóm dữ liệu" trên row có cảnh báo trùng. Nếu
   * không truyền, badge cảnh báo vẫn hiện nhưng không có action.
   */
  onGroupBoundSlots?: (slotIds: string[]) => void;
}

const SUM_LABEL: Record<keyof AutoBindPreview["byTier"], string> = {
  token: "theo placeholder",
  name: "theo tên khối",
  heuristic: "theo nội dung",
};

export function MappingOverview({
  template,
  entitiesInSheet,
  onSelectSlot,
  onAutoBind,
  autoBindBusy,
  autoBindPreview,
  selectedSlotIds,
  onBindFieldToSelected,
  onGroupBoundSlots,
}: Props) {
  const summary = useMemo(
    () => buildMappingOverview(template, entitiesInSheet),
    [template, entitiesInSheet],
  );

  if (!template) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        Chọn 1 trang để xem các trường dữ liệu đã liên kết.
      </div>
    );
  }

  const { rows, fieldsWithData, fieldsBound, hasUnboundPlaceholders } = summary;
  const ratioColor =
    fieldsWithData === 0
      ? "text-muted-foreground"
      : fieldsBound === fieldsWithData
        ? "text-emerald-600"
        : fieldsBound * 2 < fieldsWithData
          ? "text-rose-600"
          : "text-amber-600";

  // Sort: row có data trong sheet lên trước, trong đó row chưa bind đẩy lên top.
  const sortedRows = rows
    .slice()
    .sort((a, b) => {
      const score = (row: MappingRow) =>
        (row.hasDataInSheet ? 1 : 0) * 10 +
        (row.boundSlots.length === 0 ? 5 : 0) +
        (row.placeholderSlots.length > 0 ? 2 : 0);
      return score(b) - score(a);
    });

  const standardRows = sortedRows.filter((row) => !row.isFreeMetadata);
  const freeRows = sortedRows.filter((row) => row.isFreeMetadata);
  const hasSelected = (selectedSlotIds?.length ?? 0) > 0;
  const previewTotal = autoBindPreview?.totalChangeable ?? 0;

  const autoBindCaption = (() => {
    if (!autoBindPreview || previewTotal === 0) return null;
    const parts = (Object.keys(autoBindPreview.byTier) as Array<keyof AutoBindPreview["byTier"]>)
      .filter((tier) => autoBindPreview.byTier[tier] > 0)
      .map((tier) => `${autoBindPreview.byTier[tier]} ${SUM_LABEL[tier]}`);
    return parts.join(" · ");
  })();

  const showAutoBindButton =
    !!onAutoBind && (hasUnboundPlaceholders || previewTotal > 0);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2 rounded-lg border bg-card/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Sparkles className="size-3.5" />
            Trường dữ liệu &rarr; Khối
          </div>
          <span className={`text-xs font-semibold ${ratioColor}`}>
            {fieldsBound}/{fieldsWithData} đã gắn
          </span>
        </div>

        {showAutoBindButton && (
          <div className="space-y-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 w-full justify-start text-xs"
              onClick={onAutoBind}
              disabled={autoBindBusy}
              title={
                previewTotal > 0
                  ? `Có thể tự gắn ${previewTotal} khối`
                  : undefined
              }
            >
              {autoBindBusy ? (
                <Loader2 className="mr-2 size-3 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 size-3" />
              )}
              Tự liên kết{previewTotal > 0 ? ` (${previewTotal} khối)` : ""}
            </Button>
            {autoBindCaption && (
              <p className="text-[10px] leading-tight text-muted-foreground">
                {autoBindCaption}
              </p>
            )}
          </div>
        )}

        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-xs">
            <tbody>
              {standardRows.map((row) => renderRow(row, false))}
              {freeRows.length > 0 && (
                <tr>
                  <td colSpan={2} className="pt-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      Trường tự do từ sheet
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  </td>
                </tr>
              )}
              {freeRows.map((row) => renderRow(row, true))}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );

  function renderRow(row: MappingRow, isFree: boolean) {
    const status = !row.hasDataInSheet
      ? "no-data"
      : row.boundSlots.length > 0
        ? "bound"
        : row.placeholderSlots.length > 0
          ? "placeholder"
          : "missing";

    const showBindButton =
      hasSelected && !!onBindFieldToSelected && !isFree;
    const dimmed = status === "no-data";

    return (
      <tr
        key={row.field.id}
        className={
          dimmed ? "text-muted-foreground/60" : "border-t border-border/40"
        }
      >
        <td className="w-[42%] py-1.5 pr-2 align-top">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{row.field.labelVi}</span>
            {row.duplicateUnGrouped && row.boundSlots.length > 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      onGroupBoundSlots?.(row.boundSlots.map((s) => s.slotId));
                    }}
                    className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300"
                    aria-label="Cảnh báo bind trùng chưa nhóm"
                  >
                    <AlertTriangle className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px]">
                  <p>
                    {row.boundSlots.length} khối cùng gắn “{row.field.labelVi}” nhưng chưa nhóm
                    — sẽ render entity khác nhau, tạo content lệch.
                    {onGroupBoundSlots ? " Bấm vào dấu ! để nhóm tự động." : ""}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {!row.hasDataInSheet && (
            <div className="text-[10px] text-muted-foreground">
              (sheet chưa có dữ liệu)
            </div>
          )}
          {showBindButton && (
            <button
              type="button"
              className="mt-1 inline-flex h-5 items-center gap-0.5 rounded border border-dashed border-primary/40 bg-primary/5 px-1.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
              onClick={() => onBindFieldToSelected?.(row.field.bindingPath)}
              title={`Gắn “${row.field.labelVi}” vào ${selectedSlotIds!.length} khối đang chọn`}
            >
              <Plus className="size-2.5" />
              Gắn vào khối đang chọn
            </button>
          )}
        </td>
        <td className="py-1.5 align-top">
          {row.boundSlots.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.boundSlots.map((slot) => (
                <Badge
                  key={slot.slotId}
                  variant="secondary"
                  className="cursor-pointer text-[10px]"
                  onClick={() => onSelectSlot?.(slot.slotId)}
                >
                  {slot.slotName}
                </Badge>
              ))}
            </div>
          ) : row.placeholderSlots.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="outline" className="text-[10px] text-amber-600">
                Có mẫu chưa gắn
              </Badge>
              {row.placeholderSlots.map((slot) => (
                <Badge
                  key={slot.slotId}
                  variant="outline"
                  className="cursor-pointer text-[10px]"
                  onClick={() => onSelectSlot?.(slot.slotId)}
                >
                  {slot.slotName}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {row.hasDataInSheet ? "Chưa gắn vào khối nào" : "—"}
            </span>
          )}
        </td>
      </tr>
    );
  }
}
