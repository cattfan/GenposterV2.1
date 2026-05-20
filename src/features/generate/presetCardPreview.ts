import type { Entity, PageTemplate, RenderedItem } from "@/models";
import { allocatePackWorkspacePreview } from "@/features/generate/packWorkspacePreview";

export interface PresetCardPagePreviewContext {
  entity?: Entity;
  entityPool: Entity[];
  slotItems: RenderedItem[];
}

/** Preview thumbnail trên thẻ khuôn — cùng allocator pack-order như workspace. */
export function buildPresetCardPreviewContexts(params: {
  packPages: PageTemplate[];
  resolveStoredTemplate: (page: PageTemplate) => PageTemplate | undefined;
  orderedEntities: Entity[];
  previewEntity?: Entity;
  resolvePageConfig: (page: PageTemplate) => {
    partnerQuota: number;
    prioritizePartner: boolean;
  };
}): Map<string, PresetCardPagePreviewContext> {
  const {
    packPages,
    resolveStoredTemplate,
    orderedEntities,
    previewEntity,
    resolvePageConfig,
  } = params;

  const map = new Map<string, PresetCardPagePreviewContext>();
  if (packPages.length === 0 || !previewEntity || orderedEntities.length === 0) {
    return map;
  }

  const allocations = allocatePackWorkspacePreview({
    packPages,
    resolveEffectiveTemplate: resolveStoredTemplate,
    orderedEntities,
    pinsByPage: new Map(),
    resolvePageConfig,
    previewEntity,
  });

  const entityById = new Map(orderedEntities.map((entity) => [entity.entityId, entity]));
  for (const page of packPages) {
    const slotItems = allocations.get(page.pageTemplateId)?.items ?? [];
    const firstEntityId = slotItems.find((item) => item.entityId)?.entityId;
    map.set(page.pageTemplateId, {
      entity: firstEntityId
        ? (entityById.get(firstEntityId) ?? previewEntity)
        : previewEntity,
      entityPool: orderedEntities,
      slotItems,
    });
  }

  return map;
}
