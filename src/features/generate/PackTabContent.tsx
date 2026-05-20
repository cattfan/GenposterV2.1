// Tab "Pack template (nâng cao)" — bind dữ liệu vào từng page của pack giống tab entity.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RemoteError } from "@/storage/remoteClient";
import { useLiveQuery } from "@/storage/useLiveQuery";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
  Download,
  Package,
  Star,
  Loader2,
  Play as PlayIcon,
  Check,
  Pencil,
  X,
} from "lucide-react";
import type {
  Asset,
  Entity,
  GenerateBindingPreset,
  GeneratePageConfig,
  GenerationJob,
  PackTemplate,
  PageTemplate,
  Slot,
} from "@/models";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  TEXT_BINDING_OPTIONS,
  IMAGE_BINDING_OPTIONS,
  ASSET_RANDOM_SCOPE_BINDING_VALUE,
  buildAssetRandomScopeBindingPath,
  buildEntityScopedTextBindingPath,
  getEntityScopedTextBindingBasePath,
  isAssetRandomScopeBindingPath,
  isEntityScopedImageBindingPath,
  parseAssetRandomScopeBindingPath,
  parseEntityListBindingPath,
  parseEntityScopedTextBindingPath,
  resolveTextBinding,
} from "@/engines/binding/dataBinding";
import { PageRenderer } from "@/features/render/PageRenderer";
import { type TextListFieldOption } from "@/features/generate/TextListBindingPanel";
import { GeneratePageEditor } from "@/features/generate/GeneratePageEditor";
import { isLikelyGeneratePageBackgroundSlot } from "@/features/generate/backgroundGuards";
import { autoBindPlaceholdersForDrafts } from "@/features/generate/autoBindPlaceholders";
import {
  buildPresetCardPreviewContexts,
  type PresetCardPagePreviewContext,
} from "@/features/generate/presetCardPreview";
import { canResumePresetWorkspace } from "@/features/generate/presetWorkspacePersistence";
import {
  applyGroupSourceConfigsToTemplate,
  extractGroupSourceConfigs,
  resolveClusterSourceScopeSlots,
  resolveSharedClusterSourceDisplay,
} from "@/features/generate/groupSourceConfig";
import {
  resolveBindingGroupKey,
  resolvePreviewEntityForSlot,
  shouldAutoDataGroupVisualSlots,
  type StickyGroupPin,
} from "@/features/generate/stickyPreviewAllocation";
import {
  applyFormatAssignmentsToSlots,
  buildFormatAssignments,
  buildSlotFormatClipboard,
  createDataGroupId,
  resolveClusterPasteTargets,
  sortSlotsForFormat,
  type SlotFormatClipboard,
} from "@/features/generate/slotFormatClipboard";
import {
  buildTextSlotDisplayLabel,
  normalizeSlotDisplayLabel,
} from "@/features/generate/slotDisplayLabel";
import { entityFieldOptionsForUi } from "@/engines/normalize/fieldRegistry";
import { PackGenerateActions } from "@/features/generate/PackGenerateActions";
import {
  clonePreviewPageDrafts,
  cloneTemplateDraftsWithSource,
  DRAFT_HISTORY_LIMIT,
  type PreviewPageDrafts,
} from "@/features/generate/usePreviewPageDrafts";
import { aiCaptionFromEntity, aiRewriteTextPreserveMeaning } from "@/features/ai/aiFeatures";
import { generatePackJob } from "@/engines/selection/generate";
import { buildEntityBindingTargets, expandPageWithCardGroups } from "@/engines/binding/cardRepeater";
import { isDataGroupMarkerSlot } from "@/engines/binding/slotMarkers";
import { loadExportPipeline } from "@/features/generate/lazyExport";
import { db } from "@/storage/db";
import {
  createWorkingTemplate,
  clonePageTemplate,
  resolvePageWorkingTemplate,
  GENERATE_TEMPLATE_OPTIONS,
} from "@/features/generate/templateState";
import { applyFontVariationToGeneratedJob } from "@/features/generate/fontVariation";
import {
  buildGeneratePresetBundle,
  importPortableBundle,
  readPortableBundleFile,
  safePortableFileName,
} from "@/features/generate/generatePresetPortability";
import { exportPresetJsonToDataServer } from "@/server/presetExport";
import { formatTemplateDisplayName } from "@/lib/templateNames";
import { packPageLabel } from "@/features/packs/packTemplateUtils";
import { usePageCommands, type CommandEntry } from "@/components/CommandPalette";
import { createProgressToast } from "@/components/ux";
import {
  type BindPanelImageSlotRow,
  type BindPanelTextSlotRow,
} from "@/features/generate/GenerateBindPanel";
import { GeneratePackWorkspace } from "@/features/generate/GeneratePackWorkspace";
import { PresetGalleryView } from "@/features/generate/PresetGalleryView";
import { BundleImageWarningsAlert } from "@/features/generate/BundleImageWarningsAlert";
import {
  toPageTabItems,
  type ResolvedGeneratePageConfig,
} from "@/features/generate/generatePanelProps";
import {
  usePackBindOverrides,
  type PackBindOverrides,
} from "@/features/generate/usePackBindOverrides";
import { isSlotInsideSelectionContainer } from "@/features/generate/selectionGeometry";
import {
  ALL_VALUE,
  buildConfiguredEntityPool,
  buildSourceFilteredEntities,
  normalizeCount,
  resolveGeneratePageConfig,
} from "@/features/generate/generateConfigHelpers";
import { useResolvedPackTemplates } from "@/features/generate/useResolvedPackTemplates";
import { useGeneratePageReadiness } from "@/features/generate/useGeneratePageReadiness";
import { usePackPreviewAllocation } from "@/features/generate/usePackPreviewAllocation";
import { usePackBundleGroups } from "@/features/generate/usePackBundleGroups";
import { useBundleExporter } from "@/features/generate/useBundleExporter";

type Filter = "all" | "selected" | "errors" | "partner";

const cloneJsonValue = <T,>(value: T | undefined): T | undefined =>
  value == null ? undefined : (JSON.parse(JSON.stringify(value)) as T);

function resolveWorkingTemplateFromPrev(
  prev: PreviewPageDrafts,
  pageTemplateId: string,
  basePages: PageTemplate[],
  overrides: PackBindOverrides,
): PageTemplate | undefined {
  const base = basePages.find((page) => page.pageTemplateId === pageTemplateId);
  if (!base) return undefined;
  return createWorkingTemplate(
    base,
    overrides[pageTemplateId],
    prev[pageTemplateId],
    GENERATE_TEMPLATE_OPTIONS,
  );
}

// DRAFT_HISTORY_LIMIT, clonePreviewPageDrafts, cloneTemplateDraftsWithSource:
// đã chuyển sang [src/features/generate/usePreviewPageDrafts.ts] và import ở đầu file.

function formatPresetSaveError(error: unknown): string {
  if (error instanceof RemoteError) {
    if (error.status === 404) {
      return "API backend không đúng (404). Kiểm tra port 3010 có bị app khác chiếm không, rồi chạy lại npm run dev.";
    }
    return error.message || `${error.status} ${error.statusText}`;
  }
  const raw = error instanceof Error ? error.message : String(error);
  if (raw === "Failed to fetch" || /networkerror|load failed/i.test(raw)) {
    return "Không kết nối được backend. Chạy npm run dev (cả backend lẫn frontend), không chỉ dev:vite.";
  }
  return raw;
}

function isRetryablePresetSaveError(error: unknown): boolean {
  if (error instanceof RemoteError) return error.status >= 500;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return error.message === "Failed to fetch" || /networkerror|load failed/i.test(error.message);
  }
  return false;
}

interface Props {
  packs: PackTemplate[];
  tpls: PageTemplate[];
  entities: Entity[];
  assets: Asset[];
  currentJob: GenerationJob | null | undefined;
  setJob: (j: GenerationJob) => void;
  updatePage: (
    idx: number,
    updater: (page: GenerationJob["pages"][number]) => GenerationJob["pages"][number],
  ) => void;
  toggleSelected: (idx: number) => void;
  setSelectedAll: (v: boolean) => void;
  renderRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  debug: boolean;
  sheetOptions: string[];
  packId: string | undefined;
  setPackId: (id: string | undefined) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
}

function textBindingOptionLabel(value: string, label: string): string {
  if (value === "_static") return "Giữ nguyên chữ";
  return `Gắn ${label.toLowerCase()}`;
}

function fieldKeyFromBindingPath(path: string): string | null {
  const normalized = getEntityScopedTextBindingBasePath(path);
  if (!normalized.startsWith("entity.")) return null;
  if (normalized.startsWith("entity.metadata.")) {
    return `metadata.${normalized.slice("entity.metadata.".length)}`;
  }
  return normalized.slice("entity.".length);
}

function entityHasTextField(entity: Entity, fieldKey: string): boolean {
  if (fieldKey.startsWith("metadata.")) {
    const metadataKey = fieldKey.slice("metadata.".length);
    const value = entity.metadata?.[metadataKey];
    return value != null && String(value).trim() !== "";
  }
  const value = (entity as unknown as Record<string, unknown>)[fieldKey];
  return value != null && String(value).trim() !== "";
}

function imageBindingOptionLabel(value: string): string {
  if (value === "_static") return "Giữ ảnh hiện tại";
  if (value === "asset.cover") return "Ảnh ngẫu nhiên của quán";
  if (value === "asset.random") return "Ảnh ngẫu nhiên của quán";
  if (value === "asset.random_global") return "Ảnh ngẫu nhiên toàn hệ thống";
  if (value === ASSET_RANDOM_SCOPE_BINDING_VALUE) return "Ảnh ngẫu nhiên theo nguồn/thư mục";
  return value;
}

