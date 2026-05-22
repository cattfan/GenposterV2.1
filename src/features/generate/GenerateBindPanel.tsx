import type { ReactNode } from "react";
import {
  AlertTriangle,
  ClipboardPaste,
  Copy,
  Link2,
  Link2Off,
  Loader2,
  MoreHorizontal,
  Wand2,
} from "lucide-react";
import type { Entity, Slot } from "@/models";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BindingFieldPicker } from "@/features/generate/BindingFieldPicker";
import type { BindingPickerOption } from "@/features/generate/bindingPickerOptions";
import {
  IMAGE_BINDING_QUICK_VALUES,
  TEXT_BINDING_QUICK_VALUES,
} from "@/features/generate/bindingPickerOptions";
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
  pickerOptions: BindingPickerOption[];
  showPerSlotSource: boolean;
}

export interface BindPanelImageSlotRow {
  slot: Slot;
  label: string;
  statusLabel: string;
  selectValue: string;
  imageOptions: Array<{ value: string; label: string }>;
  imageOptionLabel: (value: string) => string;
  pickerOptions: BindingPickerOption[];
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

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm">
      {children}
    </div>
  );
}

function BindPanelActionsBar({
  formatClipboard,
  showGroupButton,
  groupButtonActive,
  selectedDataGroupCount,
  showClusterPasteButton,
  clusterPasteTargetsCount,
  relatedFormatTargetCount,
  onCopyFormat,
  onPasteToSelected,
  onGroupSelected,
  onClearGroups,
  onPasteToCluster,
  onPasteToRelatedCluster,
}: {
  formatClipboard: SlotFormatClipboard | null;
  showGroupButton: boolean;
  groupButtonActive: boolean;
  selectedDataGroupCount: number;
  showClusterPasteButton: boolean;
  clusterPasteTargetsCount: number;
  relatedFormatTargetCount: number;
  onCopyFormat: () => void;
  onPasteToSelected: () => void;
  onGroupSelected: () => void;
  onClearGroups: () => void;
  onPasteToCluster: () => void;
  onPasteToRelatedCluster: () => void;
}) {
  const extraActions =
    (showClusterPasteButton ? 1 : 0) + (relatedFormatTargetCount > 1 ? 1 : 0) + (selectedDataGroupCount > 0 ? 1 : 0);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Thao tác liên kết"
        className="flex min-h-11 flex-nowrap items-center gap-1.5 overflow-x-auto border-b bg-muted/30 px-2 py-1.5"
      >
        <ToolbarGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={onCopyFormat}
                aria-label="Sao chép liên kết"
              >
                <Copy className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Sao chép liên kết</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  "size-8 shrink-0",
                  formatClipboard && "bg-primary/10 text-primary hover:bg-primary/15",
                )}
                disabled={!formatClipboard}
                onClick={onPasteToSelected}
                aria-label="Dán vào khối đang chọn"
              >
                <ClipboardPaste className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {formatClipboard
                ? `Dán: ${formatClipboard.label} · ${formatClipboard.sourcePageLabel}`
                : "Dán vào khối đang chọn"}
            </TooltipContent>
          </Tooltip>
        </ToolbarGroup>

        {showGroupButton ? (
          <>
            <ToolbarDivider />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "size-8 shrink-0",
                    groupButtonActive && "bg-primary/10 text-primary hover:bg-primary/15",
                  )}
                  onClick={onGroupSelected}
                  aria-label="Nhóm dữ liệu"
                  aria-pressed={groupButtonActive}
                >
                  <Link2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Nhóm dữ liệu</TooltipContent>
            </Tooltip>
          </>
        ) : null}

        {extraActions > 0 ? (
          <>
            <ToolbarDivider />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  aria-label="Thêm thao tác liên kết"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selectedDataGroupCount > 0 ? (
                  <DropdownMenuItem onClick={onClearGroups}>
                    <Link2Off className="mr-2 size-4" /> Bỏ nhóm
                  </DropdownMenuItem>
                ) : null}
                {showClusterPasteButton ? (
                  <DropdownMenuItem
                    disabled={clusterPasteTargetsCount === 0}
                    onClick={onPasteToCluster}
                  >
                    <Wand2 className="mr-2 size-4" /> Dán vào cùng cụm
                  </DropdownMenuItem>
                ) : null}
                {relatedFormatTargetCount > 1 ? (
                  <DropdownMenuItem disabled={!formatClipboard} onClick={onPasteToRelatedCluster}>
                    <Wand2 className="mr-2 size-4" /> Dán vào cụm liên quan
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function BindSlotRow({
  title,
  statusLabel,
  children,
}: {
  title: string;
  statusLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-xs font-medium">{title}</span>
        <Badge variant="outline" className="max-w-[55%] shrink truncate text-xs">
          {statusLabel}
        </Badge>
      </div>
      {children}
    </div>
  );
}

function BindPanelBody(props: Props) {
  const {
    selectedSlotsEmpty,
    selectedBindableEmpty,
    hasMultipleSelectedClusters,
    shouldShowClusterSourceControls,
    clusterSourceSlots,
    clusterSourceConfig,
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
    slotSourceConfig,
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
      {selectedSlotsEmpty ? <div className="min-h-10 rounded-md border border-dashed bg-muted/20" /> : null}

      {!selectedSlotsEmpty && selectedBindableEmpty ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs font-medium">
          <AlertTriangle className="size-3.5 shrink-0" />
          Không liên kết được
        </div>
      ) : null}

      {!selectedSlotsEmpty && !selectedBindableEmpty ? (
        <>
          {hasMultipleSelectedClusters ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
              Nhiều cụm — chọn khối trong một cụm để đổi nguồn chung.
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
            <div className="flex flex-col gap-2">
              {textSlots.length > 1 ? (
                <div className="text-xs font-medium text-muted-foreground">
                  Khung chữ ({textSlots.length})
                </div>
              ) : null}
              {textSlots.map((row, index) => (
                <BindSlotRow
                  key={row.slot.slotId}
                  title={`${index + 1}. ${row.label}`}
                  statusLabel={row.statusLabel}
                >
                  <BindingFieldPicker
                    value={row.bindingValue}
                    options={row.pickerOptions}
                    quickValues={TEXT_BINDING_QUICK_VALUES}
                    onSelect={(value) => onTextBindingChange(row.slot, value)}
                  />
                  {row.showPerSlotSource
                    ? renderSourceControls([row.slot], slotSourceConfig(row.slot))
                    : null}
                </BindSlotRow>
              ))}
            </div>
          ) : null}

          {imageSlots.length > 0 ? (
            <div className="flex flex-col gap-2">
              {imageSlots.length > 1 ? (
                <div className="text-xs font-medium text-muted-foreground">
                  Khung ảnh ({imageSlots.length})
                </div>
              ) : null}
              {imageSlots.map((row, index) => (
                <BindSlotRow
                  key={row.slot.slotId}
                  title={`${index + 1}. ${row.label}`}
                  statusLabel={row.statusLabel}
                >
                  <BindingFieldPicker
                    value={row.selectValue}
                    options={row.pickerOptions}
                    quickValues={IMAGE_BINDING_QUICK_VALUES}
                    searchPlaceholder="Tìm kiểu ảnh..."
                    onSelect={(value) => onImageBindingChange(row.slot, value)}
                  />
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
                </BindSlotRow>
              ))}
            </div>
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
  const showActions = !props.selectedSlotsEmpty && !props.selectedBindableEmpty;

  if (props.bare) {
    return (
      <div className="flex flex-col gap-3">
        {showActions ? (
          <BindPanelActionsBar
            formatClipboard={props.formatClipboard}
            showGroupButton={props.showGroupButton}
            groupButtonActive={props.groupButtonActive}
            selectedDataGroupCount={props.selectedDataGroupCount}
            showClusterPasteButton={props.showClusterPasteButton}
            clusterPasteTargetsCount={props.clusterPasteTargetsCount}
            relatedFormatTargetCount={props.relatedFormatTargetCount}
            onCopyFormat={props.onCopyFormat}
            onPasteToSelected={props.onPasteToSelected}
            onGroupSelected={props.onGroupSelected}
            onClearGroups={props.onClearGroups}
            onPasteToCluster={props.onPasteToCluster}
            onPasteToRelatedCluster={props.onPasteToRelatedCluster}
          />
        ) : null}
        <BindPanelBody {...props} />
      </div>
    );
  }

  return (
    <Card className={cn("overflow-hidden border-0 shadow-none lg:border lg:shadow-sm")}>
      <BindPanelToolbar selectedSlotCount={props.selectedSlotCount} />
      {showActions ? (
        <BindPanelActionsBar
          formatClipboard={props.formatClipboard}
          showGroupButton={props.showGroupButton}
          groupButtonActive={props.groupButtonActive}
          selectedDataGroupCount={props.selectedDataGroupCount}
          showClusterPasteButton={props.showClusterPasteButton}
          clusterPasteTargetsCount={props.clusterPasteTargetsCount}
          relatedFormatTargetCount={props.relatedFormatTargetCount}
          onCopyFormat={props.onCopyFormat}
          onPasteToSelected={props.onPasteToSelected}
          onGroupSelected={props.onGroupSelected}
          onClearGroups={props.onClearGroups}
          onPasteToCluster={props.onPasteToCluster}
          onPasteToRelatedCluster={props.onPasteToRelatedCluster}
        />
      ) : null}
      <CardContent className="p-3">
        <BindPanelBody {...props} />
      </CardContent>
    </Card>
  );
}
