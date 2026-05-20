import { useCallback, useMemo } from "react";
import type { Asset, Entity, GenerationJob, PackTemplate, PageTemplate } from "@/models";
import { buildBundleGroups, type BundleGroup } from "@/lib/packDisplay";
import { indexById } from "@/lib/indexById";
import {
  GENERATE_TEMPLATE_OPTIONS,
  resolvePageWorkingTemplate,
} from "@/features/generate/templateState";
import { expandPageWithCardGroups } from "@/engines/binding/cardRepeater";
import { filterRenderableAssets } from "@/engines/binding/assetImage";
import { isEntityScopedImageBindingPath } from "@/engines/binding/dataBinding";
import { getImageReferenceEntityIds } from "@/features/data/imageReferences";
import type { BundleImageIssue } from "@/features/generate/BundleImageWarningsAlert";
import type { Slot } from "@/models";

function slotNeedsEntityImage(slot: Slot): boolean {
  if (slot.kind !== "image" && slot.kind !== "shape") return false;
  return isEntityScopedImageBindingPath(slot.bindingPath ?? "");
}

export function usePackBundleGroups(params: {
  currentJob: GenerationJob | null | undefined;
  jobPack: PackTemplate | undefined;
  tpls: PageTemplate[];
  entities: Entity[];
  assets: Asset[];
  filter: "all" | "selected" | "errors" | "partner";
  packOv: Record<string, Record<string, string | undefined>>;
}) {
  const { currentJob, jobPack, tpls, entities, assets, filter, packOv } = params;

  const filteredPages = useMemo(
    () =>
      currentJob?.pages.filter((p) => {
        if (filter === "selected") return p.selected;
        if (filter === "errors") return p.warnings.length > 0 || p.state === "rejected";
        if (filter === "partner") return p.items.some((item) => item.partnerFlag);
        return true;
      }),
    [currentJob, filter],
  );

  const visiblePageIndexes = useMemo(
    () => new Set(filteredPages?.map((page) => page.pageIndex) ?? []),
    [filteredPages],
  );

  const entitiesById = useMemo(() => indexById(entities, (e) => e.entityId), [entities]);
  const tplsById = useMemo(() => indexById(tpls, (t) => t.pageTemplateId), [tpls]);

  const getExportPageTemplate = useCallback(
    (page: GenerationJob["pages"][number]): PageTemplate | undefined => {
      if (page.workingTemplate) return page.workingTemplate;
      const base = tplsById.get(page.pageTemplateId);
      if (!base) return undefined;
      return resolvePageWorkingTemplate(
        base,
        page.bindOverrides ?? packOv[page.pageTemplateId],
        undefined,
        GENERATE_TEMPLATE_OPTIONS,
      );
    },
    [tplsById, packOv],
  );

  const bundleGroups = useMemo((): BundleGroup[] => {
    if (!currentJob || !jobPack) return [];
    return buildBundleGroups(currentJob, jobPack, tpls, entities)
      .map((group) => ({
        ...group,
        pages: group.pages.filter((page) => visiblePageIndexes.has(page.page.pageIndex)),
      }))
      .filter((group) => group.pages.length > 0);
  }, [currentJob, jobPack, tpls, entities, visiblePageIndexes]);

  const bundleImageIssuesByIndex = useMemo(() => {
    const renderableAssets = filterRenderableAssets(assets);
    const assetCountByEntity = new Map<string, number>();
    for (const asset of renderableAssets) {
      assetCountByEntity.set(asset.entityId, (assetCountByEntity.get(asset.entityId) ?? 0) + 1);
    }
    const imageReferenceEntityIds = getImageReferenceEntityIds(entities, assets);
    const entityById = indexById(entities, (entity) => entity.entityId);
    const issuesByBundle = new Map<number, BundleImageIssue[]>();

    for (const bundle of bundleGroups) {
      const issues = new Map<string, BundleImageIssue>();

      for (const meta of bundle.pages) {
        const template = meta.page.workingTemplate
          ? meta.page.workingTemplate
          : resolvePageWorkingTemplate(
              meta.pageTemplate,
              meta.page.bindOverrides ??
                (meta.pageTemplate ? packOv[meta.pageTemplate.pageTemplateId] : undefined),
              undefined,
              GENERATE_TEMPLATE_OPTIONS,
            );
        if (!template) continue;

        const imageSlotIds = new Set(
          expandPageWithCardGroups(template, [])
            .slots.filter(slotNeedsEntityImage)
            .map((slot) => slot.slotId),
        );
        if (imageSlotIds.size === 0) continue;

        const entityIds = new Set<string>();
        for (const item of meta.page.items) {
          if (item.entityId && item.slotId && imageSlotIds.has(item.slotId)) {
            entityIds.add(item.entityId);
          }
        }
        if (entityIds.size === 0 && meta.page.entityId) {
          entityIds.add(meta.page.entityId);
        }

        const pageName = meta.pageTemplate?.name ?? `Trang ${meta.pageOrderInBundle + 1}`;
        for (const entityId of entityIds) {
          if ((assetCountByEntity.get(entityId) ?? 0) > 0) continue;
          const entity = entityById.get(entityId);
          if (!entity) continue;
          const issue = issues.get(entityId) ?? {
            entityId,
            entityName: entity.name,
            pageNames: [],
            partnerFlag: entity.partnerFlag,
            hasImageReference: imageReferenceEntityIds.has(entityId),
          };
          if (!issue.pageNames.includes(pageName)) issue.pageNames.push(pageName);
          issues.set(entityId, issue);
        }
      }

      if (issues.size > 0) {
        issuesByBundle.set(
          bundle.bundleIndex,
          Array.from(issues.values()).sort((a, b) => a.entityName.localeCompare(b.entityName, "vi")),
        );
      }
    }

    return issuesByBundle;
  }, [assets, bundleGroups, entities, packOv]);

  return {
    filteredPages,
    visiblePageIndexes,
    entitiesById,
    tplsById,
    getExportPageTemplate,
    bundleGroups,
    bundleImageIssuesByIndex,
  };
}
