import type {
  Entity,
  GenerationJob,
  PackTemplate,
  PageTemplate,
  RenderedItem,
  RenderedPage,
  Slot,
} from "@/models";
import { slugify } from "@/engines/selection/generate";
import { formatTemplateDisplayName } from "@/lib/templateNames";
import { resolveTextBinding } from "@/engines/binding/dataBinding";

export interface BundlePageMeta {
  page: RenderedPage;
  pageTemplate?: PageTemplate;
  bundleIndex: number;
  bundleLabel: string;
  pageOrderInBundle: number;
  displayPageName: string;
  hasPartnerExposure: boolean;
  partnerEntityIds: string[];
  visibleEntityIds: string[];
}

export interface BundleGroup {
  bundleIndex: number;
  bundleLabel: string;
  pages: BundlePageMeta[];
}

function getBundleIndex(pageIndex: number, bundleSize: number, totalPages: number): number {
  if (bundleSize <= 0) return 1;
  if (totalPages <= bundleSize) return 1;
  return Math.floor(pageIndex / bundleSize) + 1;
}

// Một item được tính là "trang đang dùng entity Y" nếu slot tương ứng thật
// sự render ra dữ liệu của Y (text resolve non-empty, hoặc image resolve được
// asset). Allocator có thể gán `entityId` cho item để cấp context cho cluster
// — nhưng không phải lúc nào value cũng hiển thị (vd: slot dùng staticText,
// hoặc bindingPath trỏ vào field entity không có giá trị). UI badge "Đối tác"
// và export (caption / doitac.xlsx) đều phải dùng định nghĩa này, tránh
// trường hợp "tự tạo data" cho user.
function isItemVisible(
  item: RenderedItem,
  slot: Slot | undefined,
  entity: Entity | undefined,
): boolean {
  if (!slot || !entity) return false;
  if (slot.kind === "image" || slot.kind === "shape") {
    return !!item.assetId;
  }
  if (slot.kind === "text") {
    if (!slot.bindingPath) return false;
    const value = resolveTextBinding(slot.bindingPath, entity, undefined);
    return typeof value === "string" && value.trim().length > 0;
  }
  return false;
}

export function collectVisibleEntityIds(
  page: RenderedPage,
  pageTemplate: PageTemplate | undefined,
  entitiesById: Map<string, Entity>,
): string[] {
  const slots = pageTemplate?.slots ?? page.workingTemplate?.slots ?? [];
  if (slots.length === 0) return [];
  const slotById = new Map(slots.map((s) => [s.slotId, s]));
  const visible = new Set<string>();
  for (const item of page.items) {
    if (!item.entityId) continue;
    if (visible.has(item.entityId)) continue;
    const entity = entitiesById.get(item.entityId);
    if (!entity) continue;
    const slot = item.slotId ? slotById.get(item.slotId) : undefined;
    if (isItemVisible(item, slot, entity)) visible.add(item.entityId);
  }
  return Array.from(visible);
}

export function buildBundlePageMeta(
  job: GenerationJob,
  pack: PackTemplate,
  pageTemplates: PageTemplate[],
  entities: Entity[],
): BundlePageMeta[] {
  const templateMap = new Map(pageTemplates.map((template) => [template.pageTemplateId, template]));
  const entityMap = new Map(entities.map((entity) => [entity.entityId, entity]));
  const bundleSize = Math.max(1, pack.orderedPages.length);

  return job.pages.map((page, index) => {
    const pageTemplate = page.workingTemplate ?? templateMap.get(page.pageTemplateId);
    const bundleIndex = getBundleIndex(index, bundleSize, job.pages.length);
    const bundleLabel = `Bộ ${bundleIndex}`;
    const pageOrderInBundle = index % bundleSize;

    const visibleEntityIds = collectVisibleEntityIds(page, pageTemplate, entityMap);
    const partnerEntityIds = visibleEntityIds.filter((id) => {
      const entity = entityMap.get(id);
      return !!entity?.partnerFlag;
    });

    return {
      page,
      pageTemplate,
      bundleIndex,
      bundleLabel,
      pageOrderInBundle,
      displayPageName: `${slugify(formatTemplateDisplayName(pack.name, "bo-khuon"))}-${slugify(formatTemplateDisplayName(pageTemplate?.name ?? page.pageTemplateId, "trang"))}-bo${bundleIndex}.png`,
      hasPartnerExposure: partnerEntityIds.length > 0,
      partnerEntityIds,
      visibleEntityIds,
    };
  });
}

export function buildBundleGroups(
  job: GenerationJob,
  pack: PackTemplate,
  pageTemplates: PageTemplate[],
  entities: Entity[],
): BundleGroup[] {
  const pages = buildBundlePageMeta(job, pack, pageTemplates, entities);
  const groups = new Map<number, BundleGroup>();

  for (const page of pages) {
    const group = groups.get(page.bundleIndex) ?? {
      bundleIndex: page.bundleIndex,
      bundleLabel: page.bundleLabel,
      pages: [],
    };
    group.pages.push(page);
    groups.set(page.bundleIndex, group);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    pages: group.pages
      .slice()
      .sort(
        (a, b) => a.pageOrderInBundle - b.pageOrderInBundle || a.page.pageIndex - b.page.pageIndex,
      ),
  }));
}
