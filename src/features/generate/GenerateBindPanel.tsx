import {
  AlertTriangle,
  Copy,
  Link2,
  Link2Off,
  Loader2,
  MousePointerClick,
  Wand2,
} from "lucide-react";
import type { Entity, Slot } from "@/models";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ux";
import { TextListBindingPanel, type TextListFieldOption } from "@/features/generate/TextListBindingPanel";
import { TextRewritePanel } from "@/features/generate/TextRewritePanel";
import type { SlotFormatClipboard } from "@/features/generate/slotFormatClipboard";
import type { SourceControlsRenderer } from "./generatePanelProps";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface BindPanelTextSlotRow {
  slot: Slot;
  label: string;
  statusLabel: string;
  bindingValue: string;
  bindingOptions: Array<{ value: string; label: string }>;
  bindingOptionLabel: (value: string, label: string) => string;
  fieldBindingValue: string;
  showPerSlotSource: boolean;
}

export interface BindPanelImageSlotRow {
  slot: Slot;
  label: string;
  statusLabel: string;
  selectValue: string;
  imageOptions: Array<{ value: string; label: string }>;
  imageOptionLabel: (value: string) => string;
  hasLinkedText: boolean;
  showRandomScope: boolean;
  randomScopeSheet: string;
  randomScopeFolder: string;
  randomImageFolderOptions: string[];
}

interface Props {
  selectedSlotCount: number;
  selectedSlotsEmpty: boolean;
  selectedBindableEmpty: boolean;
  panelPreviewEntity?: Entity;
  formatClipboard: SlotFormatClipboard | null;
  hasMultipleSelectedClusters: boolean;
  shouldShowClusterSourceControls: boolean;
  clusterPasteTargetsCount: number;
  showClusterPasteButton: boolean;
  relatedFormatTargetCount: number;
  selectedDataGroupCount: number;
  showGroupButton: boolean;
  groupButtonActive: boolean;
  textSlots: BindPanelTextSlotRow[];
  imageSlots: BindPanelImageSlotRow[];
  showTextListPanel: boolean;
  textListFieldOptions: TextListFieldOption[];
  previewEntityPool: Entity[];
  prioritizePartner: boolean;
  showTextRewrite: boolean;
  rewriteSlotId: string;
  rewriteCurrentText: string;
  rewriteBusy: boolean;
  showAiCaption: boolean;
  captionBusy: boolean;
  captionDisabled: boolean;
  hasBindingsToClear: boolean;
  sheetOptions: string[];
  allValue: string;
  renderSourceControls: SourceControlsRenderer;
  clusterSourceSlots: Slot[];
  clusterSourceConfig: Parameters<SourceControlsRenderer>[1] | null;
  slotSourceConfig: (slot: Slot) => Parameters<SourceControlsRenderer>[1];
  onCopyFormat: () => void;
  onPasteToSelected: () => void;
  onPasteToCluster: () => void;
  onPasteToRelatedCluster: () => void;
  onGroupSelected: () => void;
  onClearGroups: () => void;
  onTextBindingChange: (slot: Slot, value: string) => void;
  onImageBindingChange: (slot: Slot, value: string) => void;
  onRandomScopeSheetChange: (slot: Slot, sheetName: string) => void;
  onRandomScopeFolderChange: (slot: Slot, folder: string) => void;
  onTextListApply: (bindingPath: string) => void;
  onRewrite: () => void;
  onAiCaption: () => void;
  onClearBindings: () => void;
  bare?: boolean;
}

function BindPanelToolbar({ selectedSlotCount }: { selectedSlotCount: number }) {
  return (
    <div
      role="toolbar"
      aria-label="Liên kết dữ liệu"
      className="flex min-h-11 flex-nowrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Link2 className="size-3.5 shrink-0 text-primary" />
        <span className="truncate text-xs font-medium">Liên kết</span>
      </div>
      {selectedSlotCount > 0 ? (
        <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-xs">
          {selectedSlotCount} khối
        </Badge>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">Chưa chọn</span>
      )}
    </div>
  );
}

