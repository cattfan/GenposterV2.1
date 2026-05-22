import type { Asset, Entity, PageTemplate, Slot } from "@/models";
import type { TextListFieldOption } from "@/features/generate/TextListBindingPanel";
import type { SlotFormatClipboard } from "@/features/generate/slotFormatClipboard";
import { GenerateWorkspaceShell } from "@/features/generate/GenerateWorkspaceShell";
import { GenerateConfigPanel } from "@/features/generate/GenerateConfigPanel";
import { GenerateCanvasPanel } from "@/features/generate/GenerateCanvasPanel";
import {
  GenerateBindPanel,
  type BindPanelImageSlotRow,
  type BindPanelTextSlotRow,
} from "@/features/generate/GenerateBindPanel";
import type { GeneratePageTabItem, SourceControlsRenderer } from "@/features/generate/generatePanelProps";
import type { ResolvedGeneratePageConfig } from "@/features/generate/generatePanelProps";

export interface GeneratePackWorkspaceProps {
  selectedSlotCount: number;
  generateReadiness: { canGenerate: boolean; reason: string };
  onBack: () => void;
  onGenerate: () => void;
  maxEntities: number;
  setMaxEntities: (value: number | ((prev: number) => number)) => void;
  normalizeCount: (value: number, fallback: number) => number;
  activeGenerateConfig: ResolvedGeneratePageConfig;
  updateActiveGenerateConfig: (patch: Partial<ResolvedGeneratePageConfig>) => void;
  varyFontsFromSecondBundle: boolean;
  setVaryFontsFromSecondBundle: (value: boolean) => void;
  activeTargetCount: number;
  filteredEntityCount: number;
  packPageCount: number;
  totalBound: number;
  estimateGeneratedPageCount: number;
  generationBaseEntitiesCount: number;
  pageTabs: GeneratePageTabItem[];
  activePageIdx: number;
  setActivePageIdx: (idx: number) => void;
  hasPackPages: boolean;
  effectiveActive?: PageTemplate;
  selectedSlotIds: string[];
  handleSelectSlot: (
    slotId: string | null,
    mode?: "replace" | "toggle" | "group" | "replace-many",
    relatedSlotIds?: string[],
  ) => void;
  previewEntity?: Entity;
  assets: Asset[];
  previewEntityPool: Entity[];
  entities: Entity[];
  previewSlotItems: import("@/models").RenderedItem[];
  showSafeFrame: boolean;
  showFieldBadges: boolean;
  setShowFieldBadges: (value: boolean | ((prev: boolean) => boolean)) => void;
  setShowSafeFrame: (value: boolean | ((prev: boolean) => boolean)) => void;
  previewAllocationWarnings: string[];
  canUndoPreviewDraft: boolean;
  canRedoPreviewDraft: boolean;
  undoPreviewPageDrafts: () => void;
  redoPreviewPageDrafts: () => void;
  onEditLayout: () => void;
  selectedSlots: Slot[];
  selectedBindableSlots: Slot[];
  panelPreviewEntity?: Entity;
  formatClipboard: SlotFormatClipboard | null;
  hasMultipleSelectedClusters: boolean;
  shouldShowClusterSourceControls: boolean;
  clusterPasteTargetsCount: number;
  showClusterPasteButton: boolean;
  relatedFormatTargetCount: number;
  selectedDataGroupCount: number;
  bindPanelTextRows: BindPanelTextSlotRow[];
  bindPanelImageRows: BindPanelImageSlotRow[];
  showTextListPanel: boolean;
  textListFieldOptions: TextListFieldOption[];
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
  clusterSourceConfig: ResolvedGeneratePageConfig | null;
  slotSourceConfig: (slot: Slot) => ResolvedGeneratePageConfig;
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
}

