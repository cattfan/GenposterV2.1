import type { Entity, PageTemplate, RenderedItem, Slot } from "@/models";
import type { EntityBindingTarget } from "@/engines/binding/cardRepeater";

export interface StickyGroupPin {
  entityId: string;
  /** Chỉ dataSourceConfig — đổi sheet/filter thì bỏ pin; thêm trường bind thì giữ pin. */
  sourceFingerprint: string;
}

export function resolveBindingGroupKey(slots: Slot[], targetId: string): string {
  const dataGroupId = slots.find((slot) => slot.dataGroupId)?.dataGroupId;
  if (dataGroupId) return `dg:${dataGroupId}`;
  const groupId = slots.find((slot) => slot.groupId)?.groupId;
  if (groupId) return `gr:${groupId}`;
  return `t:${targetId}`;
}

/** Chỉ nguồn lọc (sheet/mô hình/phong cách) — không gồm slotId hay bindingPath. */
export function fingerprintGroupSource(slots: Slot[]): string {
  const parts = slots
    .map((slot) => JSON.stringify(slot.dataSourceConfig ?? {}))
    .sort();
  return Array.from(new Set(parts)).join("|");
}

export function buildPinnedAssignmentsForTargets(
  targets: EntityBindingTarget[],
  slotsById: Map<string, Slot>,
  pins: Map<string, StickyGroupPin>,
): Map<string, string> {
  const pinned = new Map<string, string>();
  for (const target of targets) {
    const slots = target.slotIds
      .map((slotId) => slotsById.get(slotId))
      .filter((slot): slot is Slot => !!slot);
    if (slots.length === 0) continue;
    const groupKey = resolveBindingGroupKey(slots, target.targetId);
    const pin = pins.get(groupKey);
    if (!pin) continue;
    const sourceFp = fingerprintGroupSource(slots);
    if (pin.sourceFingerprint !== sourceFp) continue;
    if (!target.candidateEntities.some((entity) => entity.entityId === pin.entityId)) continue;
    pinned.set(target.targetId, pin.entityId);
  }
  return pinned;
}

export function updateStickyPinsFromAllocation(
  targets: EntityBindingTarget[],
  slotsById: Map<string, Slot>,
  items: RenderedItem[],
  prevPins: Map<string, StickyGroupPin>,
): Map<string, StickyGroupPin> {
  const next = new Map(prevPins);
  for (const target of targets) {
    const entityId = items.find((item) =>
      item.reasonCodes?.some((code) => code === `entity_bind:${target.targetId}`),
    )?.entityId;
    if (!entityId) continue;
    const slots = target.slotIds
      .map((slotId) => slotsById.get(slotId))
      .filter((slot): slot is Slot => !!slot);
    if (slots.length === 0) continue;
    const groupKey = resolveBindingGroupKey(slots, target.targetId);
    next.set(groupKey, {
      entityId,
      sourceFingerprint: fingerprintGroupSource(slots),
    });
  }
  return next;
}

/** Entity xem trước đã gán cho slot/cụm — dùng cho panel bind, không lấy previewEntity toàn trang. */
export function resolvePreviewEntityForSlot(params: {
  slot: Slot;
  template: PageTemplate;
  slotItems: RenderedItem[];
  entities: Entity[];
  fallbackEntity?: Entity;
}): Entity | undefined {
  const { slot, template, slotItems, entities, fallbackEntity } = params;
  const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));

  const fromSlotId = (slotId: string) => {
    const entityId = slotItems.find((item) => item.slotId === slotId)?.entityId;
    return entityId ? entityById.get(entityId) : undefined;
  };

  const direct = fromSlotId(slot.slotId);
  if (direct) return direct;

  const clusterSlotIds = new Set<string>();
  for (const candidate of template.slots) {
    if (slot.dataGroupId && candidate.dataGroupId === slot.dataGroupId) {
      clusterSlotIds.add(candidate.slotId);
    } else if (slot.groupId && candidate.groupId === slot.groupId) {
      clusterSlotIds.add(candidate.slotId);
    }
  }

  if (clusterSlotIds.size > 0) {
    for (const item of slotItems) {
      if (!item.slotId || !item.entityId || !clusterSlotIds.has(item.slotId)) continue;
      const entity = entityById.get(item.entityId);
      if (entity) return entity;
    }
  }

  return fallbackEntity;
}

/** Slots trong cùng groupId visual cần dataGroupId để allocator khóa một quán. */
export function shouldAutoDataGroupVisualSlots(
  groupSlots: Slot[],
  isBindable: (slot: Slot) => boolean,
): boolean {
  const bindable = groupSlots.filter(isBindable);
  const withEntityBinding = bindable.filter(
    (slot) =>
      !!slot.bindingPath &&
      (slot.bindingPath.startsWith("entity.") || slot.bindingPath.startsWith("asset.")),
  );
  return withEntityBinding.length >= 2 && !bindable.every((slot) => slot.dataGroupId);
}
