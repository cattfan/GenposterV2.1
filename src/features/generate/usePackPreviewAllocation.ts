import { useMemo, type RefObject } from "react";
import type { Entity, GenerationJob, PageTemplate, RenderedItem } from "@/models";
import type { PackBindOverrides } from "@/features/generate/usePackBindOverrides";
import type { PreviewPageDrafts } from "@/features/generate/usePreviewPageDrafts";
import type { ResolvedGeneratePageConfig } from "@/features/generate/generatePanelProps";
import { allocatePackWorkspacePreview } from "@/features/generate/packWorkspacePreview";
import { resolveGeneratePageConfig } from "@/features/generate/generateConfigHelpers";
import { GENERATE_TEMPLATE_OPTIONS, resolvePageWorkingTemplate } from "@/features/generate/templateState";
import type { StickyGroupPin } from "@/features/generate/stickyPreviewAllocation";

export function usePackPreviewAllocation(params: {
  workspaceOpen: boolean;
  packPages: PageTemplate[];
  packOv: PackBindOverrides;
  previewPageDrafts: PreviewPageDrafts;
  previewEntity: Entity | undefined;
  previewEntityId: string | undefined;
  filteredEntities: Entity[];
  buildOrderedEntityPool: (primaryEntityId: string | undefined, pool?: Entity[]) => Entity[];
  globalGenerateConfig: ResolvedGeneratePageConfig;
  sourceNeutralPageConfigs: Record<string, import("@/models").GeneratePageConfig>;
  stickyPreviewPinsByPageRef: RefObject<Map<string, Map<string, StickyGroupPin>>>;
  activePreviewRenderedPage: GenerationJob["pages"][number] | undefined;
  effectiveActive: PageTemplate | undefined;
}) {
  const {
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
  } = params;

  const packPreviewAllocations = useMemo(() => {
    if (!workspaceOpen || !previewEntity || packPages.length === 0) {
      return new Map<string, { items: RenderedItem[]; warnings: string[] }>();
    }
    return allocatePackWorkspacePreview({
      packPages,
      resolveEffectiveTemplate: (page) =>
        resolvePageWorkingTemplate(
          page,
          packOv[page.pageTemplateId],
          previewPageDrafts[page.pageTemplateId],
          GENERATE_TEMPLATE_OPTIONS,
        ),
      orderedEntities: buildOrderedEntityPool(previewEntityId, filteredEntities),
      pinsByPage: stickyPreviewPinsByPageRef.current,
      resolvePageConfig: (page) => {
        const cfg = resolveGeneratePageConfig(
          globalGenerateConfig,
          sourceNeutralPageConfigs[page.pageTemplateId],
        );
        return {
          partnerQuota: cfg.partnerQuotaPerPage,
          prioritizePartner: cfg.prioritizePartner,
        };
      },
      previewEntity,
    });
  }, [
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
  ]);

  const previewAllocation = useMemo(() => {
    const useStickyBindPreview = workspaceOpen;
    if (!useStickyBindPreview && activePreviewRenderedPage) {
      return { items: activePreviewRenderedPage.items, warnings: [] as string[] };
    }
    if (!effectiveActive) {
      return { items: [], warnings: [] as string[] };
    }
    const pageAlloc = packPreviewAllocations.get(effectiveActive.pageTemplateId);
    return pageAlloc ?? { items: [], warnings: [] as string[] };
  }, [workspaceOpen, activePreviewRenderedPage, effectiveActive, packPreviewAllocations]);

  return { packPreviewAllocations, previewAllocation };
}