export function PackTabContent({
  packs,
  tpls,
  entities,
  assets,
  currentJob,
  setJob,
  updatePage,
  toggleSelected,
  setSelectedAll,
  renderRefs,
  debug,
  sheetOptions,
  packId,
  setPackId,
  filter,
  setFilter,
}: Props) {
  const [prioritizePartner, setPrioritizePartner] = useState(true);
  const [onlyPartner, setOnlyPartner] = useState(false);
  const [partnerQuotaPerPage, setPartnerQuotaPerPage] = useState<number>(1);
  const [maxEntities, setMaxEntities] = useState<number>(5);
  const [pageConfigs, setPageConfigs] = useState<Record<string, GeneratePageConfig>>({});
  const [varyFontsFromSecondBundle, setVaryFontsFromSecondBundle] = useState(false);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [previewEntityId, setPreviewEntityId] = useState<string | undefined>(undefined);
  const [editingPreviewOpen, setEditingPreviewOpen] = useState(false);
  const [showSafeFrame, setShowSafeFrame] = useState(false);
  // Hiển thị pill tên trường trên mỗi khối đã bind. Mặc định bật để user
  // luôn biết khối nào gắn gì; tắt khi muốn xem preview clean.
  const [showFieldBadges, setShowFieldBadges] = useState(true);
  const [formatClipboard, setFormatClipboard] = useState<SlotFormatClipboard | null>(null);
  const [captionBusy, setCaptionBusy] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [bundleExportingIndex, setBundleExportingIndex] = useState<number | null>(null);
  const [zoomedPageIndex, setZoomedPageIndex] = useState<number | null>(null);
  const packRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const presetImportRef = useRef<HTMLInputElement>(null);
  const presetAutosaveTimer = useRef<number | null>(null);
  const presetAutosaveErrorRef = useRef(false);
  const presetSaveInFlightRef = useRef<Promise<void> | null>(null);
  const buildCurrentPresetPayloadRef = useRef<
    ((name: string, presetId?: string, createdAt?: number) => GenerateBindingPreset) | null
  >(null);
  const {
    all: packOv,
    setBinding,
    clearBinding,
    resetPage,
    replaceAll,
  } = usePackBindOverrides();
  const [previewPageDrafts, setPreviewPageDrafts] = useState<PreviewPageDrafts>({});
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const lastClosedPresetIdRef = useRef<string>("");
  const stickyPreviewPinsByPageRef = useRef<Map<string, Map<string, StickyGroupPin>>>(new Map());
  const previewPageDraftsRef = useRef<PreviewPageDrafts>({});
  const previewDraftPastRef = useRef<PreviewPageDrafts[]>([]);
  const previewDraftFutureRef = useRef<PreviewPageDrafts[]>([]);
  const undoPreviewPageDraftsRef = useRef<() => void>(() => {});
  const redoPreviewPageDraftsRef = useRef<() => void>(() => {});
  const [previewDraftHistoryVersion, setPreviewDraftHistoryVersion] = useState(0);
  const generatePresets = useLiveQuery(
    () => db.generatePresets.where("mode").equals("pack").toArray(),
    [],
    ["generatePresets"],
  );

  const selectedPack = packs.find((p) => p.packTemplateId === packId);
  const packPages: PageTemplate[] = useMemo(() => {
    if (!selectedPack) return [];
    const map = new Map(tpls.map((t) => [t.pageTemplateId, t]));
    return selectedPack.orderedPages.map((id) => map.get(id)).filter((t): t is PageTemplate => !!t);
  }, [selectedPack, tpls]);

  const activePage = packPages[activePageIdx];
  const matchingPresets = useMemo(
    () => (generatePresets ?? []).sort((a, b) => b.updatedAt - a.updatedAt),
    [generatePresets],
  );
  const canUndoPreviewDraft =
    previewDraftHistoryVersion >= 0 && previewDraftPastRef.current.length > 0;
  const canRedoPreviewDraft =
    previewDraftHistoryVersion >= 0 && previewDraftFutureRef.current.length > 0;

  const touchPreviewDraftHistory = () =>
    setPreviewDraftHistoryVersion((version) => version + 1);

  const clearPreviewDraftHistory = () => {
    previewDraftPastRef.current = [];
    previewDraftFutureRef.current = [];
    touchPreviewDraftHistory();
  };

  const setPreviewDraftsNoHistory = (next: PreviewPageDrafts) => {
    const hydrated = cloneTemplateDraftsWithSource(next, packPages);
    // Diagnostics: bắt slot bindingPath bị clear không chủ ý qua bất kỳ commit
    // nào. Khi user báo bug "bind nhóm 2 làm mất nhóm 1", console sẽ in
    // [bind-loss] với slotId + path cũ + call stack để xác định nguồn.
    if (import.meta.env.DEV) {
      try {
        const prev = previewPageDraftsRef.current;
        for (const [pageId, prevTpl] of Object.entries(prev)) {
          const nextTpl = hydrated[pageId];
          if (!nextTpl) continue;
          const nextById = new Map(nextTpl.slots.map((slot) => [slot.slotId, slot]));
          for (const prevSlot of prevTpl.slots) {
            if (!prevSlot.bindingPath) continue;
            const nextSlot = nextById.get(prevSlot.slotId);
            if (!nextSlot) continue;
            if (nextSlot.bindingPath === prevSlot.bindingPath) continue;
            console.warn("[bind-loss]", {
              pageId,
              slotId: prevSlot.slotId,
              slotName: prevSlot.name,
              prev: prevSlot.bindingPath,
              next: nextSlot.bindingPath,
            });
            console.trace("[bind-loss-trace]");
          }
        }
      } catch {
        // diagnostic only — không phá flow chính
      }
    }
    previewPageDraftsRef.current = hydrated;
    setPreviewPageDrafts(hydrated);
  };

  const commitPreviewPageDrafts = (
    updater: (prev: PreviewPageDrafts) => PreviewPageDrafts,
    options: { history?: boolean } = {},
  ) => {
    const prev = previewPageDraftsRef.current;
    const next = updater(prev);
    if (next === prev) return;

    if (options.history !== false) {
      previewDraftPastRef.current = [
        ...previewDraftPastRef.current,
        clonePreviewPageDrafts(prev),
      ].slice(-DRAFT_HISTORY_LIMIT);
      previewDraftFutureRef.current = [];
      touchPreviewDraftHistory();
    }

    setPreviewDraftsNoHistory(next);
  };

  const replacePreviewPageDrafts = (
    next: PreviewPageDrafts,
    options: { history?: boolean } = {},
  ) => {
    commitPreviewPageDrafts(() => clonePreviewPageDrafts(next), options);
    if (options.history === false) clearPreviewDraftHistory();
  };

  const undoPreviewPageDrafts = () => {
    const previous = previewDraftPastRef.current.at(-1);
    if (!previous) return;
    previewDraftPastRef.current = previewDraftPastRef.current.slice(0, -1);
    previewDraftFutureRef.current = [
      ...previewDraftFutureRef.current,
      clonePreviewPageDrafts(previewPageDraftsRef.current),
    ].slice(-DRAFT_HISTORY_LIMIT);
    setPreviewDraftsNoHistory(clonePreviewPageDrafts(previous));
    touchPreviewDraftHistory();
  };

  const redoPreviewPageDrafts = () => {
    const next = previewDraftFutureRef.current.at(-1);
    if (!next) return;
    previewDraftFutureRef.current = previewDraftFutureRef.current.slice(0, -1);
    previewDraftPastRef.current = [
      ...previewDraftPastRef.current,
      clonePreviewPageDrafts(previewPageDraftsRef.current),
    ].slice(-DRAFT_HISTORY_LIMIT);
    setPreviewDraftsNoHistory(clonePreviewPageDrafts(next));
    touchPreviewDraftHistory();
  };

  useEffect(() => {
    undoPreviewPageDraftsRef.current = undoPreviewPageDrafts;
    redoPreviewPageDraftsRef.current = redoPreviewPageDrafts;
  });

  const { effectiveActive, pageTemplatesForGenerate } = useResolvedPackTemplates({
      tpls,
      packPages,
      activePage,
      packOv,
      previewPageDrafts,
    });
  const activeBaseSlotById = useMemo(
    () => new Map((activePage?.slots ?? []).map((slot) => [slot.slotId, slot])),
    [activePage],
  );

  const globalGenerateConfig: ResolvedGeneratePageConfig = useMemo(
    () => ({
      selectedSheet: ALL_VALUE,
      filterMoHinh: ALL_VALUE,
      filterPhongCach: ALL_VALUE,
      prioritizePartner,
      onlyPartner,
      partnerQuotaPerPage: onlyPartner ? Number.MAX_SAFE_INTEGER : Math.max(1, partnerQuotaPerPage),
      maxEntities: normalizeCount(maxEntities, 5),
    }),
    [
      prioritizePartner,
      onlyPartner,
      partnerQuotaPerPage,
      maxEntities,
    ],
  );

  const sourceNeutralPageConfigs = useMemo(() => {
    const next: Record<string, GeneratePageConfig> = {};
    Object.entries(pageConfigs).forEach(([pageTemplateId, config]) => {
      const rest = { ...config };
      delete rest.selectedSheet;
      delete rest.filterMoHinh;
      delete rest.filterPhongCach;
      if (Object.keys(rest).length > 0) next[pageTemplateId] = rest;
    });
    return next;
  }, [pageConfigs]);

  const activePageConfigEnabled =
    !!activePage && !!sourceNeutralPageConfigs[activePage.pageTemplateId];
  const activeGenerateConfig = useMemo(
    () =>
      resolveGeneratePageConfig(
        globalGenerateConfig,
        activePage ? sourceNeutralPageConfigs[activePage.pageTemplateId] : undefined,
      ),
    [globalGenerateConfig, activePage, sourceNeutralPageConfigs],
  );
  const globalAvailableEntities = useMemo(
    () => buildSourceFilteredEntities(entities, globalGenerateConfig),
    [entities, globalGenerateConfig],
  );
  const filteredEntities = useMemo(
    () => buildConfiguredEntityPool(globalAvailableEntities, globalGenerateConfig),
    [globalAvailableEntities, globalGenerateConfig],
  );
  const generationBaseEntities = useMemo(
    () => entities.filter((entity) => entity.status === "active"),
    [entities],
  );
  const previewGenerateJob = useMemo(() => {
    if (!selectedPack) return null;
    return generatePackJob({
      pack: selectedPack,
      pageTemplates: pageTemplatesForGenerate,
      entities,
      assets,
      mode: "one-entity-per-pack",
      entityPool: generationBaseEntities,
      bindOverrides: packOv,
      partnerQuotaPerPage: globalGenerateConfig.partnerQuotaPerPage,
      prioritizePartner,
      onlyPartner,
      batchCount: maxEntities,
      selectedSheet: globalGenerateConfig.selectedSheet,
      filterMoHinh: globalGenerateConfig.filterMoHinh,
      filterPhongCach: globalGenerateConfig.filterPhongCach,
      pageConfigs: sourceNeutralPageConfigs,
    });
  }, [
    selectedPack,
    pageTemplatesForGenerate,
    entities,
    assets,
    generationBaseEntities,
    packOv,
    globalGenerateConfig,
    prioritizePartner,
    onlyPartner,
    maxEntities,
    sourceNeutralPageConfigs,
  ]);
  const estimateGeneratedPageCount = previewGenerateJob?.pages.length ?? 0;

  const updateActiveGenerateConfig = (patch: Partial<GeneratePageConfig>) => {
    if (activePageConfigEnabled && activePage) {
      setPageConfigs((prev) => ({
        ...prev,
        [activePage.pageTemplateId]: (() => {
          const current = resolveGeneratePageConfig(
            globalGenerateConfig,
            prev[activePage.pageTemplateId],
          );
          const next: GeneratePageConfig = { ...current, ...patch };
          if (patch.onlyPartner === false && current.onlyPartner) {
            next.partnerQuotaPerPage = globalGenerateConfig.onlyPartner
              ? 0
              : globalGenerateConfig.partnerQuotaPerPage;
          }
          return next;
        })(),
      }));
      return;
    }
    if (patch.prioritizePartner != null) setPrioritizePartner(patch.prioritizePartner);
    if (patch.onlyPartner != null) setOnlyPartner(patch.onlyPartner);
    if (patch.partnerQuotaPerPage != null) {
      setPartnerQuotaPerPage(Math.max(1, Math.floor(patch.partnerQuotaPerPage)));
    }
    if (patch.maxEntities != null) setMaxEntities(normalizeCount(patch.maxEntities, maxEntities));
  };

  const buildOrderedEntityPool = useCallback((
    primaryEntityId: string | undefined,
    pool: Entity[] = filteredEntities,
  ): Entity[] => {
    if (!primaryEntityId) return pool;
    return [
      ...pool.filter((entity) => entity.entityId === primaryEntityId),
      ...pool.filter((entity) => entity.entityId !== primaryEntityId),
    ];
  }, [filteredEntities]);

  const buildPageEntityPool = useCallback((page: GenerationJob["pages"][number] | undefined): Entity[] => {
    if (page?.entityPoolIds?.length) {
      const byId = new Map(entities.map((entity) => [entity.entityId, entity]));
      const pool = page.entityPoolIds
        .map((entityId) => byId.get(entityId))
        .filter((entity): entity is Entity => !!entity);
      if (pool.length > 0) return pool;
    }
    return buildOrderedEntityPool(page?.entityId);
  }, [buildOrderedEntityPool, entities]);

  const activeTargetCount = useMemo(
    () =>
      effectiveActive
        ? buildEntityBindingTargets(effectiveActive, filteredEntities).length
        : 0,
    [effectiveActive, filteredEntities],
  );

  useEffect(() => {
    previewPageDraftsRef.current = previewPageDrafts;
  }, [previewPageDrafts]);

  useEffect(() => {
    if (Object.keys(previewPageDraftsRef.current).length === 0) return;
    const hydrated = cloneTemplateDraftsWithSource(previewPageDraftsRef.current, packPages);
    if (JSON.stringify(hydrated) === JSON.stringify(previewPageDraftsRef.current)) return;
    previewPageDraftsRef.current = hydrated;
    setPreviewPageDrafts(hydrated);
  }, [packPages]);

  // Reset slot khi đổi pack/page
  useEffect(() => {
    setSelectedSlotIds([]);
    setFormatClipboard(null);
    setActivePageIdx(0);
    setPageConfigs({});
    previewPageDraftsRef.current = {};
    setPreviewPageDrafts({});
    previewDraftPastRef.current = [];
    previewDraftFutureRef.current = [];
    setPreviewDraftHistoryVersion((version) => version + 1);
    setEditingPageIndex(null);
    setEditingPreviewOpen(false);
    stickyPreviewPinsByPageRef.current = new Map();
  }, [packId]);
  useEffect(() => {
    setSelectedSlotIds([]);
    setEditingPreviewOpen(false);
  }, [activePageIdx]);
  useEffect(() => {
    if (!previewEntityId && filteredEntities[0]) {
      setPreviewEntityId(filteredEntities[0].entityId);
    }
    if (
      previewEntityId &&
      !filteredEntities.find((e) => e.entityId === previewEntityId)
    ) {
      setPreviewEntityId(filteredEntities[0]?.entityId);
    }
  }, [filteredEntities, previewEntityId]);

  useEffect(() => {
    if (!selectedPresetId) return;
    if (matchingPresets.some((preset) => preset.presetId === selectedPresetId)) return;
    setSelectedPresetId("");
  }, [matchingPresets, selectedPresetId]);

  useEffect(() => {
    if (!workspaceOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "z") return;
      if (event.shiftKey) {
        if (previewDraftFutureRef.current.length === 0) return;
        event.preventDefault();
        redoPreviewPageDraftsRef.current();
        return;
      }
      if (previewDraftPastRef.current.length === 0) return;
      event.preventDefault();
      undoPreviewPageDraftsRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspaceOpen]);

  const activePreviewRenderedPage = useMemo(() => {
    if (!activePage || !previewGenerateJob) return undefined;
    const byIndex = previewGenerateJob.pages[activePageIdx];
    if (byIndex?.pageTemplateId === activePage.pageTemplateId) return byIndex;
    return previewGenerateJob.pages.find(
      (page) => page.pageTemplateId === activePage.pageTemplateId,
    );
  }, [activePage, activePageIdx, previewGenerateJob]);

  const previewEntityPool = useMemo(() => {
    if (activePreviewRenderedPage?.entityPoolIds?.length) {
      const byId = new Map(entities.map((entity) => [entity.entityId, entity]));
      const pool = activePreviewRenderedPage.entityPoolIds
        .map((entityId) => byId.get(entityId))
        .filter((entity): entity is Entity => !!entity);
      if (pool.length > 0) return pool;
    }
    return buildOrderedEntityPool(previewEntityId, filteredEntities);
  }, [
    activePreviewRenderedPage,
    buildOrderedEntityPool,
    entities,
    filteredEntities,
    previewEntityId,
  ]);

  const previewEntity =
    (activePreviewRenderedPage?.entityId
      ? entities.find((e) => e.entityId === activePreviewRenderedPage.entityId)
      : undefined) ?? entities.find((e) => e.entityId === previewEntityId);
  const selectedSlots = useMemo(
    () =>
      selectedSlotIds
        .map((slotId) => effectiveActive?.slots.find((slot) => slot.slotId === slotId))
        .filter((slot): slot is Slot => !!slot),
    [effectiveActive, selectedSlotIds],
  );
  const selectedSlot: Slot | undefined = selectedSlots[selectedSlots.length - 1];
  const getSlotBindMode = useCallback(
    (
      slot: Slot,
      template: PageTemplate | undefined = effectiveActive,
    ): "text" | "image" | null => {
      if (slot.isUploadedBackground) return null;
      if (isDataGroupMarkerSlot(slot)) return null;
      if (isLikelyGeneratePageBackgroundSlot(slot, template)) return null;
      if (slot.kind === "text") return "text";
      if (slot.kind === "image") return "image";
      if (slot.kind === "shape") return slot.staticText?.trim() ? "text" : "image";
      return null;
    },
    [effectiveActive],
  );
  const { previewAllocation } = usePackPreviewAllocation({
    workspaceOpen,
    packPages,
    packOv,
    previewPageDrafts,
    previewEntity,
    previewEntityId,
    filteredEntities,
    buildOrderedEntityPool,
    globalGenerateConfig,
    sourceNeutralPageConfigs,
    stickyPreviewPinsByPageRef,
    activePreviewRenderedPage,
    effectiveActive,
  });
  const previewSlotItems = previewAllocation.items;
  const previewAllocationWarnings = previewAllocation.warnings;
  const selectedBindableSlots = useMemo(() => {
    if (!effectiveActive) return [];

    const addBindable = (slot: Slot | undefined, target: Map<string, Slot>) => {
      if (slot && getSlotBindMode(slot) !== null) target.set(slot.slotId, slot);
    };
    const resolved = new Map<string, Slot>();

    for (const slot of selectedSlots) {
      if (getSlotBindMode(slot) !== null) {
        addBindable(slot, resolved);
      }

      for (const item of effectiveActive.slots) {
        if (item.slotId === slot.slotId) continue;
        const sameDataGroup = slot.dataGroupId && item.dataGroupId === slot.dataGroupId;
        const sameGroup =
          (slot.kind === "group" && item.groupId === slot.slotId) ||
          (slot.groupId && item.groupId === slot.groupId);
        const sameSection =
          slot.kind === "section" &&
          !!slot.sectionRefId &&
          item.sectionRefId === slot.sectionRefId;
        const insideSelectedContainer =
          (slot.kind === "section" || slot.kind === "group") &&
          getSlotBindMode(item) !== null &&
          !item.isUploadedBackground &&
          !isLikelyGeneratePageBackgroundSlot(item, effectiveActive) &&
          !isDataGroupMarkerSlot(item) &&
          isSlotInsideSelectionContainer(slot, item);
        if (sameDataGroup || sameGroup || sameSection || insideSelectedContainer) {
          addBindable(item, resolved);
        }
      }
    }

    return Array.from(resolved.values());
    // getSlotBindMode is a stable helper that reads template + slot; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActive, selectedSlots]);
  const panelPreviewEntity = useMemo(() => {
    if (!effectiveActive || selectedBindableSlots.length === 0) return previewEntity;
    return resolvePreviewEntityForSlot({
      slot: selectedBindableSlots[0],
      template: effectiveActive,
      slotItems: previewSlotItems,
      entities,
      fallbackEntity: previewEntity,
    });
  }, [effectiveActive, selectedBindableSlots, previewSlotItems, entities, previewEntity]);
  const selectedTextSlots = selectedBindableSlots.filter((slot) => getSlotBindMode(slot) === "text");
  const selectedImageSlots = selectedBindableSlots.filter((slot) => getSlotBindMode(slot) === "image");
  const selectedDataGroupIds = Array.from(
    new Set(
      selectedBindableSlots
        .map((slot) => slot.dataGroupId)
        .filter((dataGroupId): dataGroupId is string => !!dataGroupId),
    ),
  );
  const selectedFormatBaseSlot = selectedBindableSlots[selectedBindableSlots.length - 1];
  const relatedFormatTargetSlots =
    effectiveActive && selectedFormatBaseSlot
      ? effectiveActive.slots.filter((slot) => {
          if (getSlotBindMode(slot) === null) return false;
          if (selectedFormatBaseSlot.dataGroupId) {
            return slot.dataGroupId === selectedFormatBaseSlot.dataGroupId;
          }
          if (selectedFormatBaseSlot.groupId)
            return slot.groupId === selectedFormatBaseSlot.groupId;
          return false;
        })
      : [];
  const sortedSelectedTextSlots = useMemo(
    () =>
      selectedTextSlots
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x || a.slotId.localeCompare(b.slotId)),
    [selectedTextSlots],
  );
  const sortedSelectedImageSlots = useMemo(
    () =>
      selectedImageSlots
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x || a.slotId.localeCompare(b.slotId)),
    [selectedImageSlots],
  );
  const textSlotBindingValue = (slot: Slot) =>
    parseEntityListBindingPath(slot.bindingPath)
      ? "__list"
      : getEntityScopedTextBindingBasePath(slot.bindingPath) || "_static";
  const textSlotFieldBindingValue = (slot: Slot) =>
    getEntityScopedTextBindingBasePath(slot.bindingPath) || "_static";
  const slotSourceConfig = (slot: Slot): ResolvedGeneratePageConfig => ({
    ...activeGenerateConfig,
    selectedSheet: slot.dataSourceConfig?.selectedSheet ?? ALL_VALUE,
    filterMoHinh: slot.dataSourceConfig?.filterMoHinh ?? ALL_VALUE,
    filterPhongCach: slot.dataSourceConfig?.filterPhongCach ?? ALL_VALUE,
  });
  const sourceMoHinhOptions = (source: ResolvedGeneratePageConfig) => {
    const set = new Set<string>();
    entities.forEach((entity) => {
      if (entity.status !== "active") return;
      if (source.selectedSheet !== ALL_VALUE && entity.sheetName !== source.selectedSheet) return;
      if (entity.categoryMain) set.add(entity.categoryMain);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  };
  const sourcePhongCachOptions = (source: ResolvedGeneratePageConfig) => {
    const set = new Set<string>();
    entities.forEach((entity) => {
      if (entity.status !== "active") return;
      if (source.selectedSheet !== ALL_VALUE && entity.sheetName !== source.selectedSheet) return;
      if (entity.categorySub) set.add(entity.categorySub);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  };
  const imageSlotBindingValue = (slot: Slot) =>
    isAssetRandomScopeBindingPath(slot.bindingPath)
      ? ASSET_RANDOM_SCOPE_BINDING_VALUE
      : slot.bindingPath === "asset.cover"
        ? "asset.random"
        : (slot.bindingPath ?? "_static");
  const isTextDataSlot = (slot: Slot | undefined) =>
    !!slot &&
    getSlotBindMode(slot) === "text" &&
    (!!slot.bindingPath?.startsWith("entity.") ||
      !!parseEntityListBindingPath(slot.bindingPath) ||
      !!slot.fieldParts?.some((part) => part.kind === "field" && !!part.bindingPath));
  const imageSlotHasLinkedText = (slot: Slot) => {
    if (!effectiveActive) return false;
    const sameDataGroup = slot.dataGroupId
      ? effectiveActive.slots.some(
          (item) => item.slotId !== slot.slotId && item.dataGroupId === slot.dataGroupId && isTextDataSlot(item),
        )
      : false;
    if (sameDataGroup) return true;
    const groupId = slot.groupId;
    if (!groupId) return false;
    return effectiveActive.slots.some(
      (item) => item.slotId !== slot.slotId && item.groupId === groupId && isTextDataSlot(item),
    );
  };
  const imageBindingOptionsForSlot = (slot: Slot) => {
    const hasLinkedText = imageSlotHasLinkedText(slot);
    return IMAGE_BINDING_OPTIONS.filter((option) => {
      const value = option.value || "_static";
      if (isEntityScopedImageBindingPath(value)) return hasLinkedText;
      return true;
    });
  };
  const selectedClusterKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const slot of selectedBindableSlots) {
      if (slot.dataGroupId) keys.add(`dg:${slot.dataGroupId}`);
      else if (slot.groupId) keys.add(`gr:${slot.groupId}`);
    }
    return keys;
  }, [selectedBindableSlots]);
  const clusterSourceSlots = useMemo(() => {
    if (!effectiveActive || selectedBindableSlots.length === 0) return [];
    const visualGroupIds = new Set(
      selectedBindableSlots
        .map((slot) => slot.groupId)
        .filter((groupId): groupId is string => !!groupId),
    );
    if (visualGroupIds.size > 1) return [];
    if (visualGroupIds.size === 0 && selectedClusterKeys.size !== 1) return [];
    return sortSlotsForFormat(
      resolveClusterSourceScopeSlots(
        effectiveActive,
        selectedBindableSlots,
        (slot) => getSlotBindMode(slot) !== null,
      ),
    );
    // getSlotBindMode is a stable helper derived from effectiveActive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActive, selectedBindableSlots, selectedClusterKeys]);
  const clusterSourceSlotIds = useMemo(
    () => new Set(clusterSourceSlots.map((slot) => slot.slotId)),
    [clusterSourceSlots],
  );
  const clusterSourceConfig = useMemo<ResolvedGeneratePageConfig | null>(() => {
    if (clusterSourceSlots.length === 0) return null;
    const merged = resolveSharedClusterSourceDisplay(clusterSourceSlots, ALL_VALUE);
    return {
      ...activeGenerateConfig,
      selectedSheet: merged.selectedSheet ?? ALL_VALUE,
      filterMoHinh: merged.filterMoHinh ?? ALL_VALUE,
      filterPhongCach: merged.filterPhongCach ?? ALL_VALUE,
    };
  }, [activeGenerateConfig, clusterSourceSlots]);
  const shouldShowClusterSourceControls =
    clusterSourceSlots.length > 0 &&
    clusterSourceSlots.some((slot) => {
      const textBindingValue = textSlotFieldBindingValue(slot);
      return textBindingValue !== "_static" || slot.bindingPath === "asset.random";
    });
  const hasMultipleSelectedClusters = selectedClusterKeys.size > 1;
  const textSlotLabel = (slot: Slot, index: number) =>
    buildTextSlotDisplayLabel(slot, index, {
      baseSlot: activeBaseSlotById.get(slot.slotId),
      bindingLabel: slot.bindingPath
        ? TEXT_BINDING_OPTIONS.find(
            (option) => (option.value || "_static") === textSlotBindingValue(slot),
          )?.label
        : undefined,
    });
  const imageSlotLabel = (slot: Slot, index: number) =>
    normalizeSlotDisplayLabel(
      slot.name?.trim() ||
        IMAGE_BINDING_OPTIONS.find((option) => option.value === imageSlotBindingValue(slot))?.label,
      `Ảnh ${index + 1}`,
    );
  const slotFormatLabel = (slot: Slot, index: number) => {
    const mode = getSlotBindMode(slot);
    if (mode === "text") return textSlotLabel(slot, index);
    if (mode === "image") return imageSlotLabel(slot, index);
    return normalizeSlotDisplayLabel(slot.name?.trim(), `Khối ${index + 1}`);
  };
  const slotFormatBindingKey = (slot: Slot) => {
    const mode = getSlotBindMode(slot);
    if (mode === "text") return `text:${textSlotBindingValue(slot)}`;
    if (mode === "image") return `image:${imageSlotBindingValue(slot)}`;
    return "unknown";
  };
  const buildTextBindingPathForSlot = (slot: Slot, fieldPath: string) => {
    return buildEntityScopedTextBindingPath({
      path: fieldPath,
      sheetName: undefined,
    });
  };
  const textBindingOptionsForSlot = useCallback(
    (slot: Slot) => {
      const sourceConfig = slotSourceConfig(slot);
      const sourceEntities = buildSourceFilteredEntities(entities, sourceConfig);
      const currentValue = textSlotFieldBindingValue(slot);

      return TEXT_BINDING_OPTIONS.filter((option) => {
        const value = option.value || "_static";
        if (value === "_static" || value === currentValue) return true;
        const fieldKey = fieldKeyFromBindingPath(value);
        if (!fieldKey) return true;
        return sourceEntities.some((entity) => entityHasTextField(entity, fieldKey));
      });
    },
    // slotSourceConfig is a stable helper derived from other deps already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGenerateConfig, entities],
  );
  const handleSelectSlot = useCallback(
    (
      slotId: string | null,
      mode: "replace" | "toggle" | "group" | "replace-many" = "replace",
      relatedSlotIds: string[] = [],
    ) => {
      if (mode === "replace-many") {
        setSelectedSlotIds(Array.from(new Set(relatedSlotIds)));
        return;
      }
      if (!slotId) {
        setSelectedSlotIds([]);
        return;
      }
      setSelectedSlotIds((prev) => {
        if (mode === "replace") {
          return relatedSlotIds.length > 0 ? Array.from(new Set(relatedSlotIds)) : [slotId];
        }
        if (mode === "toggle") {
          return prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId];
        }
        if (mode === "group") {
          const ids = relatedSlotIds.length > 0 ? relatedSlotIds : [slotId];
          const selectedSet = new Set(prev);
          const allSelected = ids.every((id) => selectedSet.has(id));
          if (allSelected) return prev.filter((id) => !ids.includes(id));
          return Array.from(new Set([...prev, ...ids]));
        }
        return [slotId];
      });
    },
    [],
  );
  const applyBindingToSlots = (
    slots: Slot[],
    pageTemplateId: string,
    bindingPath: string | undefined,
  ) => {
    const writableSlots = slots.filter((slot) => {
      const template =
        pageTemplateId === activePage?.pageTemplateId
          ? effectiveActive
          : packPages.find((page) => page.pageTemplateId === pageTemplateId);
      return getSlotBindMode(slot, template) !== null;
    });
    if (writableSlots.length === 0) return;
    writableSlots.forEach((slot) => setBinding(pageTemplateId, slot.slotId, bindingPath));
    const isAiRewrite = bindingPath === "ai.rewrite";
    commitPreviewPageDrafts((prev) => {
      // Nếu draft chưa tồn tại, tạo từ template gốc
      const baseTpl = pageTemplatesForGenerate.find(
        (t) => t.pageTemplateId === pageTemplateId,
      );
      const current = prev[pageTemplateId] ?? baseTpl;
      if (!current) return prev;
      const targetIds = new Set(writableSlots.map((slot) => slot.slotId));
      const next = createWorkingTemplate(
        current,
        undefined,
        current,
        GENERATE_TEMPLATE_OPTIONS,
      );
      next.slots = next.slots.map((slot) => {
        if (!targetIds.has(slot.slotId)) return slot;
        return {
          ...slot,
          bindingPath: bindingPath || undefined,
          // AI rewrite cần giữ staticText (câu gốc) để viết lại
          staticText: isAiRewrite ? slot.staticText : (bindingPath ? undefined : slot.staticText),
          dataSourceConfig: bindingPath ? slot.dataSourceConfig : undefined,
        };
      });
      next.updatedAt = Date.now();
      return { ...prev, [pageTemplateId]: next };
    }, { history: false });
  };
  const ensureAutoDataGroupForBoundSlots = (boundSlots: Slot[]) => {
    if (!effectiveActive || boundSlots.length === 0) return;
    const groupId = boundSlots[0]?.groupId;
    if (!groupId) return;
    const groupSlots = effectiveActive.slots.filter(
      (item) => item.groupId === groupId && getSlotBindMode(item) !== null,
    );
    if (
      !shouldAutoDataGroupVisualSlots(groupSlots, (item) => getSlotBindMode(item) !== null)
    ) {
      return;
    }
    const existing = groupSlots.find((item) => item.dataGroupId)?.dataGroupId;
    setDataGroupForSlots(groupSlots, existing ?? createDataGroupId());
  };

  const applyTextBindingSelection = (slot: Slot, value: string) => {
    if (!activePage) return;
    if (value === "__list") return;
    let bindingPath: string | undefined;
    if (value === "_static") {
      bindingPath = undefined;
    } else if (value === "ai.rewrite") {
      bindingPath = "ai.rewrite";
    } else {
      bindingPath = buildTextBindingPathForSlot(slot, value);
    }
    applyBindingToSlots([slot], activePage.pageTemplateId, bindingPath);
    if (bindingPath) ensureAutoDataGroupForBoundSlots([slot]);
  };

  const applySlotSourcePatch = (
    slots: Slot[],
    patch: Partial<NonNullable<Slot["dataSourceConfig"]>>,
  ) => {
    if (!activePage) return;
    const pageTemplateId = activePage.pageTemplateId;
    let changed = false;
    let patchedTargetIds = new Set<string>();

    commitPreviewPageDrafts((prev) => {
      const current = resolveWorkingTemplateFromPrev(prev, pageTemplateId, packPages, packOv);
      if (!current) return prev;

      const isBindable = (slot: Slot) => getSlotBindMode(slot, current) !== null;
      const targetIds = new Set(
        resolveClusterSourceScopeSlots(current, slots, isBindable).map((slot) => slot.slotId),
      );
      patchedTargetIds = targetIds;

      current.slots = current.slots.map((slot) => {
        if (!targetIds.has(slot.slotId)) return slot;
        const base = slot.dataSourceConfig ?? {};
        const nextConfig = {
          ...base,
          ...patch,
        };
        if (patch.selectedSheet != null) {
          nextConfig.filterMoHinh = ALL_VALUE;
          nextConfig.filterPhongCach = ALL_VALUE;
        }
        (["selectedSheet", "filterMoHinh", "filterPhongCach"] as const).forEach((key) => {
          if (nextConfig[key] === ALL_VALUE) delete nextConfig[key];
          if (!nextConfig[key]) delete nextConfig[key];
        });
        const normalizedConfig =
          Object.keys(nextConfig).length > 0 ? nextConfig : undefined;
        if (JSON.stringify(slot.dataSourceConfig ?? {}) === JSON.stringify(normalizedConfig ?? {})) {
          return slot;
        }
        changed = true;
        return { ...slot, dataSourceConfig: normalizedConfig };
      });
      if (!changed) return prev;
      current.updatedAt = Date.now();
      return { ...prev, [pageTemplateId]: current };
    });

    if (changed && patchedTargetIds.size > 0) {
      const draftTemplate = previewPageDraftsRef.current[pageTemplateId];
      const working =
        draftTemplate ??
        resolvePageWorkingTemplate(activePage, packOv[pageTemplateId], undefined, GENERATE_TEMPLATE_OPTIONS);
      if (!working) return;

      const orderedEntities = buildOrderedEntityPool(previewEntityId, filteredEntities);
      const targets = buildEntityBindingTargets(working, orderedEntities);
      const slotsById = new Map(working.slots.map((slot) => [slot.slotId, slot]));
      const pagePins =
        stickyPreviewPinsByPageRef.current.get(pageTemplateId) ?? new Map();
      for (const target of targets) {
        if (!target.slotIds.some((slotId) => patchedTargetIds.has(slotId))) continue;
        const clusterSlots = target.slotIds
          .map((slotId) => slotsById.get(slotId))
          .filter((slot): slot is Slot => !!slot);
        if (clusterSlots.length === 0) continue;
        pagePins.delete(resolveBindingGroupKey(clusterSlots, target.targetId));
      }
      stickyPreviewPinsByPageRef.current.set(pageTemplateId, pagePins);
    }
  };
  const setDataGroupForSlots = (slots: Slot[], dataGroupId: string | undefined) => {
    if (!activePage) return;
    const pageTemplateId = activePage.pageTemplateId;
    const targetIds = new Set(slots.map((slot) => slot.slotId));
    let changed = false;
    commitPreviewPageDrafts((prev) => {
      const current = resolveWorkingTemplateFromPrev(prev, pageTemplateId, packPages, packOv);
      if (!current) return prev;
      current.slots = current.slots.map((slot) => {
        if (!targetIds.has(slot.slotId)) return slot;
        if (slot.dataGroupId === dataGroupId) return slot;
        changed = true;
        return { ...slot, dataGroupId };
      });
      if (!changed) return prev;
      current.updatedAt = Date.now();
      return { ...prev, [pageTemplateId]: current };
    });
  };
  const groupSelectedDataSlots = () => {
    if (selectedBindableSlots.length < 2) {
      toast.error("Chọn ít nhất 2 khối để nhóm dữ liệu");
      return;
    }
    const dataGroupId = createDataGroupId();
    setDataGroupForSlots(selectedBindableSlots, dataGroupId);
    toast.success(`Đã nhóm ${selectedBindableSlots.length} khối dữ liệu`);
  };
  const clearSelectedDataGroups = () => {
    const groupedSlots = selectedBindableSlots.filter((slot) => slot.dataGroupId);
    if (groupedSlots.length === 0) {
      toast.error("Các khối đang chọn chưa có nhóm dữ liệu");
      return;
    }
    setDataGroupForSlots(groupedSlots, undefined);
    toast.success("Đã bỏ nhóm dữ liệu");
  };
  const copySelectedSlotFormat = () => {
    if (!activePage || !effectiveActive) return;
    const pageLabel = activePage.name?.trim() || `Trang ${activePageIdx + 1}`;
    const result = buildSlotFormatClipboard({
      template: effectiveActive,
      selectedSlots: selectedBindableSlots,
      pageTemplateId: activePage.pageTemplateId,
      pageLabel,
      isBindable: (slot) => getSlotBindMode(slot) !== null,
      getBindMode: (slot) => {
        const mode = getSlotBindMode(slot);
        return mode === "text" || mode === "image" ? mode : null;
      },
      getBindingKey: slotFormatBindingKey,
      getSlotLabel: slotFormatLabel,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setFormatClipboard(result.clipboard);
    toast.success(`Đã sao chép liên kết dữ liệu · ${pageLabel}`);
  };
  const clusterPasteTargets = useMemo(() => {
    if (!effectiveActive || !formatClipboard?.sourceVisualGroupId) return [];
    return resolveClusterPasteTargets(
      effectiveActive,
      formatClipboard,
      (slot) => getSlotBindMode(slot) !== null,
    );
    // getSlotBindMode is a stable helper derived from effectiveActive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveActive, formatClipboard]);
  const applyCopiedSlotFormat = (targets: Slot[], scopeLabel: string) => {
    if (!activePage || !effectiveActive) return;
    if (!formatClipboard) {
      toast.error("Chưa sao chép liên kết dữ liệu");
      return;
    }
    if (targets.length === 0) {
      toast.error("Chọn khối cần dán liên kết dữ liệu");
      return;
    }

    const assignments = buildFormatAssignments(
      formatClipboard,
      targets,
      (slot) => {
        const mode = getSlotBindMode(slot);
        return mode === "text" || mode === "image" ? mode : null;
      },
      slotFormatBindingKey,
    );
    if (assignments.size === 0) {
      toast.error("Không có khối cùng loại để dán liên kết dữ liệu");
      return;
    }

    let changed = false;

    commitPreviewPageDrafts((prev) => {
      const current = resolveWorkingTemplateFromPrev(
        prev,
        activePage.pageTemplateId,
        packPages,
        packOv,
      );
      if (!current) return prev;
      const applied = applyFormatAssignmentsToSlots(current.slots, assignments);
      changed = applied.changed;
      if (!changed) return prev;
      current.slots = applied.slots;
      current.updatedAt = Date.now();
      return { ...prev, [activePage.pageTemplateId]: current };
    });
    if (!changed) {
      toast.info("Các khối đang chọn đã có cùng liên kết dữ liệu đã sao chép");
      return;
    }
    toast.success(`Đã dán liên kết dữ liệu cho ${assignments.size} khối ${scopeLabel}`, {
      action: {
        label: "Hoàn tác",
        onClick: undoPreviewPageDrafts,
      },
    });
  };
  const pasteToMatchingClusterOnPage = () => {
    if (!formatClipboard?.sourceVisualGroupId) {
      toast.error("Bản sao chép không gắn với cụm layout — hãy sao chép từ khối thuộc Gr1/Gr2");
      return;
    }
    if (clusterPasteTargets.length === 0) {
      toast.error("Trang này không có cụm layout tương ứng với bản sao chép");
      return;
    }
    applyCopiedSlotFormat(clusterPasteTargets, "cùng cụm trang này");
  };
  const clearBindingsForSlots = (slots: Slot[], pageTemplateId: string) => {
    slots.forEach((slot) => clearBinding(pageTemplateId, slot.slotId));
    commitPreviewPageDrafts((prev) => {
      const current = prev[pageTemplateId];
      if (!current) return prev;
      const next = createWorkingTemplate(
        current,
        undefined,
        current,
        GENERATE_TEMPLATE_OPTIONS,
      );
      next.slots = next.slots.map((slot) => {
        if (!slots.some((target) => target.slotId === slot.slotId)) return slot;
        return { ...slot, bindingPath: undefined, dataSourceConfig: undefined };
      });
      next.updatedAt = Date.now();
      return { ...prev, [pageTemplateId]: next };
    }, { history: false });
  };
  const randomImageFolderOptionsForSheet = (sheetName: string) => {
    const entityIds = new Set<string>();
    const values = new Set<string>();
    for (const entity of entities) {
      if (entity.status !== "active") continue;
      if (sheetName !== ALL_VALUE && entity.sheetName !== sheetName) continue;
      entityIds.add(entity.entityId);
      [entity.categoryMain, entity.categorySub, entity.style].forEach((value) => {
        if (value?.trim()) values.add(value.trim());
      });
      for (const key of ["folder", "Folder", "Thu_muc", "Thư mục", "Nhom_anh", "Nhóm ảnh"]) {
        const value = entity.metadata?.[key];
        if (typeof value === "string" && value.trim()) values.add(value.trim());
        if (typeof value === "number") values.add(String(value));
      }
    }
    for (const asset of assets) {
      if (entityIds.has(asset.entityId) && asset.role) values.add(asset.role);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "vi"));
  };
  const applyImageBindingSelection = (slot: Slot, value: string) => {
    if (!activePage) return;
    const sourceConfig = slotSourceConfig(slot);
    const bindingPath =
      value === "_static"
        ? undefined
        : value === ASSET_RANDOM_SCOPE_BINDING_VALUE
          ? buildAssetRandomScopeBindingPath({
              sheetName: sourceConfig.selectedSheet,
              folder: ALL_VALUE,
            })
          : value;
    applyBindingToSlots([slot], activePage.pageTemplateId, bindingPath);
    if (bindingPath) ensureAutoDataGroupForBoundSlots([slot]);
  };
  const applyRandomImageScope = (slot: Slot, patch: { sheetName?: string; folder?: string }) => {
    if (!activePage) return;
    const current = parseAssetRandomScopeBindingPath(slot.bindingPath);
    const sourceConfig = slotSourceConfig(slot);
    const next = {
      sheetName: patch.sheetName ?? current?.sheetName ?? sourceConfig.selectedSheet,
      folder: patch.folder ?? current?.folder ?? ALL_VALUE,
    };
    applyBindingToSlots([slot], activePage.pageTemplateId, buildAssetRandomScopeBindingPath(next));
  };
  const renderSourceControls = (
    slots: Slot[],
    sourceConfig: ResolvedGeneratePageConfig,
    options?: { title?: string; description?: string },
  ) => {
    const moOptions = sourceMoHinhOptions(sourceConfig);
    const phongOptions = sourcePhongCachOptions(sourceConfig);
    return (
      <div className="grid gap-2 rounded-md border bg-background/70 p-2">
        {options?.title && (
          <div className="text-xs font-medium">{options.title}</div>
        )}
        {options?.description && (
          <div className="text-[11px] leading-snug text-muted-foreground">
            {options.description}
          </div>
        )}
        <div>
          <Label className="text-xs">Sheet</Label>
          <Select
            value={sourceConfig.selectedSheet}
            onValueChange={(sheetName) => applySlotSourcePatch(slots, { selectedSheet: sheetName })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Tất cả</SelectItem>
              {sheetOptions.map((sheet) => (
                <SelectItem key={sheet} value={sheet}>
                  {sheet}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Mô hình</Label>
          <Select
            value={sourceConfig.filterMoHinh}
            onValueChange={(value) => applySlotSourcePatch(slots, { filterMoHinh: value })}
            disabled={moOptions.length === 0}
          >
            <SelectTrigger className="h-8" disabled={moOptions.length === 0}>
              <SelectValue placeholder="Không có mô hình" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Tất cả</SelectItem>
              {moOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Phong cách</Label>
          <Select
            value={sourceConfig.filterPhongCach}
            onValueChange={(value) => applySlotSourcePatch(slots, { filterPhongCach: value })}
            disabled={phongOptions.length === 0}
          >
            <SelectTrigger className="h-8" disabled={phongOptions.length === 0}>
              <SelectValue placeholder="Không có phong cách" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Tất cả</SelectItem>
              {phongOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };
  const { totalBound, pageReadinessRows, generateReadiness } = useGeneratePageReadiness({
    selectedPack,
    packPages,
    packOv,
    previewPageDrafts,
    globalGenerateConfig,
    sourceNeutralPageConfigs,
    entities,
    generationBaseEntities,
    filteredEntities,
    estimateGeneratedPageCount,
    getSlotBindMode,
  });
  const selectedSlotStatusLabel = (slot: Slot) => {
    if (!slot.bindingPath) return "Tĩnh";
    const listConfig = parseEntityListBindingPath(slot.bindingPath);
    if (listConfig) return "Danh sách";
    const textValue = textSlotFieldBindingValue(slot);
    if (textValue !== "_static") {
      return (
        TEXT_BINDING_OPTIONS.find((option) => (option.value || "_static") === textValue)?.label ??
        "Dữ liệu"
      );
    }
    const imageValue = imageSlotBindingValue(slot);
    if (imageValue !== "_static") return imageBindingOptionLabel(imageValue);
    return "Tĩnh";
  };

  const textListFieldOptions = useMemo<TextListFieldOption[]>(() => {
    const truncate = (value: unknown, max = 28) => {
      if (value == null) return "";
      const text = String(value).trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    };

    // Nguồn chính: fieldRegistry. Lọc theo trường có data thực trong sheet
    // (preview + filteredEntities) và đính kèm sample từ entity đầu có data.
    const sampleSource = panelPreviewEntity
      ? [panelPreviewEntity, ...filteredEntities]
      : filteredEntities;
    const baseOptions = entityFieldOptionsForUi(sampleSource).map<TextListFieldOption>(
      (option) => ({
        path: option.path,
        label: option.label,
        sample: option.sample,
      }),
    );
    const seen = new Set(baseOptions.map((option) => option.path));
    const options = [...baseOptions];

    // Append các metadata key tự do (day, timeSlot, direction... mà không có
    // trong fieldRegistry).
    const metadataKeys = new Set<string>();
    filteredEntities.forEach((entity) => {
      Object.entries(entity.metadata ?? {}).forEach(([key, value]) => {
        if (value != null && value !== "") metadataKeys.add(key);
      });
    });

    Array.from(metadataKeys)
      .sort((a, b) => a.localeCompare(b, "vi"))
      .forEach((key) => {
        const path = `entity.metadata.${key}`;
        if (seen.has(path)) return;
        const sampleEntity =
          panelPreviewEntity && panelPreviewEntity.metadata?.[key]
            ? panelPreviewEntity
            : filteredEntities.find((entity) => entity.metadata?.[key]);
        options.push({
          path,
          label: key,
          sample: truncate(sampleEntity?.metadata?.[key]),
        });
      });

    return options.length ? options : [{ path: "entity.name", label: "Tên quán" }];
  }, [filteredEntities, panelPreviewEntity]);

  const selectedPreset = matchingPresets.find((preset) => preset.presetId === selectedPresetId);
  const getPresetPackPages = (preset: GenerateBindingPreset) => {
    const pack = packs.find((item) => item.packTemplateId === preset.packTemplateId);
    const pageIds = pack?.orderedPages ?? preset.pageTemplateIds ?? [];
    const pageMap = new Map(tpls.map((tpl) => [tpl.pageTemplateId, tpl]));
    return {
      pack,
      pages: pageIds.map((id) => pageMap.get(id)).filter((page): page is PageTemplate => !!page),
    };
  };

  /** Thumbnail trước khi mở workspace — pack-order giống canvas workspace. */
  const presetCardPreviewContexts = useMemo(() => {
    if (workspaceOpen) return new Map<string, PresetCardPagePreviewContext>();
    const map = new Map<string, PresetCardPagePreviewContext>();

    const resolvePresetStoredTemplate = (
      preset: GenerateBindingPreset,
      page: PageTemplate,
    ) => {
      const previewTemplateRaw = resolvePageWorkingTemplate(
        page,
        preset.bindOverrides?.[page.pageTemplateId],
        preset.pageTemplateDrafts?.[page.pageTemplateId],
        GENERATE_TEMPLATE_OPTIONS,
      );
      if (!previewTemplateRaw) return undefined;
      const pageGroupSources = preset.generateConfig.groupSourceConfigs?.[page.pageTemplateId];
      if (!pageGroupSources || Object.keys(pageGroupSources).length === 0) {
        return previewTemplateRaw;
      }
      return applyGroupSourceConfigsToTemplate(
        previewTemplateRaw,
        pageGroupSources,
        (slot) => getSlotBindMode(slot, previewTemplateRaw) !== null,
      );
    };

    for (const preset of matchingPresets ?? []) {
      const { pages } = getPresetPackPages(preset);
      if (pages.length === 0) continue;

      const cfg = preset.generateConfig ?? {};
      const presetGlobalConfig = resolveGeneratePageConfig(globalGenerateConfig, {
        selectedSheet: ALL_VALUE,
        filterMoHinh: ALL_VALUE,
        filterPhongCach: ALL_VALUE,
        prioritizePartner: cfg.prioritizePartner,
        onlyPartner: cfg.onlyPartner,
        partnerQuotaPerPage: cfg.partnerQuotaPerPage,
        maxEntities: cfg.maxEntities,
      });
      const source = buildSourceFilteredEntities(entities, presetGlobalConfig);
      const configuredPool = buildConfiguredEntityPool(source, presetGlobalConfig);
      const pool = configuredPool.length > 0 ? configuredPool : filteredEntities;
      const previewEntity = pool[0];
      const orderedEntities = previewEntity
        ? buildOrderedEntityPool(previewEntity.entityId, pool)
        : pool;

      const perPage = buildPresetCardPreviewContexts({
        packPages: pages,
        resolveStoredTemplate: (page) => resolvePresetStoredTemplate(preset, page),
        orderedEntities,
        previewEntity,
        resolvePageConfig: (page) => {
          const pageCfg = resolveGeneratePageConfig(presetGlobalConfig, {
            ...cfg.pageConfigs?.[page.pageTemplateId],
            selectedSheet: ALL_VALUE,
            filterMoHinh: ALL_VALUE,
            filterPhongCach: ALL_VALUE,
          });
          return {
            partnerQuota: pageCfg.partnerQuotaPerPage,
            prioritizePartner: pageCfg.prioritizePartner,
          };
        },
      });

      for (const page of pages) {
        const context = perPage.get(page.pageTemplateId);
        if (context) {
          map.set(`${preset.presetId}:${page.pageTemplateId}`, context);
        }
      }
    }
    return map;
  }, [
    matchingPresets,
    packs,
    tpls,
    entities,
    filteredEntities,
    globalGenerateConfig,
    buildOrderedEntityPool,
    matchingPresets?.map((item) => `${item.presetId}:${item.updatedAt}`).join("|"),
    workspaceOpen,
  ]);

  const exportPreset = async (preset: GenerateBindingPreset) => {
    const { pack, pages } = getPresetPackPages(preset);
    const bundle = buildGeneratePresetBundle(preset, pack, pages);
    const saved = await exportPresetJsonToDataServer({
      data: {
        fileName: `${safePortableFileName(formatTemplateDisplayName(preset.name, "khuon"))}-generate-preset.json`,
        payload: bundle,
      },
    });
    toast.success(`Đã lưu bộ khuôn vào ${saved.relativePath}`);
  };

  const buildCurrentPresetPayload = (
    name: string,
    presetId = nanoid(),
    createdAt = Date.now(),
  ): GenerateBindingPreset => {
    const bindOverrides: GenerateBindingPreset["bindOverrides"] = {};
    packPages.forEach((page) => {
      const pageOverrides = packOv[page.pageTemplateId];
      if (pageOverrides && Object.keys(pageOverrides).length > 0) {
        bindOverrides[page.pageTemplateId] = { ...pageOverrides };
      }
    });
    const allowedPageIds = new Set(packPages.map((page) => page.pageTemplateId));
    const savedPageConfigs = Object.fromEntries(
      Object.entries(sourceNeutralPageConfigs).filter(([pageTemplateId]) =>
        allowedPageIds.has(pageTemplateId),
      ),
    );
    const hydratedDrafts = cloneTemplateDraftsWithSource(previewPageDraftsRef.current, packPages);
    const pageTemplateDrafts = Object.fromEntries(
      Object.entries(hydratedDrafts)
        .filter(([pageTemplateId]) => allowedPageIds.has(pageTemplateId))
        .map(([pageTemplateId, template]) => [pageTemplateId, clonePageTemplate(template)]),
    );
    const groupSourceConfigs = Object.fromEntries(
      Object.entries(pageTemplateDrafts)
        .map(([pageTemplateId, template]) => [
          pageTemplateId,
          extractGroupSourceConfigs(template, (slot) => getSlotBindMode(slot, template) !== null),
        ])
        .filter(([, configs]) => Object.keys(configs).length > 0),
    );

    return {
      presetId,
      name: name.trim() || "Khuôn tạo nội dung",
      mode: "pack",
      packTemplateId: selectedPack?.packTemplateId,
      packTemplateNameSnapshot: selectedPack?.name,
      pageTemplateIds: packPages.map((page) => page.pageTemplateId),
      bindOverrides,
      pageTemplateDrafts:
        Object.keys(pageTemplateDrafts).length > 0 ? pageTemplateDrafts : undefined,
      generateConfig: {
        selectedSheet: ALL_VALUE,
        filterMoHinh: ALL_VALUE,
        filterPhongCach: ALL_VALUE,
        prioritizePartner,
        onlyPartner,
        partnerQuotaPerPage,
        maxEntities,
        batchCount: maxEntities,
        varyFontsFromSecondBundle,
        pageConfigs: savedPageConfigs,
        groupSourceConfigs:
          Object.keys(groupSourceConfigs).length > 0 ? groupSourceConfigs : undefined,
      },
      createdAt,
      updatedAt: Date.now(),
      version: 1,
    };
  };

  useEffect(() => {
    buildCurrentPresetPayloadRef.current = buildCurrentPresetPayload;
  });

  const mergePresetGroupSourcesIntoDrafts = (
    preset: GenerateBindingPreset,
    drafts: PreviewPageDrafts,
  ): PreviewPageDrafts => {
    const groupSourceConfigs = preset.generateConfig.groupSourceConfigs;
    if (!groupSourceConfigs || Object.keys(groupSourceConfigs).length === 0) return drafts;
    const next: PreviewPageDrafts = { ...drafts };
    let changed = false;
    for (const page of packPages) {
      const pageId = page.pageTemplateId;
      const pageGroups = groupSourceConfigs[pageId];
      if (!pageGroups) continue;
      const working =
        next[pageId] ??
        resolvePageWorkingTemplate(
          page,
          preset.bindOverrides?.[pageId],
          undefined,
          GENERATE_TEMPLATE_OPTIONS,
        );
      if (!working) continue;
      const hydrated = applyGroupSourceConfigsToTemplate(
        working,
        pageGroups,
        (slot) => getSlotBindMode(slot, working) !== null,
      );
      if (hydrated !== working) {
        next[pageId] = hydrated;
        changed = true;
      }
    }
    return changed ? next : drafts;
  };

  const flushPresetSave = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!selectedPreset || !selectedPack) return;
      if (presetAutosaveTimer.current !== null) {
        window.clearTimeout(presetAutosaveTimer.current);
        presetAutosaveTimer.current = null;
      }
      const build = buildCurrentPresetPayloadRef.current;
      if (!build) return;
      const preset = build(
        selectedPreset.name,
        selectedPreset.presetId,
        selectedPreset.createdAt,
      );

      const saveOnce = async () => {
        await db.generatePresets.put(preset);
        presetAutosaveErrorRef.current = false;
      };

      const runSave = async () => {
        try {
          await saveOnce();
        } catch (error) {
          if (!isRetryablePresetSaveError(error)) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 800));
          await saveOnce();
        }
      };

      const pending = presetSaveInFlightRef.current
        ? presetSaveInFlightRef.current.catch(() => undefined).then(runSave)
        : runSave();
      presetSaveInFlightRef.current = pending.catch(() => undefined);
      await pending;
      if (!options?.silent) toast.success("Đã lưu khuôn");
    },
    [selectedPreset, selectedPack],
  );

  const closeWorkspace = useCallback(async () => {
    if (selectedPreset) {
      lastClosedPresetIdRef.current = selectedPreset.presetId;
      try {
        await flushPresetSave({ silent: true });
      } catch (error) {
        toast.error("Không thể lưu khuôn: " + formatPresetSaveError(error));
      }
    } else {
      lastClosedPresetIdRef.current = "";
    }
    setWorkspaceOpen(false);
  }, [selectedPreset, flushPresetSave]);

  const applyPreset = (preset: GenerateBindingPreset) => {
    const cfg = preset.generateConfig;
    if (preset.packTemplateId && preset.packTemplateId !== packId) {
      setPackId(preset.packTemplateId);
    }
    if (cfg.prioritizePartner != null) setPrioritizePartner(cfg.prioritizePartner);
    if (cfg.onlyPartner != null) setOnlyPartner(cfg.onlyPartner);
    if (cfg.partnerQuotaPerPage != null) {
      setPartnerQuotaPerPage(Math.max(1, cfg.partnerQuotaPerPage));
    }
    if (cfg.batchCount != null) setMaxEntities(cfg.batchCount);
    else if (cfg.maxEntities != null) setMaxEntities(cfg.maxEntities);
    if (cfg.varyFontsFromSecondBundle != null) {
      setVaryFontsFromSecondBundle(cfg.varyFontsFromSecondBundle);
    }
    setPageConfigs(cfg.pageConfigs ?? {});

    const templateMap = new Map(tpls.map((tpl) => [tpl.pageTemplateId, tpl]));
    const nextOverrides: GenerateBindingPreset["bindOverrides"] = {};
    let missing = 0;
    Object.entries(preset.bindOverrides ?? {}).forEach(([pageId, overrides]) => {
      const page = templateMap.get(pageId);
      if (!page) {
        missing += Object.keys(overrides ?? {}).length || 1;
        return;
      }
      const slotIds = new Set(page.slots.map((slot) => slot.slotId));
      Object.entries(overrides ?? {}).forEach(([slotId, bindingPath]) => {
        if (!slotIds.has(slotId)) {
          missing += 1;
          return;
        }
        nextOverrides[pageId] ??= {};
        nextOverrides[pageId][slotId] = bindingPath;
      });
    });

    replaceAll(nextOverrides);
    stickyPreviewPinsByPageRef.current = new Map();
    // Auto-bind các slot có placeholder "{{name_0}}", "{{address_0}}", v.v.
    // Quan trọng cho template AI dựng (templateFromImage) — slot text có
    // staticText là token nhưng không có bindingPath, nếu không auto-bind
    // thì mọi page sẽ render giống nhau, chỉ slot user click chọn mới đổi
    // theo entity (bug "trùng dữ liệu, chỉ tên đối tác đổi").
    const seedDrafts = preset.pageTemplateDrafts ?? {};
    const { drafts: hydratedDrafts, totalChanged } =
      autoBindPlaceholdersForDrafts(seedDrafts);
    const withGroupSources = mergePresetGroupSourcesIntoDrafts(preset, hydratedDrafts);
    replacePreviewPageDrafts(withGroupSources, { history: false });
    setSelectedSlotIds([]);
    setActivePageIdx(0);
    const baseMessage = "Đã áp khuôn" + (missing ? `, bỏ qua ${missing} khối thiếu` : "");
    if (totalChanged > 0) {
      toast.success(`${baseMessage} · tự liên kết ${totalChanged} khối từ mẫu`);
    } else {
      toast.success(baseMessage);
    }
  };

  const openPresetWorkspace = (preset: GenerateBindingPreset, pageIdx = 0) => {
    const freshPreset =
      matchingPresets?.find((item) => item.presetId === preset.presetId) ?? preset;
    const resume = canResumePresetWorkspace({
      presetId: freshPreset.presetId,
      selectedPresetId,
      lastClosedPresetId: lastClosedPresetIdRef.current,
      drafts: previewPageDraftsRef.current,
      packOverrides: packOv,
    });
    setSelectedPresetId(freshPreset.presetId);
    if (resume) {
      const merged = mergePresetGroupSourcesIntoDrafts(
        freshPreset,
        previewPageDraftsRef.current,
      );
      if (merged !== previewPageDraftsRef.current) {
        replacePreviewPageDrafts(merged, { history: false });
      }
      setActivePageIdx(pageIdx);
      setWorkspaceOpen(true);
      return;
    }
    lastClosedPresetIdRef.current = "";
    applyPreset(freshPreset);
    setActivePageIdx(pageIdx);
    setWorkspaceOpen(true);
  };

  const createPresetAndOpen = async () => {
    if (!selectedPack) return toast.error("Chưa chọn bộ mẫu");
    const preset = buildCurrentPresetPayload(selectedPack.name);
    await db.generatePresets.put(preset);
    setSelectedPresetId(preset.presetId);
    setWorkspaceOpen(true);
    // Tạo preset từ pack chưa có draft -> chạy auto-bind trên page của pack ngay
    // để slot có placeholder "{{name_0}}" được set bindingPath. Không có bước này
    // thì user mở workspace lần đầu, mọi page render giống nhau (bug "trùng dữ liệu").
    const seedDrafts: Record<string, PageTemplate> = {};
    for (const tpl of packPages) {
      seedDrafts[tpl.pageTemplateId] = tpl;
    }
    const { drafts: hydratedDrafts, totalChanged } =
      autoBindPlaceholdersForDrafts(seedDrafts);
    if (totalChanged > 0) {
      // Chỉ commit các page thực sự thay đổi (autoBindPlaceholdersForDrafts giữ
      // reference cũ với page không đổi; PreviewPageDrafts chứa cả ID không đổi
      // cũng không sao vì restoreTemplateGroups sẽ no-op).
      replacePreviewPageDrafts(hydratedDrafts, { history: false });
      toast.success(`Đã tạo khuôn · tự liên kết ${totalChanged} khối từ mẫu`);
    } else {
      toast.success("Đã tạo khuôn");
    }
  };

  const handlePresetImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const bundle = await readPortableBundleFile(file);
      const result = await importPortableBundle(bundle);
      if (result.presets[0]) {
        setSelectedPresetId(result.presets[0].presetId);
        if (result.presets[0].packTemplateId) setPackId(result.presets[0].packTemplateId);
      }
      toast.success(
        `Đã nhập ${result.packs.length} bộ mẫu, ${result.pages.length} trang, ${result.presets.length} khuôn`,
      );
    } catch (error) {
      toast.error("Không thể nhập: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  useEffect(() => {
    if (!workspaceOpen || !selectedPreset || !selectedPack) return;
    if (presetAutosaveTimer.current !== null) {
      window.clearTimeout(presetAutosaveTimer.current);
    }

    presetAutosaveTimer.current = window.setTimeout(() => {
      void flushPresetSave({ silent: true }).catch((error) => {
        if (presetAutosaveErrorRef.current) return;
        presetAutosaveErrorRef.current = true;
        toast.error("Không thể tự lưu khuôn: " + formatPresetSaveError(error));
      });
      presetAutosaveTimer.current = null;
    }, 500);

    return () => {
      if (presetAutosaveTimer.current !== null) {
        window.clearTimeout(presetAutosaveTimer.current);
        presetAutosaveTimer.current = null;
      }
    };
  }, [
    workspaceOpen,
    selectedPreset?.presetId,
    selectedPreset?.name,
    selectedPreset?.createdAt,
    selectedPack?.packTemplateId,
    selectedPack?.name,
    packPages,
    packOv,
    previewPageDrafts,
    prioritizePartner,
    onlyPartner,
    partnerQuotaPerPage,
    maxEntities,
    pageConfigs,
    varyFontsFromSecondBundle,
    selectedPreset,
    selectedPack,
    flushPresetSave,
  ]);

  const runAiCaption = async () => {
    if (!activePage || !selectedSlot || selectedSlot.kind !== "text") return;
    if (!previewEntity) return toast.error("Chọn dữ liệu xem trước trước");
    setCaptionBusy(true);
    try {
      const out = await aiCaptionFromEntity({
        entity: previewEntity as unknown as Record<string, unknown>,
        style: "instagram",
      });
      if (!out.ok) return toast.error(out.error);
      setBinding(activePage.pageTemplateId, selectedSlot.slotId, undefined);
      commitPreviewPageDrafts((prev) => {
        const working = createWorkingTemplate(
          activePage,
          packOv[activePage.pageTemplateId],
          prev[activePage.pageTemplateId],
          GENERATE_TEMPLATE_OPTIONS,
        );
        working.slots = working.slots.map((slot) =>
          slot.slotId === selectedSlot.slotId
            ? { ...slot, bindingPath: undefined, staticText: out.caption }
            : slot,
        );
        working.updatedAt = Date.now();
        return { ...prev, [activePage.pageTemplateId]: working };
      });
      toast.success("Đã viết chú thích");
    } catch (error) {
      toast.error("AI lỗi: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setCaptionBusy(false);
    }
  };

  const getRewriteCurrentText = (slot: Slot) => {
    const clusterEntity =
      effectiveActive && previewSlotItems.length > 0
        ? resolvePreviewEntityForSlot({
            slot,
            template: effectiveActive,
            slotItems: previewSlotItems,
            entities,
            fallbackEntity: previewEntity,
          })
        : previewEntity;
    return (
      (slot.staticText ?? "").trim() ||
      (slot.bindingPath
        ? resolveTextBinding(slot.bindingPath, clusterEntity, "", previewEntityPool, {
            entities,
            seed: `${activePage?.pageTemplateId ?? "preview"}:${slot.slotId}:rewrite`,
          }).trim()
        : "")
    );
  };

  const runAiRewriteSelectedText = async (sourceText?: string) => {
    if (!activePage || selectedTextSlots.length !== 1) return;
    const slot = selectedTextSlots[0];
    const currentText = getRewriteCurrentText(slot);
    const source = (sourceText ?? "").trim() || currentText;
    if (!source) return toast.error("Khung chữ đang trống, chưa có nội dung để AI viết lại");

    setRewriteBusy(true);
    try {
      const out = await aiRewriteTextPreserveMeaning({
        text: source,
        toneHint: "tự nhiên, gần với văn phong review/travel social post",
        avoidText: currentText && currentText !== source ? currentText : undefined,
        variationSeed: `${slot.slotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      if (!out.ok) return toast.error(out.error);
      setBinding(activePage.pageTemplateId, slot.slotId, undefined);
      commitPreviewPageDrafts((prev) => {
        const working = createWorkingTemplate(
          activePage,
          packOv[activePage.pageTemplateId],
          prev[activePage.pageTemplateId],
          GENERATE_TEMPLATE_OPTIONS,
        );
        working.slots = working.slots.map((item) =>
          item.slotId === slot.slotId
            ? { ...item, bindingPath: undefined, staticText: out.text }
            : item,
        );
        working.updatedAt = Date.now();
        return { ...prev, [activePage.pageTemplateId]: working };
      });
      toast.success("AI đã viết lại khung chữ");
    } catch (error) {
      toast.error("AI lỗi: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setRewriteBusy(false);
    }
  };

  const onGenerate = async () => {
    if (!selectedPack) return toast.error("Chưa chọn bộ mẫu");
    if (!generateReadiness.canGenerate) {
      return toast.error(generateReadiness.reason);
    }
    let job = generatePackJob({
      pack: selectedPack,
      pageTemplates: pageTemplatesForGenerate,
      entities,
      assets,
      mode: "one-entity-per-pack",
      entityPool: generationBaseEntities,
      bindOverrides: packOv,
      partnerQuotaPerPage: globalGenerateConfig.partnerQuotaPerPage,
      prioritizePartner,
      onlyPartner,
      batchCount: maxEntities,
      selectedSheet: globalGenerateConfig.selectedSheet,
      filterMoHinh: globalGenerateConfig.filterMoHinh,
      filterPhongCach: globalGenerateConfig.filterPhongCach,
      pageConfigs: sourceNeutralPageConfigs,
    });
    if (job.pages.length === 0) {
      toast.error("Không có trang nào được tạo. Kiểm tra cấu hình dữ liệu từng khối.");
      return;
    }
    if (Object.keys(previewPageDrafts).length > 0) {
      job.pages = job.pages.map((page) => ({
        ...page,
        workingTemplate: previewPageDrafts[page.pageTemplateId]
          ? createWorkingTemplate(
              pageTemplatesForGenerate.find(
                (template) => template.pageTemplateId === page.pageTemplateId,
              ) ?? previewPageDrafts[page.pageTemplateId],
              undefined,
              previewPageDrafts[page.pageTemplateId],
              GENERATE_TEMPLATE_OPTIONS,
            )
          : page.workingTemplate,
      }));
    }
    if (varyFontsFromSecondBundle) {
      job = applyFontVariationToGeneratedJob(job, selectedPack, pageTemplatesForGenerate);
    }

    // AI rewrite: tìm slots có binding "ai.rewrite" và tạo variations
    // Scan từ workingTemplate (đã merge drafts) thay vì pageTemplatesForGenerate gốc
    const isAiRewriteSlot = (slot: { bindingPath?: string; staticText?: string }) =>
      slot.bindingPath === "ai.rewrite" || slot.bindingPath === "entity.metadata.ai.rewrite";
    const aiRewriteSlots = job.pages.flatMap((page) => {
      const tpl = page.workingTemplate ?? pageTemplatesForGenerate.find(
        (t) => t.pageTemplateId === page.pageTemplateId,
      );
      if (!tpl) return [];
      // Template gốc để fallback lấy staticText
      const baseTpl = pageTemplatesForGenerate.find(
        (t) => t.pageTemplateId === page.pageTemplateId,
      );
      return tpl.slots
        .filter((slot) => isAiRewriteSlot(slot))
        .map((slot) => {
          // Lấy staticText từ slot hiện tại, fallback về template gốc
          const text = slot.staticText?.trim()
            || baseTpl?.slots.find((s) => s.slotId === slot.slotId)?.staticText?.trim()
            || "";
          return { pageTemplateId: tpl.pageTemplateId, slotId: slot.slotId, text };
        })
        .filter((item) => item.text.length > 0);
    });
    // Deduplicate by slotId+text
    const uniqueAiSlots = Array.from(
      new Map(aiRewriteSlots.map((s) => [`${s.slotId}:${s.text}`, s])).values(),
    );
    if (import.meta.env.DEV) {
      console.debug("[AI Rewrite] found slots:", aiRewriteSlots.length, "unique:", uniqueAiSlots.length);
      if (uniqueAiSlots.length > 0) {
        console.debug("[AI Rewrite] texts:", uniqueAiSlots.map((s) => s.text));
      } else {
        // Debug: check tất cả slots trong job pages
        const allBindings = job.pages.flatMap((p) => {
          const t = p.workingTemplate;
          if (!t) return [];
          return t.slots.map((s) => ({ slotId: s.slotId, bindingPath: s.bindingPath, staticText: s.staticText?.slice(0, 30) }));
        });
        console.debug("[AI Rewrite] all slot bindings:", allBindings.filter((s) => s.bindingPath));
      }
    }
    if (uniqueAiSlots.length > 0) {
      toast.info(`Đang gọi AI viết lại ${uniqueAiSlots.length} text...`);
      const bundleSize = Math.max(1, selectedPack.orderedPages.length);
      const bundleCount = Math.ceil(job.pages.length / bundleSize);
      // Group by unique text to avoid duplicate AI calls
      const uniqueTexts = Array.from(new Set(uniqueAiSlots.map((s) => s.text)));
      const variationsMap = new Map<string, string[]>();
      for (const text of uniqueTexts) {
        let timerId: ReturnType<typeof setTimeout> | undefined;
        try {
          const { aiRewriteBatch } = await import("@/features/ai/aiRewriteBatch");
          const timeoutPromise = new Promise<{ ok: false; variations: string[]; error?: string }>(
            (_, reject) => {
              timerId = setTimeout(() => reject(new Error("timeout 20s")), 20000);
            },
          );
          const result = await Promise.race([
            aiRewriteBatch({ originalText: text, count: bundleCount }),
            timeoutPromise,
          ]);
          if (result.ok && result.variations.length > 0) {
            variationsMap.set(text, result.variations);
          } else if (!result.ok) {
            toast.error(`AI rewrite lỗi: ${(result as { error?: string }).error ?? "unknown"}`);
          }
        } catch (err) {
          toast.error(`AI rewrite exception: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          // Luôn clear timer để Promise.race không leak setTimeout dangling
          if (timerId !== undefined) clearTimeout(timerId);
        }
      }
      if (variationsMap.size > 0) {
        toast.success(`AI đã tạo ${variationsMap.size} nhóm variations`);
      } else {
        toast.warning("AI không tạo được variations - giữ text gốc");
      }
      // Cảnh báo nếu AI trả ít variations hơn số bundles -> sẽ phải lặp lại
      const insufficient = Array.from(variationsMap.entries()).filter(
        ([, variations]) => variations.length < bundleCount,
      );
      if (insufficient.length > 0) {
        toast.warning(
          `${insufficient.length} text AI trả ít hơn ${bundleCount} bundles -> lặp variation cuối`,
        );
      }
      // Gán variations vào workingTemplate của mỗi page
      if (variationsMap.size > 0) {
        job.pages = job.pages.map((page, pageIdx) => {
          const bundleIdx = Math.floor(pageIdx / bundleSize);
          const tpl = page.workingTemplate ?? pageTemplatesForGenerate.find(
            (t) => t.pageTemplateId === page.pageTemplateId,
          );
          if (!tpl) return page;
          const baseTpl = pageTemplatesForGenerate.find(
            (t) => t.pageTemplateId === page.pageTemplateId,
          );
          const hasAiSlot = tpl.slots.some((s) => isAiRewriteSlot(s));
          if (!hasAiSlot) return page;
          const nextTemplate = JSON.parse(JSON.stringify(tpl)) as typeof tpl;
          nextTemplate.slots = nextTemplate.slots.map((slot) => {
            if (!isAiRewriteSlot(slot)) return slot;
            // Lấy text gốc để lookup variations
            const originalText = slot.staticText?.trim()
              || baseTpl?.slots.find((s) => s.slotId === slot.slotId)?.staticText?.trim()
              || "";
            if (!originalText) return slot;
            const variations = variationsMap.get(originalText);
            if (!variations || variations.length === 0) return slot;
            // Khi bundleCount > variations.length, lặp variation cuối thay vì
            // wrap modulo (giảm trùng lặp giữa các bundle giáp ranh).
            const variationIdx = Math.min(bundleIdx, variations.length - 1);
            return {
              ...slot,
              staticText: variations[variationIdx],
              bindingPath: undefined, // Clear binding sau khi đã rewrite
            };
          });
          return { ...page, workingTemplate: nextTemplate };
        });

        // Sync lại previewPageDrafts: clear "ai.rewrite" binding và đặt
        // staticText là variation đầu (bundle 0). Trước đây drafts không sync,
        // nên (a) lần Generate kế lại trigger AI lần nữa, (b) re-open workspace
        // hiển thị placeholder cũ thay vì kết quả rewrite. Chỉ giữ binding khi
        // không có variations để user vẫn rewrite được lần sau.
        const draftPatches = new Map<string, Map<string, string>>();
        for (const page of job.pages) {
          if (!page.workingTemplate) continue;
          const baseTpl = pageTemplatesForGenerate.find(
            (t) => t.pageTemplateId === page.pageTemplateId,
          );
          for (const slot of page.workingTemplate.slots) {
            const originalSlot = baseTpl?.slots.find((s) => s.slotId === slot.slotId);
            if (!isAiRewriteSlot(originalSlot ?? { bindingPath: undefined })) continue;
            // workingTemplate đã clear binding -> dùng staticText đó làm variation đầu
            if (!slot.staticText) continue;
            let pageMap = draftPatches.get(page.pageTemplateId);
            if (!pageMap) {
              pageMap = new Map();
              draftPatches.set(page.pageTemplateId, pageMap);
            }
            // Chỉ set lần đầu (bundle 0) để tránh ghi đè bằng variation khác
            if (!pageMap.has(slot.slotId)) {
              pageMap.set(slot.slotId, slot.staticText);
            }
          }
        }
        if (draftPatches.size > 0) {
          commitPreviewPageDrafts(
            (prev) => {
              const next = { ...prev };
              for (const [pageTemplateId, slotPatches] of draftPatches.entries()) {
                const baseTpl = pageTemplatesForGenerate.find(
                  (t) => t.pageTemplateId === pageTemplateId,
                );
                const current = next[pageTemplateId] ?? baseTpl;
                if (!current) continue;
                const updated = createWorkingTemplate(
                  baseTpl ?? current,
                  undefined,
                  current,
                  GENERATE_TEMPLATE_OPTIONS,
                );
                updated.slots = updated.slots.map((slot) => {
                  const newText = slotPatches.get(slot.slotId);
                  if (newText == null) return slot;
                  return { ...slot, bindingPath: undefined, staticText: newText };
                });
                updated.updatedAt = Date.now();
                next[pageTemplateId] = updated;
              }
              return next;
            },
            { history: false },
          );
        }
      }
    }

    setJob(job);
    try {
      await db.jobs.put(job);
      toast.success(`Đã tạo ${job.pages.length} trang và lưu vào lịch sử`);
    } catch (error) {
      toast.error(
        "Đã tạo trang nhưng không lưu được lịch sử: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const jobPack =
    packs.find((pack) => pack.packTemplateId === currentJob?.packTemplateId) ?? selectedPack;

  const {
    filteredPages,
    entitiesById,
    getExportPageTemplate,
    bundleGroups,
    bundleImageIssuesByIndex,
  } = usePackBundleGroups({
    currentJob,
    jobPack,
    tpls,
    entities,
    assets,
    filter,
    packOv,
  });

  const { exportZip, exportBundleZip } = useBundleExporter({
    currentJob,
    jobPack,
    entities,
    entitiesById,
    getExportPageTemplate,
    packRefs,
    setBundleExportingIndex,
  });

  // Contribute pack/generate commands to the global Ctrl+K palette.
  usePageCommands(
    useMemo<CommandEntry[]>(
      () => [
        {
          id: "generate:pack",
          label: "Tạo pack mới",
          group: "Tạo nội dung",
          keywords: ["generate", "pack"],
          shortcut: "Enter",
          icon: <PlayIcon className="size-4" />,
          action: () => void onGenerate(),
        },
        ...(currentJob
          ? [
              {
                id: "generate:export-zip",
                label: "Xuất ZIP",
                group: "Tạo nội dung",
                keywords: ["export", "zip", "publish"],
                icon: <Download className="size-4" />,
                action: () => void exportZip(),
              },
            ]
          : []),
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        currentJob?.jobId,
      ],
    ),
  );

  const pageTabs = useMemo(() => toPageTabItems(packPages, packOv), [packPages, packOv]);

  const bindPanelTextRows = useMemo<BindPanelTextSlotRow[]>(
    () =>
      sortedSelectedTextSlots.map((slot, index) => ({
        slot,
        label: textSlotLabel(slot, index),
        statusLabel: selectedSlotStatusLabel(slot),
        bindingValue: textSlotBindingValue(slot),
        bindingOptions: textBindingOptionsForSlot(slot),
        bindingOptionLabel: textBindingOptionLabel,
        fieldBindingValue: textSlotFieldBindingValue(slot),
        showPerSlotSource:
          !clusterSourceSlotIds.has(slot.slotId) &&
          textSlotFieldBindingValue(slot) !== "_static" &&
          slot.bindingPath !== "ai.rewrite",
      })),
    [
      sortedSelectedTextSlots,
      clusterSourceSlotIds,
      textSlotLabel,
      selectedSlotStatusLabel,
      textSlotBindingValue,
      textBindingOptionsForSlot,
      textSlotFieldBindingValue,
    ],
  );

  const bindPanelImageRows = useMemo<BindPanelImageSlotRow[]>(
    () =>
      sortedSelectedImageSlots.map((slot, index) => {
        const rawValue = imageSlotBindingValue(slot);
        const hasLinkedText = imageSlotHasLinkedText(slot);
        const value =
          !hasLinkedText && isEntityScopedImageBindingPath(rawValue) ? "_static" : rawValue;
        const randomScope = parseAssetRandomScopeBindingPath(slot.bindingPath);
        const randomScopeSheet = randomScope?.sheetName ?? slotSourceConfig(slot).selectedSheet;
        const randomScopeFolder = randomScope?.folder ?? ALL_VALUE;
        return {
          slot,
          label: imageSlotLabel(slot, index),
          statusLabel: selectedSlotStatusLabel(slot),
          selectValue: value,
          imageOptions: imageBindingOptionsForSlot(slot),
          imageOptionLabel: imageBindingOptionLabel,
          hasLinkedText,
          showRandomScope: value === ASSET_RANDOM_SCOPE_BINDING_VALUE,
          randomScopeSheet,
          randomScopeFolder,
          randomImageFolderOptions: randomImageFolderOptionsForSheet(randomScopeSheet),
        };
      }),
    [
      sortedSelectedImageSlots,
      imageSlotBindingValue,
      imageSlotHasLinkedText,
      imageSlotLabel,
      selectedSlotStatusLabel,
      imageBindingOptionsForSlot,
      randomImageFolderOptionsForSheet,
      slotSourceConfig,
    ],
  );

  const presetGalleryItems = useMemo(
    () =>
      matchingPresets.map((preset) => ({
        preset,
        pages: getPresetPackPages(preset).pages,
      })),
    [matchingPresets, getPresetPackPages],
  );

  const zoomedPageMeta = useMemo(
    () =>
      zoomedPageIndex == null
        ? undefined
        : bundleGroups
            .flatMap((bundle) => bundle.pages)
            .find((meta) => meta.page.pageIndex === zoomedPageIndex),
    [bundleGroups, zoomedPageIndex],
  );
  const zoomedTemplate =
    zoomedPageMeta?.page.workingTemplate ??
    (zoomedPageMeta?.pageTemplate
      ? resolvePageWorkingTemplate(
          zoomedPageMeta.pageTemplate,
          zoomedPageMeta.page.bindOverrides ?? packOv[zoomedPageMeta.pageTemplate.pageTemplateId],
          undefined,
          GENERATE_TEMPLATE_OPTIONS,
        )
      : undefined);
  const zoomedEntity = zoomedPageMeta?.page.entityId
    ? entities.find((entity) => entity.entityId === zoomedPageMeta.page.entityId)
    : undefined;
  const zoomedScale = zoomedTemplate
    ? Math.min(1040 / zoomedTemplate.canvas.width, 760 / zoomedTemplate.canvas.height)
    : 1;

  const editingJobPage = currentJob?.pages.find((page) => page.pageIndex === editingPageIndex);
  const editingJobPageBaseTemplate =
    editingJobPage && tpls.length > 0
      ? resolvePageWorkingTemplate(
          tpls.find((tpl) => tpl.pageTemplateId === editingJobPage.pageTemplateId),
          editingJobPage.bindOverrides ?? packOv[editingJobPage.pageTemplateId],
          undefined,
          GENERATE_TEMPLATE_OPTIONS,
        )
      : undefined;
  const editingJobPageTemplate = editingJobPage?.workingTemplate ?? editingJobPageBaseTemplate;
  const jobRenderSeed = currentJob?.jobId ?? "draft";

  return (
    <>
      <input
        ref={presetImportRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handlePresetImportFile}
      />
      {!workspaceOpen ? (
        <PresetGalleryView
          packs={packs}
          packId={packId}
          onPackIdChange={setPackId}
          selectedPack={selectedPack}
          presets={presetGalleryItems}
          entities={entities}
          assets={assets}
          previewContextKey={(presetId, pageTemplateId) => `${presetId}:${pageTemplateId}`}
          getPreviewContext={(key) => presetCardPreviewContexts.get(key)}
          resolvePreviewTemplate={(preset, page) => {
            const previewTemplateRaw = resolvePageWorkingTemplate(
              page,
              preset.bindOverrides?.[page.pageTemplateId],
              preset.pageTemplateDrafts?.[page.pageTemplateId],
              GENERATE_TEMPLATE_OPTIONS,
            );
            if (!previewTemplateRaw) return null;
            const pageGroupSources =
              preset.generateConfig.groupSourceConfigs?.[page.pageTemplateId];
            return pageGroupSources && Object.keys(pageGroupSources).length > 0
              ? applyGroupSourceConfigsToTemplate(
                  previewTemplateRaw,
                  pageGroupSources,
                  (slot) => getSlotBindMode(slot, previewTemplateRaw) !== null,
                )
              : previewTemplateRaw;
          }}
          onImport={() => presetImportRef.current?.click()}
          onCreatePreset={createPresetAndOpen}
          onOpenPreset={openPresetWorkspace}
          onExportPreset={(preset) => void exportPreset(preset)}
          onDeletePreset={async (preset) => {
            await db.generatePresets.delete(preset.presetId);
            if (selectedPresetId === preset.presetId) setSelectedPresetId("");
            toast.success("Đã xoá khuôn");
          }}
        />
      ) : (
        <>
          <GeneratePackWorkspace
            selectedSlotCount={selectedSlotIds.length}
            generateReadiness={generateReadiness}
            onBack={() => void closeWorkspace()}
            onGenerate={onGenerate}
            maxEntities={maxEntities}
            setMaxEntities={setMaxEntities}
            normalizeCount={normalizeCount}
            activeGenerateConfig={activeGenerateConfig}
            updateActiveGenerateConfig={updateActiveGenerateConfig}
            varyFontsFromSecondBundle={varyFontsFromSecondBundle}
            setVaryFontsFromSecondBundle={setVaryFontsFromSecondBundle}
            activeTargetCount={activeTargetCount}
            filteredEntityCount={filteredEntities.length}
            packPageCount={packPages.length}
            totalBound={totalBound}
            estimateGeneratedPageCount={estimateGeneratedPageCount}
            generationBaseEntitiesCount={generationBaseEntities.length}
            pageTabs={pageTabs}
            activePageIdx={activePageIdx}
            setActivePageIdx={setActivePageIdx}
            hasPackPages={packPages.length > 0}
            effectiveActive={effectiveActive}
            selectedSlotIds={selectedSlotIds}
            handleSelectSlot={handleSelectSlot}
            previewEntity={previewEntity}
            assets={assets}
            previewEntityPool={previewEntityPool}
            entities={entities}
            previewSlotItems={previewSlotItems}
            showSafeFrame={showSafeFrame}
            showFieldBadges={showFieldBadges}
            setShowFieldBadges={setShowFieldBadges}
            setShowSafeFrame={setShowSafeFrame}
            previewAllocationWarnings={previewAllocationWarnings}
            canUndoPreviewDraft={canUndoPreviewDraft}
            canRedoPreviewDraft={canRedoPreviewDraft}
            undoPreviewPageDrafts={undoPreviewPageDrafts}
            redoPreviewPageDrafts={redoPreviewPageDrafts}
            onEditLayout={() => {
              setSelectedSlotIds([]);
              setEditingPreviewOpen(true);
            }}
            selectedSlots={selectedSlots}
            selectedBindableSlots={selectedBindableSlots}
            panelPreviewEntity={panelPreviewEntity}
            formatClipboard={formatClipboard}
            hasMultipleSelectedClusters={hasMultipleSelectedClusters}
            shouldShowClusterSourceControls={shouldShowClusterSourceControls}
            clusterPasteTargetsCount={clusterPasteTargets.length}
            showClusterPasteButton={!!formatClipboard?.sourceVisualGroupId}
            relatedFormatTargetCount={relatedFormatTargetSlots.length}
            selectedDataGroupCount={selectedDataGroupIds.length}
            bindPanelTextRows={bindPanelTextRows}
            bindPanelImageRows={bindPanelImageRows}
            showTextListPanel={
              selectedTextSlots.length === 1 &&
              textSlotBindingValue(selectedTextSlots[0]) === "__list"
            }
            textListFieldOptions={textListFieldOptions}
            prioritizePartner={prioritizePartner}
            showTextRewrite={selectedTextSlots.length === 1}
            rewriteSlotId={selectedTextSlots[0]?.slotId ?? ""}
            rewriteCurrentText={
              selectedTextSlots[0] ? getRewriteCurrentText(selectedTextSlots[0]) : ""
            }
            rewriteBusy={rewriteBusy}
            showAiCaption={selectedSlot?.kind === "text"}
            captionBusy={captionBusy}
            captionDisabled={!previewEntity}
            hasBindingsToClear={selectedBindableSlots.some((slot) => !!slot.bindingPath)}
            sheetOptions={sheetOptions}
            allValue={ALL_VALUE}
            renderSourceControls={renderSourceControls}
            clusterSourceSlots={clusterSourceSlots}
            clusterSourceConfig={clusterSourceConfig}
            slotSourceConfig={slotSourceConfig}
            onCopyFormat={copySelectedSlotFormat}
            onPasteToSelected={() => applyCopiedSlotFormat(selectedBindableSlots, "đang chọn")}
            onPasteToCluster={pasteToMatchingClusterOnPage}
            onPasteToRelatedCluster={() =>
              applyCopiedSlotFormat(relatedFormatTargetSlots, "trong cụm")
            }
            onGroupSelected={groupSelectedDataSlots}
            onClearGroups={clearSelectedDataGroups}
            onTextBindingChange={applyTextBindingSelection}
            onImageBindingChange={applyImageBindingSelection}
            onRandomScopeSheetChange={(slot, sheetName) =>
              applyRandomImageScope(slot, { sheetName, folder: ALL_VALUE })
            }
            onRandomScopeFolderChange={(slot, folder) => applyRandomImageScope(slot, { folder })}
            onTextListApply={(bindingPath) => {
              if (!activePage || selectedTextSlots.length !== 1) return;
              applyBindingToSlots([selectedTextSlots[0]], activePage.pageTemplateId, bindingPath);
              toast.success("Đã áp danh sách vào khung chữ");
            }}
            onRewrite={runAiRewriteSelectedText}
            onAiCaption={runAiCaption}
            onClearBindings={() => {
              if (!activePage) return;
              clearBindingsForSlots(selectedBindableSlots, activePage.pageTemplateId);
            }}
          />

          {/* Kết quả render — sticky toolbar gộp các thao tác global + danh
              sách bundle. Per-bundle header tối giản, card không còn border
              tím / filename / footer buttons (xem design 2026-05-20). */}
          {currentJob && currentJob.pages.length > 0 && (
            <>
              <div className="sticky top-0 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
                <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="selected">Đang chọn</SelectItem>
                    <SelectItem value="errors">Có cảnh báo</SelectItem>
                    <SelectItem value="partner">Có đối tác</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAll(true)}
                >
                  Chọn hết
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAll(false)}
                >
                  Bỏ chọn hết
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={(event) => {
                    event.preventDefault();
                    void exportZip();
                  }}
                  title="Xuất toàn bộ bộ ảnh đã chọn thành file ZIP"
                >
                  <Package className="size-4 mr-2" /> Xuất ZIP
                </Button>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{currentJob.pages.length} trang</Badge>
                  <Badge variant="secondary">
                    {currentJob.pages.filter((p) => p.selected).length} đã chọn
                  </Badge>
                </div>
              </div>
              <div className="space-y-6">
                {bundleGroups.map((bundle) => (
                  <div
                    key={bundle.bundleIndex}
                    id={`bundle-${bundle.bundleIndex}`}
                    className="space-y-3 scroll-mt-20"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-semibold">{bundle.bundleLabel}</h2>
                      <Badge variant="outline">{bundle.pages.length} trang</Badge>
                      {(() => {
                        const bundleAllSelected = bundle.pages.every(
                          (meta) => meta.page.selected,
                        );
                        return (
                          <Button
                            type="button"
                            size="sm"
                            variant={bundleAllSelected ? "secondary" : "outline"}
                            onClick={() => {
                              bundle.pages.forEach((meta) => {
                                updatePage(meta.page.pageIndex, (page) => ({
                                  ...page,
                                  selected: !bundleAllSelected,
                                }));
                              });
                            }}
                          >
                            {bundleAllSelected ? "Bỏ chọn cả bộ" : "Chọn cả bộ"}
                          </Button>
                        );
                      })()}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.preventDefault();
                          void exportBundleZip(bundle);
                        }}
                        disabled={bundleExportingIndex === bundle.bundleIndex}
                      >
                        {bundleExportingIndex === bundle.bundleIndex ? (
                          <Loader2 className="size-3 mr-1 animate-spin" />
                        ) : (
                          <Package className="size-3 mr-1" />
                        )}
                        Tải bộ
                      </Button>
                    </div>
                    <BundleImageWarningsAlert
                      bundleLabel={bundle.bundleLabel}
                      issues={bundleImageIssuesByIndex.get(bundle.bundleIndex) ?? []}
                    />
                    <div className="overflow-x-auto pb-2">
                      <div className="flex w-max gap-4">
                        {bundle.pages.map((meta) => {
                          const page = meta.page;
                          const tpl = meta.pageTemplate;
                          if (!tpl) return null;
                          const eff =
                            page.workingTemplate ??
                            resolvePageWorkingTemplate(
                              tpl,
                              page.bindOverrides ?? packOv[tpl.pageTemplateId],
                              undefined,
                              GENERATE_TEMPLATE_OPTIONS,
                            );
                          if (!eff) return null;
                          const ent = page.entityId
                            ? entities.find((entity) => entity.entityId === page.entityId)
                            : undefined;
                          const previewScale = Math.min(
                            320 / eff.canvas.width,
                            420 / eff.canvas.height,
                          );
                          const previewWidth = Math.round(eff.canvas.width * previewScale);
                          const previewHeight = Math.round(eff.canvas.height * previewScale);
                          return (
                            <div
                              key={page.pageIndex}
                              className="relative w-[280px] shrink-0"
                            >
                              <button
                                type="button"
                                className="group relative block w-full overflow-hidden border bg-muted/30 transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                title="Bấm để phóng to ảnh"
                                onClick={() =>
                                  setZoomedPageIndex((current) =>
                                    current === page.pageIndex ? null : page.pageIndex,
                                  )
                                }
                              >
                                <div
                                  ref={(el) => {
                                    if (el) packRefs.current.set(page.pageIndex, el);
                                  }}
                                  className="mx-auto overflow-hidden bg-background"
                                  style={{ width: previewWidth, height: previewHeight }}
                                >
                                  <PageRenderer
                                    template={eff}
                                    page={page}
                                    entities={entities}
                                    assets={assets}
                                    entity={ent}
                                    entityPool={buildPageEntityPool(page)}
                                    scale={previewScale}
                                    debug={debug}
                                    seedKey={`${jobRenderSeed}:${page.pageTemplateId}:${page.pageIndex}`}
                                    hideImagePlaceholderText
                                    lazyImages
                                  />
                                </div>
                                <span
                                  className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1"
                                  aria-hidden
                                >
                                  {meta.hasPartnerExposure && (
                                    <Badge className="gap-1 shadow-sm">
                                      <Star className="size-3" /> Đối tác
                                    </Badge>
                                  )}
                                </span>
                              </button>
                              <div
                                className="absolute left-2 top-2 z-10"
                                onClick={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  aria-label={
                                    page.selected ? "Bỏ chọn trang" : "Chọn trang"
                                  }
                                  onClick={() => toggleSelected(page.pageIndex)}
                                  className={
                                    page.selected
                                      ? "inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90"
                                      : "inline-flex size-6 items-center justify-center rounded-full border border-input bg-background/90 text-muted-foreground shadow-sm transition hover:bg-background"
                                  }
                                >
                                  {page.selected ? (
                                    <Check className="size-4" />
                                  ) : (
                                    <span className="block size-3 rounded-full border border-current" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {zoomedPageMeta && zoomedTemplate && (
        <div
          className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/75 p-4"
          onClick={() => setZoomedPageIndex(null)}
        >
          <div
            className="flex max-h-[92vh] max-w-[92vw] cursor-default flex-col gap-3 rounded-lg bg-background p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 truncate text-sm font-medium">
                {zoomedPageMeta.pageTemplate?.name ??
                  zoomedPageMeta.page.workingTemplate?.name ??
                  zoomedPageMeta.page.pageFile}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingPageIndex(zoomedPageMeta.page.pageIndex);
                    setZoomedPageIndex(null);
                  }}
                >
                  <Pencil className="size-3.5 mr-1.5" />
                  Sửa trang
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const node = packRefs.current.get(zoomedPageMeta.page.pageIndex);
                    if (!node) {
                      toast.error("Không tìm thấy ảnh để tải");
                      return;
                    }
                    const pipeline = await loadExportPipeline();
                    await pipeline.downloadPng(node, zoomedPageMeta.page.pageFile, 2);
                  }}
                >
                  <Download className="size-3.5 mr-1.5" />
                  Tải PNG
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Đóng"
                  onClick={() => setZoomedPageIndex(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="overflow-auto">
              <PageRenderer
                template={zoomedTemplate}
                page={zoomedPageMeta.page}
                entities={entities}
                assets={assets}
                entity={zoomedEntity}
                entityPool={buildPageEntityPool(zoomedPageMeta.page)}
                scale={zoomedScale}
                debug={debug}
                seedKey={`${jobRenderSeed}:${zoomedPageMeta.page.pageTemplateId}:${zoomedPageMeta.page.pageIndex}:zoom`}
                hideImagePlaceholderText
                lazyImages
              />
            </div>
          </div>
        </div>
      )}

      {editingJobPage && editingJobPageBaseTemplate && editingJobPageTemplate && (
        <GeneratePageEditor
          open={!!editingJobPage}
          onOpenChange={(open) => {
            if (!open) setEditingPageIndex(null);
          }}
          title={`Sửa trang · ${editingJobPage.pageFile}`}
          template={editingJobPageTemplate}
          baseTemplate={editingJobPageBaseTemplate}
          entities={entities}
          assets={assets}
          entity={
            editingJobPage.entityId
              ? entities.find((entity) => entity.entityId === editingJobPage.entityId)
              : undefined
          }
          entityPool={buildPageEntityPool(editingJobPage)}
          slotItems={editingJobPage.items}
          seedKey={`${jobRenderSeed}:${editingJobPage.pageTemplateId}:${editingJobPage.pageIndex}`}
          preserveBindings={false}
          onApply={(nextTemplate) => {
            updatePage(editingJobPage.pageIndex, (page) => ({
              ...page,
              workingTemplate: nextTemplate ?? undefined,
            }));
          }}
        />
      )}

      {editingPreviewOpen && activePage && effectiveActive && (
        <GeneratePageEditor
          open={editingPreviewOpen}
          onOpenChange={setEditingPreviewOpen}
          title={`Chỉnh bố cục xem trước · ${packPageLabel(activePageIdx)}`}
          template={effectiveActive}
          baseTemplate={activePage}
          entities={entities}
          assets={assets}
          entity={previewEntity}
          entityPool={previewEntityPool}
          slotItems={previewSlotItems}
          seedKey={`${effectiveActive.pageTemplateId}:${activePageIdx}`}
          preserveBindings
          onApply={(nextTemplate) => {
            if (!nextTemplate) return;
            commitPreviewPageDrafts((prev) => ({
              ...prev,
              [activePage.pageTemplateId]: nextTemplate,
            }));
          }}
        />
      )}
    </>
  );
}

