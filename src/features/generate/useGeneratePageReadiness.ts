import { useMemo } from "react";
import type { Entity, PackTemplate, PageTemplate, Slot } from "@/models";
import type { PackBindOverrides } from "@/features/generate/usePackBindOverrides";
import type { PreviewPageDrafts } from "@/features/generate/usePreviewPageDrafts";
import type { ResolvedGeneratePageConfig } from "@/features/generate/generatePanelProps";
import { buildEntityBindingTargets } from "@/engines/binding/cardRepeater";
import {
  buildConfiguredEntityPool,
  buildSourceFilteredEntities,
  resolveGeneratePageConfig,
} from "@/features/generate/generateConfigHelpers";
import { GENERATE_TEMPLATE_OPTIONS, resolvePageWorkingTemplate } from "@/features/generate/templateState";

export interface GenerateReadiness {
  canGenerate: boolean;
  reason: string;
}

export interface PageReadinessRow {
  page: PageTemplate;
  index: number;
  entityCount: number;
  bindableCount: number;
  boundCount: number;
  targetCount: number;
  emptyTarget: ReturnType<typeof buildEntityBindingTargets>[number] | undefined;
}

export function useGeneratePageReadiness(params: {
  selectedPack: PackTemplate | undefined;
  packPages: PageTemplate[];
  packOv: PackBindOverrides;
  previewPageDrafts: PreviewPageDrafts;
  globalGenerateConfig: ResolvedGeneratePageConfig;
  sourceNeutralPageConfigs: Record<string, import("@/models").GeneratePageConfig>;
  entities: Entity[];
  generationBaseEntities: Entity[];
  filteredEntities: Entity[];
  estimateGeneratedPageCount: number;
  getSlotBindMode: (slot: Slot, template?: PageTemplate) => "text" | "image" | null;
}) {
  const {
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
  } = params;

  const totalBound = useMemo(
    () =>
      packPages.reduce(
        (acc, t) =>
          acc +
          (
            resolvePageWorkingTemplate(
              t,
              packOv[t.pageTemplateId],
              previewPageDrafts[t.pageTemplateId],
              GENERATE_TEMPLATE_OPTIONS,
            )?.slots ?? []
          ).filter((s) => !!s.bindingPath).length,
        0,
      ),
    [packPages, packOv, previewPageDrafts],
  );

  const pageReadinessRows = useMemo(
    (): PageReadinessRow[] =>
      packPages.map((page, index) => {
        const template =
          resolvePageWorkingTemplate(
            page,
            packOv[page.pageTemplateId],
            previewPageDrafts[page.pageTemplateId],
            GENERATE_TEMPLATE_OPTIONS,
          ) ?? page;
        const configuredEntities = buildConfiguredEntityPool(
          buildSourceFilteredEntities(entities, globalGenerateConfig),
          resolveGeneratePageConfig(globalGenerateConfig, sourceNeutralPageConfigs[page.pageTemplateId]),
        );
        const targets = buildEntityBindingTargets(template, configuredEntities);
        const emptyTarget = targets.find((target) => target.candidateEntities.length === 0);
        return {
          page,
          index,
          entityCount: configuredEntities.length,
          bindableCount: template.slots.filter((slot) => getSlotBindMode(slot, template) !== null).length,
          boundCount: template.slots.filter((slot) => !!slot.bindingPath).length,
          targetCount: targets.length,
          emptyTarget,
        };
      }),
    [
      packPages,
      packOv,
      previewPageDrafts,
      globalGenerateConfig,
      sourceNeutralPageConfigs,
      entities,
      getSlotBindMode,
    ],
  );

  const hasTextOrImageSlots = useMemo(
    () => pageReadinessRows.some((row) => row.bindableCount > 0),
    [pageReadinessRows],
  );

  const generateReadiness = useMemo((): GenerateReadiness => {
    if (!selectedPack) return { canGenerate: false, reason: "Chưa chọn bộ mẫu" };
    if (packPages.length === 0) return { canGenerate: false, reason: "Bộ mẫu chưa có trang" };
    if (generationBaseEntities.length === 0) {
      return { canGenerate: false, reason: "Chưa có dữ liệu. Hãy nhập Google Sheet trước." };
    }
    if (!hasTextOrImageSlots) {
      return { canGenerate: false, reason: "Bộ mẫu chưa có khung chữ hoặc ảnh để đổ dữ liệu" };
    }
    if (totalBound === 0) {
      return { canGenerate: false, reason: "Chưa liên kết khung chữ/ảnh với dữ liệu" };
    }
    const emptyPage = pageReadinessRows.find(
      (row) => row.targetCount > 0 && row.entityCount === 0,
    );
    if (emptyPage) {
      return {
        canGenerate: false,
        reason: `Trang ${emptyPage.index + 1} không có dòng dữ liệu phù hợp`,
      };
    }
    const emptySlotSourcePage = pageReadinessRows.find((row) => row.emptyTarget);
    if (emptySlotSourcePage) {
      return {
        canGenerate: false,
        reason: `Trang ${emptySlotSourcePage.index + 1} có khối không có dữ liệu phù hợp`,
      };
    }
    if (estimateGeneratedPageCount === 0) {
      return { canGenerate: false, reason: "Không có dòng dữ liệu phù hợp để tạo ảnh" };
    }
    return {
      canGenerate: true,
      reason: `Sẵn sàng tạo ${estimateGeneratedPageCount} trang từ ${filteredEntities.length} dòng dữ liệu`,
    };
  }, [
    selectedPack,
    packPages.length,
    generationBaseEntities.length,
    hasTextOrImageSlots,
    totalBound,
    pageReadinessRows,
    estimateGeneratedPageCount,
    filteredEntities.length,
  ]);

  return { totalBound, pageReadinessRows, hasTextOrImageSlots, generateReadiness };
}
