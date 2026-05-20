import type { PageTemplate, Slot } from "@/models";

export type GroupSourceConfig = NonNullable<Slot["dataSourceConfig"]>;

const ALL_SENTINEL = "__all__";

export function resolveSlotGroupKey(slot: Slot, fallbackTargetId?: string): string {
  if (slot.dataGroupId) return `dg:${slot.dataGroupId}`;
  if (slot.groupId) return `gr:${slot.groupId}`;
  return `slot:${fallbackTargetId ?? slot.slotId}`;
}

export function normalizeGroupSourceConfig(
  config: GroupSourceConfig | undefined,
): GroupSourceConfig | undefined {
  if (!config) return undefined;
  const next: GroupSourceConfig = {};
  if (config.selectedSheet && config.selectedSheet !== ALL_SENTINEL) {
    next.selectedSheet = config.selectedSheet;
  }
  if (config.filterMoHinh && config.filterMoHinh !== ALL_SENTINEL) {
    next.filterMoHinh = config.filterMoHinh;
  }
  if (config.filterPhongCach && config.filterPhongCach !== ALL_SENTINEL) {
    next.filterPhongCach = config.filterPhongCach;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function mergeGroupSourceConfigs(
  configs: Array<GroupSourceConfig | undefined>,
): GroupSourceConfig | undefined {
  const defined = configs
    .map(normalizeGroupSourceConfig)
    .filter((item): item is GroupSourceConfig => !!item);
  if (defined.length === 0) return undefined;
  return normalizeGroupSourceConfig({
    selectedSheet: defined.find((item) => item.selectedSheet)?.selectedSheet,
    filterMoHinh: defined.find((item) => item.filterMoHinh)?.filterMoHinh,
    filterPhongCach: defined.find((item) => item.filterPhongCach)?.filterPhongCach,
  });
}

export function extractGroupSourceConfigs(
  template: PageTemplate,
  isBindable: (slot: Slot) => boolean,
): Record<string, GroupSourceConfig> {
  const groups = new Map<string, Slot[]>();
  for (const slot of template.slots) {
    if (!isBindable(slot)) continue;
    const key = resolveSlotGroupKey(slot);
    const list = groups.get(key) ?? [];
    list.push(slot);
    groups.set(key, list);
  }
  const out: Record<string, GroupSourceConfig> = {};
  for (const [key, slots] of groups) {
    const merged = mergeGroupSourceConfigs(slots.map((slot) => slot.dataSourceConfig));
    if (merged) out[key] = merged;
  }
  return out;
}

export function applyGroupSourceConfigsToTemplate(
  template: PageTemplate,
  groupConfigs: Record<string, GroupSourceConfig>,
  isBindable: (slot: Slot) => boolean,
): PageTemplate {
  let changed = false;
  const nextSlots = template.slots.map((slot) => {
    if (!isBindable(slot)) return slot;
    const key = resolveSlotGroupKey(slot);
    const config = normalizeGroupSourceConfig(groupConfigs[key]);
    if (!config) return slot;
    const current = normalizeGroupSourceConfig(slot.dataSourceConfig);
    if (JSON.stringify(current) === JSON.stringify(config)) return slot;
    changed = true;
    return { ...slot, dataSourceConfig: config };
  });
  return changed ? { ...template, slots: nextSlots } : template;
}

export function resolveSharedClusterSourceDisplay(
  slots: Slot[],
  allValue: string,
): GroupSourceConfig {
  const merged = mergeGroupSourceConfigs(slots.map((slot) => slot.dataSourceConfig));
  return {
    selectedSheet: merged?.selectedSheet ?? allValue,
    filterMoHinh: merged?.filterMoHinh ?? allValue,
    filterPhongCach: merged?.filterPhongCach ?? allValue,
  };
}

export function collectClusterBindableSlotIds(
  template: PageTemplate,
  seedSlotIds: Iterable<string>,
  isBindable: (slot: Slot) => boolean,
): Set<string> {
  const slotById = new Map(template.slots.map((slot) => [slot.slotId, slot]));
  const dataGroupIds = new Set<string>();
  const groupIds = new Set<string>();
  const targetIds = new Set<string>();

  for (const slotId of seedSlotIds) {
    const slot = slotById.get(slotId);
    if (!slot || !isBindable(slot)) continue;
    targetIds.add(slotId);
    if (slot.dataGroupId) dataGroupIds.add(slot.dataGroupId);
    if (slot.groupId) groupIds.add(slot.groupId);
  }

  for (const slot of template.slots) {
    if (!isBindable(slot)) continue;
    if (slot.dataGroupId && dataGroupIds.has(slot.dataGroupId)) {
      targetIds.add(slot.slotId);
    }
    if (slot.groupId && groupIds.has(slot.groupId)) {
      targetIds.add(slot.slotId);
    }
  }
  return targetIds;
}