export function GeneratePackWorkspace(props: GeneratePackWorkspaceProps) {
  const {
    selectedSlotCount,
    generateReadiness,
    onBack,
    onGenerate,
    maxEntities,
    setMaxEntities,
    normalizeCount,
    activeGenerateConfig,
    updateActiveGenerateConfig,
    varyFontsFromSecondBundle,
    setVaryFontsFromSecondBundle,
    activeTargetCount,
    filteredEntityCount,
    packPageCount,
    totalBound,
    estimateGeneratedPageCount,
    generationBaseEntitiesCount,
    pageTabs,
    activePageIdx,
    setActivePageIdx,
    hasPackPages,
    effectiveActive,
    selectedSlotIds,
    handleSelectSlot,
    previewEntity,
    assets,
    previewEntityPool,
    entities,
    previewSlotItems,
    showSafeFrame,
    showFieldBadges,
    setShowFieldBadges,
    setShowSafeFrame,
    previewAllocationWarnings,
    canUndoPreviewDraft,
    canRedoPreviewDraft,
    undoPreviewPageDrafts,
    redoPreviewPageDrafts,
    onEditLayout,
    selectedSlots,
    selectedBindableSlots,
    panelPreviewEntity,
    formatClipboard,
    hasMultipleSelectedClusters,
    shouldShowClusterSourceControls,
    clusterPasteTargetsCount,
    showClusterPasteButton,
    relatedFormatTargetCount,
    selectedDataGroupCount,
    bindPanelTextRows,
    bindPanelImageRows,
    showTextListPanel,
    textListFieldOptions,
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

  const configPanel = (
    <GenerateConfigPanel
      maxEntities={maxEntities}
      onMaxEntitiesChange={(value) => setMaxEntities(value)}
      normalizeCount={normalizeCount}
      config={{
        prioritizePartner: activeGenerateConfig.prioritizePartner,
        onlyPartner: activeGenerateConfig.onlyPartner,
        partnerQuotaPerPage: activeGenerateConfig.partnerQuotaPerPage,
      }}
      onConfigChange={updateActiveGenerateConfig}
      varyFontsFromSecondBundle={varyFontsFromSecondBundle}
      onVaryFontsChange={setVaryFontsFromSecondBundle}
      activeTargetCount={activeTargetCount}
      stats={{
        entityCount: filteredEntityCount,
        pageCount: packPageCount,
        boundCount: totalBound,
        estimatedPages: estimateGeneratedPageCount,
      }}
      canGenerate={generateReadiness.canGenerate}
      generateReason={generateReadiness.reason}
      hasEntities={generationBaseEntitiesCount > 0}
      onGenerate={onGenerate}
    />
  );

  const canvasPanel = (
    <GenerateCanvasPanel
      pageTabs={pageTabs}
      activePageIdx={activePageIdx}
      onActivePageChange={setActivePageIdx}
      hasPages={hasPackPages}
      effectiveActive={effectiveActive}
      selectedSlotIds={selectedSlotIds}
      onSelectSlot={handleSelectSlot}
      previewEntity={previewEntity}
      assets={assets}
      previewEntityPool={previewEntityPool}
      sourceEntities={entities}
      previewSlotItems={previewSlotItems}
      showSafeFrame={showSafeFrame}
      showFieldBadges={showFieldBadges}
      previewAllocationWarnings={previewAllocationWarnings}
      canUndo={canUndoPreviewDraft}
      canRedo={canRedoPreviewDraft}
      onUndo={undoPreviewPageDrafts}
      onRedo={redoPreviewPageDrafts}
      onEditLayout={onEditLayout}
      onShowFieldBadgesChange={(value) => setShowFieldBadges(value)}
      onShowSafeFrameChange={(value) => setShowSafeFrame(value)}
      onClearSelection={() => handleSelectSlot(null)}
    />
  );

  const bindPanel = (
    <GenerateBindPanel
      selectedSlotCount={selectedSlotCount}
      selectedSlotsEmpty={selectedSlots.length === 0}
      selectedBindableEmpty={selectedBindableSlots.length === 0}
      panelPreviewEntity={panelPreviewEntity}
      formatClipboard={formatClipboard}
      hasMultipleSelectedClusters={hasMultipleSelectedClusters}
      shouldShowClusterSourceControls={shouldShowClusterSourceControls}
      clusterPasteTargetsCount={clusterPasteTargetsCount}
      showClusterPasteButton={showClusterPasteButton}
      relatedFormatTargetCount={relatedFormatTargetCount}
      selectedDataGroupCount={selectedDataGroupCount}
      showGroupButton={selectedBindableSlots.length > 1}
      groupButtonActive={selectedDataGroupCount === 1}
      textSlots={bindPanelTextRows}
      imageSlots={bindPanelImageRows}
      showTextListPanel={showTextListPanel}
      textListFieldOptions={textListFieldOptions}
      previewEntityPool={previewEntityPool}
      prioritizePartner={prioritizePartner}
      showTextRewrite={showTextRewrite}
      rewriteSlotId={rewriteSlotId}
      rewriteCurrentText={rewriteCurrentText}
      rewriteBusy={rewriteBusy}
      showAiCaption={showAiCaption}
      captionBusy={captionBusy}
      captionDisabled={captionDisabled}
      hasBindingsToClear={hasBindingsToClear}
      sheetOptions={sheetOptions}
      allValue={allValue}
      renderSourceControls={renderSourceControls}
      clusterSourceSlots={clusterSourceSlots}
      clusterSourceConfig={clusterSourceConfig}
      slotSourceConfig={slotSourceConfig}
      onCopyFormat={onCopyFormat}
      onPasteToSelected={onPasteToSelected}
      onPasteToCluster={onPasteToCluster}
      onPasteToRelatedCluster={onPasteToRelatedCluster}
      onGroupSelected={onGroupSelected}
      onClearGroups={onClearGroups}
      onTextBindingChange={onTextBindingChange}
      onImageBindingChange={onImageBindingChange}
      onRandomScopeSheetChange={onRandomScopeSheetChange}
      onRandomScopeFolderChange={onRandomScopeFolderChange}
      onTextListApply={onTextListApply}
      onRewrite={onRewrite}
      onAiCaption={onAiCaption}
      onClearBindings={onClearBindings}
    />
  );

  return (
    <GenerateWorkspaceShell
      selectedSlotCount={selectedSlotCount}
      canGenerate={generateReadiness.canGenerate}
      generateReason={generateReadiness.reason}
      onBack={onBack}
      onGenerate={onGenerate}
      configPanel={configPanel}
      canvasPanel={canvasPanel}
      bindPanel={bindPanel}
    />
  );
}
