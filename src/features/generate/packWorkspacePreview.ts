import type { Entity, PageTemplate, RenderedItem } from "@/models";
import { buildEntityBindingTargets } from "@/engines/binding/cardRepeater";
import { allocateEntityBindingsForTemplate } from "@/engines/selection/entityBindAllocator";
import {
  buildPinnedAssignmentsForTargets,
  updateStickyPinsFromAllocation,
  type StickyGroupPin,
} from "@/features/generate/stickyPreviewAllocation";

export interface PackPagePreviewAllocation {
  items: RenderedItem[];
  warnings: string[];
}

export interface PackPagePreviewConfig {
  partnerQuota: number;
  prioritizePartner: boolean;
}

/** Phân bổ preview cả pack theo thứ tự trang — dùng chung batchState để không trùng quán. */
export function allocatePackWorkspacePreview(params: {
  packPages: PageTemplate[];
  resolveEffectiveTemplate: (page: PageTemplate) => PageTemplate | undefined;
  orderedEntities: Entity[];
  pinsByPage: Map<string, Map<string, StickyGroupPin>>;
  resolvePageConfig: (page: PageTemplate) => PackPagePreviewConfig;
  previewEntity?: Entity;
}): Map<string, PackPagePreviewAllocation> {
  const {
    packPages,
    resolveEffectiveTemplate,
    orderedEntities,
    pinsByPage,
    resolvePageConfig,
    previewEntity,
  } = params;

  const batchState = {
    usedEntityIds: new Set<string>(),
    usedEntityKeys: new Set<string>(),
  };
  const results = new Map<string, PackPagePreviewAllocation>();

  for (const page of packPages) {
    const template = resolveEffectiveTemplate(page);
    if (!template || !previewEntity || orderedEntities.length === 0) {
      results.set(page.pageTemplateId, { items: [], warnings: [] });
      continue;
    }

    const config = resolvePageConfig(page);
    const targets = buildEntityBindingTargets(template, orderedEntities);
    const slotsById = new Map(template.slots.map((slot) => [slot.slotId, slot]));
    let pagePins = pinsByPage.get(page.pageTemplateId);
    if (!pagePins) {
      pagePins = new Map();
      pinsByPage.set(page.pageTemplateId, pagePins);
    }

    const pinnedAssignments = buildPinnedAssignmentsForTargets(
      targets,
      slotsById,
      pagePins,
    );
    const allocation = allocateEntityBindingsForTemplate({
      template,
      orderedEntities,
      pageOwner: undefined,
      partnerQuota: config.partnerQuota,
      prioritizePartner: config.prioritizePartner,
      batchState,
      pinnedAssignments,
    });

    pinsByPage.set(
      page.pageTemplateId,
      updateStickyPinsFromAllocation(
        targets,
        slotsById,
        allocation.items,
        pagePins,
      ),
    );
    results.set(page.pageTemplateId, {
      items: allocation.items,
      warnings: allocation.warnings,
    });
  }

  return results;
}