function BindPanelBody(props: Props) {
  const {
    selectedSlotCount,
    selectedSlotsEmpty,
    selectedBindableEmpty,
    panelPreviewEntity,
    formatClipboard,
    hasMultipleSelectedClusters,
    shouldShowClusterSourceControls,
    clusterPasteTargetsCount,
    showClusterPasteButton,
    relatedFormatTargetCount,
    selectedDataGroupCount,
    showGroupButton,
    groupButtonActive,
    textSlots,
    imageSlots,
    showTextListPanel,
    textListFieldOptions,
    previewEntityPool,
    prioritizePartner,
    showTextRewrite,
    rewriteSlotId,
    rewriteCurrentText,
    rewriteBusy,
    showAiCaption,
    captionBusy,
    captionDisabled,
    hasBindingsToClear,
    sheetOptions,
    allValue,
    renderSourceControls,
    clusterSourceSlots,
    clusterSourceConfig,
    slotSourceConfig,
    onCopyFormat,
    onPasteToSelected,
    onPasteToCluster,
    onPasteToRelatedCluster,
    onGroupSelected,
    onClearGroups,
    onTextBindingChange,
    onImageBindingChange,
    onRandomScopeSheetChange,
    onRandomScopeFolderChange,
    onTextListApply,
    onRewrite,
    onAiCaption,
    onClearBindings,
  } = props;

  return (
    <div className="flex flex-col gap-3">
      {selectedSlotsEmpty ? (
        <EmptyState
          icon={<MousePointerClick />}
          title="Chưa chọn khối"
          description="Bấm vào một khối trên vùng thiết kế để chỉnh liên kết dữ liệu."
          compact
        />
      ) : null}

      {!selectedSlotsEmpty && selectedBindableEmpty ? (
        <div className="flex flex-col gap-1 rounded-md border border-dashed bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <AlertTriangle className="size-3.5" />
            Khối đang chọn không thể liên kết dữ liệu
          </div>
        </div>
      ) : null}

      {!selectedSlotsEmpty && !selectedBindableEmpty ? (
        <>
          {panelPreviewEntity ? (
            <Badge variant="outline" className="w-fit max-w-full truncate font-normal">
              Xem trước cụm: {panelPreviewEntity.name}
              {panelPreviewEntity.sheetName ? ` · ${panelPreviewEntity.sheetName}` : ""}
            </Badge>
          ) : null}

          <div className="rounded-md border bg-background p-2 shadow-sm">
            <div className="grid grid-cols-2 gap-1.5">
              {formatClipboard ? (
                <Badge
                  variant="outline"
                  className="col-span-2 h-8 justify-center truncate px-2 text-xs"
                  title={`Sao chép từ ${formatClipboard.sourcePageLabel}`}
                >
                  Đã sao chép: {formatClipboard.label} · {formatClipboard.sourcePageLabel}
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 justify-start px-2 text-xs max-lg:h-10"
                onClick={onCopyFormat}
                title="Sao chép trường dữ liệu, nguồn dữ liệu cụm và cách nhóm — có thể dán sang trang khác"
              >
                <Copy className="mr-1 size-3" /> Sao chép liên kết
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 justify-start px-2 text-xs max-lg:h-10"
                disabled={!formatClipboard}
                onClick={onPasteToSelected}
              >
                <Wand2 className="mr-1 size-3" /> Dán vào khối
              </Button>
              {showGroupButton ? (
                <Button
                  type="button"
                  variant={groupButtonActive ? "secondary" : "outline"}
                  size="sm"
                  className="h-9 justify-start px-2 text-xs max-lg:h-10"
                  onClick={onGroupSelected}
                >
                  <Link2 className="mr-1 size-3" /> Nhóm dữ liệu
                </Button>
              ) : null}
              {selectedDataGroupCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 justify-start px-2 text-xs max-lg:h-10"
                  onClick={onClearGroups}
                >
                  <Link2Off className="mr-1 size-3" /> Bỏ nhóm
                </Button>
              ) : null}
              {showClusterPasteButton ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="col-span-2 h-9 justify-start px-2 text-xs max-lg:h-10"
                  disabled={clusterPasteTargetsCount === 0}
                  onClick={onPasteToCluster}
                  title={
                    clusterPasteTargetsCount > 0
                      ? `Dán liên kết cụm layout vào ${clusterPasteTargetsCount} khối trên trang này`
                      : "Trang này không có cụm layout giống bản sao chép"
                  }
                >
                  <Wand2 className="mr-1 size-3" /> Dán vào cùng cụm trang này
                </Button>
              ) : null}
              {relatedFormatTargetCount > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 justify-start px-2 text-xs max-lg:h-10"
                  disabled={!formatClipboard}
                  onClick={onPasteToRelatedCluster}
                >
                  Dán dữ liệu vào cụm
                </Button>
              ) : null}
            </div>
          </div>

          {hasMultipleSelectedClusters ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
              Đang chọn khối từ nhiều cụm — chọn khối trong một cụm để đổi nguồn dữ liệu chung.
            </p>
          ) : null}

          {shouldShowClusterSourceControls && clusterSourceConfig ? (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium">
                Nguồn dữ liệu của cụm
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                {renderSourceControls(clusterSourceSlots, clusterSourceConfig, {
                  description:
                    "Cấu hình này áp dụng cho toàn bộ thuộc tính đã liên kết trong cụm trên trang.",
                })}
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {textSlots.length > 0 ? (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-medium">
                Khung chữ{textSlots.length > 1 ? ` (${textSlots.length} khối)` : ""}
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <Accordion type="multiple" className="flex flex-col gap-2">
                  {textSlots.map((row, index) => (
                    <AccordionItem
                      key={row.slot.slotId}
                      value={row.slot.slotId}
                      className="rounded-lg border bg-muted/20 px-2"
                    >
                      <AccordionTrigger className="py-2 text-xs hover:no-underline">
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                          <span className="truncate font-medium">
                            {index + 1}. {row.label}
                          </span>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {row.statusLabel}
                          </Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="flex flex-col gap-2 pb-3">
                        <Select
                          value={row.bindingValue}
                          onValueChange={(v) => onTextBindingChange(row.slot, v)}
                        >
                          <SelectTrigger className="h-9 max-lg:h-10">
                            <SelectValue placeholder="Chọn trường" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__list">Danh sách nhiều dòng</SelectItem>
                            {row.bindingOptions.map((option) => {
                              const value = option.value || "_static";
                              return (
                                <SelectItem key={`${row.slot.slotId}-${value}`} value={value}>
                                  {row.bindingOptionLabel(value, option.label)}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {row.showPerSlotSource
                          ? renderSourceControls([row.slot], slotSourceConfig(row.slot))
                          : null}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {imageSlots.length > 0 ? (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-medium">
                Khung ảnh{imageSlots.length > 1 ? ` (${imageSlots.length} khối)` : ""}
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <Accordion type="multiple" className="flex flex-col gap-2">
                  {imageSlots.map((row, index) => (
                    <AccordionItem
                      key={row.slot.slotId}
                      value={row.slot.slotId}
                      className="rounded-lg border bg-muted/20 px-2"
                    >
                      <AccordionTrigger className="py-2 text-xs hover:no-underline">
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                          <span className="truncate font-medium">
                            {index + 1}. {row.label}
                          </span>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {row.statusLabel}
                          </Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="flex flex-col gap-2 pb-3">
                        <Select
                          value={row.selectValue}
                          onValueChange={(v) => onImageBindingChange(row.slot, v)}
                        >
                          <SelectTrigger className="h-9 max-lg:h-10">
                            <SelectValue placeholder="Chọn trường ảnh" />
                          </SelectTrigger>
                          <SelectContent>
                            {row.imageOptions.map((option) => (
                              <SelectItem
                                key={`${row.slot.slotId}-${option.value || "_static"}`}
                                value={option.value || "_static"}
                              >
                                {row.imageOptionLabel(option.value || "_static")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!row.hasLinkedText ? (
                          <p className="text-xs leading-snug text-muted-foreground">
                            Muốn dùng ảnh theo quán, hãy nhóm khung ảnh với trường Tên/Địa chỉ/Giá.
                          </p>
                        ) : null}
                        {row.showRandomScope ? (
                          <div className="grid gap-2 rounded-md border bg-background/70 p-2">
                            <div>
                              <Label className="text-xs">Nguồn ảnh</Label>
                              <Select
                                value={row.randomScopeSheet}
                                onValueChange={(sheetName) =>
                                  onRandomScopeSheetChange(row.slot, sheetName)
                                }
                              >
                                <SelectTrigger className="h-9 max-lg:h-10">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={allValue}>Tất cả nguồn</SelectItem>
                                  {sheetOptions.map((sheet) => (
                                    <SelectItem key={sheet} value={sheet}>
                                      {sheet}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Thư mục ảnh</Label>
                              <Select
                                value={row.randomScopeFolder}
                                onValueChange={(folder) =>
                                  onRandomScopeFolderChange(row.slot, folder)
                                }
                              >
                                <SelectTrigger className="h-9 max-lg:h-10">
                                  <SelectValue placeholder="Chọn thư mục / nhóm ảnh" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={allValue}>Tất cả thư mục</SelectItem>
                                  {row.randomImageFolderOptions.map((folder) => (
                                    <SelectItem key={folder} value={folder}>
                                      {folder}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : null}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {showTextListPanel && textSlots[0] ? (
            <TextListBindingPanel
              selectedSlot={textSlots[0].slot}
              fieldOptions={textListFieldOptions}
              entityPool={previewEntityPool}
              prioritizePartnerDefault={prioritizePartner}
              onApply={onTextListApply}
            />
          ) : null}

          {showTextRewrite ? (
            <div className="flex flex-col gap-2">
              <TextRewritePanel
                selectedSlotId={rewriteSlotId}
                currentText={rewriteCurrentText}
                busy={rewriteBusy}
                onRewrite={onRewrite}
              />
              {showAiCaption ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={onAiCaption}
                  disabled={captionBusy || captionDisabled}
                >
                  {captionBusy ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : (
                    <Wand2 className="mr-1 size-3" />
                  )}
                  AI viết chú thích
                </Button>
              ) : null}
            </div>
          ) : null}

          {hasBindingsToClear ? (
            <Button size="sm" variant="outline" className="w-full" onClick={onClearBindings}>
              <Link2Off className="mr-1 size-3" /> Xoá liên kết đã chọn
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function GenerateBindPanel(props: Props) {
  if (props.bare) {
    return <BindPanelBody {...props} />;
  }

  return (
    <Card className={cn("overflow-hidden border-0 shadow-none lg:border lg:shadow-sm")}>
      <BindPanelToolbar selectedSlotCount={props.selectedSlotCount} />
      <CardContent className="p-3">
        <BindPanelBody {...props} />
      </CardContent>
    </Card>
  );
}
