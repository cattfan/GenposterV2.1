import { useEffect, useMemo, useRef, useState } from "react";
import { Package } from "lucide-react";
import type { Asset, Entity, PageTemplate } from "@/models";
import type { RenderedItem } from "@/models";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ux";
import { BindCanvas } from "@/features/generate/BindCanvas";
import { BindingIssuesPanel } from "@/features/generate/BindingIssuesPanel";
import { AllocationWarningsPanel } from "@/features/generate/AllocationWarningsPanel";
import { GenerateCanvasToolbar } from "@/features/generate/GenerateCanvasToolbar";
import {
  CanvasBindingPickerOverlay,
  type CanvasBindingPickerState,
} from "@/features/generate/CanvasBindingPickerOverlay";
import type { GeneratePageTabItem } from "./generatePanelProps";

interface Props {
  pageTabs: GeneratePageTabItem[];
  activePageIdx: number;
  onActivePageChange: (idx: number) => void;
  hasPages: boolean;
  effectiveActive?: PageTemplate;
  selectedSlotIds: string[];
  onSelectSlot: (
    id: string | null,
    mode?: "replace" | "toggle" | "group" | "replace-many",
    relatedSlotIds?: string[],
  ) => void;
  previewEntity?: Entity;
  assets: Asset[];
  previewEntityPool: Entity[];
  sourceEntities: Entity[];
  previewSlotItems: RenderedItem[];
  showSafeFrame: boolean;
  showFieldBadges: boolean;
  previewAllocationWarnings: string[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onEditLayout: () => void;
  onShowFieldBadgesChange: (value: boolean) => void;
  onShowSafeFrameChange: (value: boolean) => void;
  onClearSelection: () => void;
  canvasBindingPicker?: CanvasBindingPickerState | null;
  onCanvasBindingSelect?: (value: string) => void;
}

function useContainerWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element) {
      setWidth(0);
      return;
    }

    const update = () => setWidth(element.getBoundingClientRect().width);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return width;
}

function computeCanvasScale(template: PageTemplate, containerWidth: number): number {
  if (containerWidth <= 0) return 0.45;

  const inset = 20;
  const maxW = Math.max(260, containerWidth - inset);

  // Lấp đầy chiều ngang cột giữa; phần cao dư cuộn trong stage.
  return Math.min(maxW / template.canvas.width, 1);
}

export function GenerateCanvasPanel({
  pageTabs,
  activePageIdx,
  onActivePageChange,
  hasPages,
  effectiveActive,
  selectedSlotIds,
  onSelectSlot,
  previewEntity,
  assets,
  previewEntityPool,
  sourceEntities,
  previewSlotItems,
  showSafeFrame,
  showFieldBadges,
  previewAllocationWarnings,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onEditLayout,
  onShowFieldBadgesChange,
  onShowSafeFrameChange,
  onClearSelection,
  canvasBindingPicker,
  onCanvasBindingSelect,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const containerWidth = useContainerWidth(stageElement);

  const canvasScale = useMemo(() => {
    if (!effectiveActive) return 0.45;
    return computeCanvasScale(effectiveActive, containerWidth);
  }, [effectiveActive, containerWidth]);

  const canvasSize = useMemo(() => {
    if (!effectiveActive) return { width: 0, height: 0 };
    return {
      width: Math.round(effectiveActive.canvas.width * canvasScale),
      height: Math.round(effectiveActive.canvas.height * canvasScale),
    };
  }, [effectiveActive, canvasScale]);

  return (
    <Card className="min-w-0 overflow-hidden border-0 shadow-none lg:border lg:shadow-sm">
      {hasPages ? (
        <div className="border-b bg-muted/30">
          <Tabs
            value={String(activePageIdx)}
            onValueChange={(v) => onActivePageChange(Number(v))}
          >
            <div className="overflow-x-auto px-2 py-2 [scrollbar-width:thin]">
              <TabsList className="inline-flex h-8 w-max min-w-full gap-0.5 bg-transparent p-0 pb-0.5">
                {pageTabs.map((tab, idx) => (
                  <TabsTrigger
                    key={tab.pageTemplateId + idx}
                    value={String(idx)}
                    className="h-7 shrink-0 gap-1 rounded-md border border-transparent px-2.5 text-xs font-medium transition-colors hover:bg-muted/60 data-[state=active]:border-border/70 data-[state=active]:bg-muted data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                  >
                    Trang {idx + 1}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>
      ) : null}

      {hasPages && effectiveActive ? (
        <GenerateCanvasToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onEditLayout={onEditLayout}
          canvasReady={!!effectiveActive}
          showFieldBadges={showFieldBadges}
          onShowFieldBadgesChange={onShowFieldBadgesChange}
          showSafeFrame={showSafeFrame}
          onShowSafeFrameChange={onShowSafeFrameChange}
        />
      ) : null}

      <CardContent className="flex flex-col gap-3 p-0">
        {!hasPages ? (
          <div className="m-3 grid min-h-[min(480px,60vh)] place-items-center rounded-lg border border-dashed p-6">
            <EmptyState
              icon={<Package />}
              title="Chưa chọn bộ mẫu"
              description="Chọn một bộ mẫu ở cột trái để xem và chỉnh các trang."
              compact
            />
          </div>
        ) : (
          <>
            {effectiveActive ? (
              <div
                ref={(node) => {
                  stageRef.current = node;
                  setStageElement(node);
                }}
                className="border-b bg-muted/20"
              >
                <div className="max-h-[min(78vh,960px)] overflow-auto p-3">
                  <div
                    onClick={(event) => {
                      if (event.target === event.currentTarget) onClearSelection();
                    }}
                    className="mx-auto flex min-h-[420px] w-full select-none items-start justify-center"
                  >
                    <div
                      className="relative shrink-0 overflow-hidden bg-background shadow-md ring-1 ring-border/70"
                      style={{ width: canvasSize.width, height: canvasSize.height }}
                    >
                      <BindCanvas
                        template={effectiveActive}
                        scale={canvasScale}
                        selectedSlotIds={selectedSlotIds}
                        onSelectSlot={onSelectSlot}
                        entity={previewEntity}
                        assets={assets}
                        entityPool={previewEntityPool}
                        sourceEntities={sourceEntities}
                        slotItems={previewSlotItems}
                        seedKey={`${effectiveActive.pageTemplateId}:${activePageIdx}`}
                        showSafeFrame={showSafeFrame}
                        showFieldBadges={showFieldBadges}
                        flatPreview
                      />
                      {canvasBindingPicker && onCanvasBindingSelect ? (
                        <CanvasBindingPickerOverlay
                          slot={canvasBindingPicker.slot}
                          scale={canvasScale}
                          enabled
                          value={canvasBindingPicker.value}
                          options={canvasBindingPicker.options}
                          quickValues={canvasBindingPicker.quickValues}
                          searchPlaceholder={
                            canvasBindingPicker.mode === "image"
                              ? "Tìm kiểu ảnh..."
                              : "Tìm trường..."
                          }
                          onSelect={onCanvasBindingSelect}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {effectiveActive ? (
              <div className="flex flex-col gap-3 px-3 pb-3">
                <BindingIssuesPanel
                  template={effectiveActive}
                  entity={previewEntity}
                  entityPool={previewEntityPool}
                  assets={assets}
                  globalAssets={assets}
                  activeSheetName={previewEntity?.sheetName}
                  onSelectSlot={(slotId) => onSelectSlot(slotId)}
                />
              </div>
            ) : null}

            {previewAllocationWarnings.length > 0 ? (
              <div className="px-3 pb-3">
                <AllocationWarningsPanel warnings={previewAllocationWarnings} />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
