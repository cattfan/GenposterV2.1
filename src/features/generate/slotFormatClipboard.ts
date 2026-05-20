import { nanoid } from "nanoid";
import type { PageTemplate, Slot } from "@/models";
import {
  collectClusterBindableSlotIds,
  mergeGroupSourceConfigs,
} from "@/features/generate/groupSourceConfig";

export type FormatSlotMode = "text" | "image";

export interface SlotFormatSnapshot {
  sourceSlotId: string;
  sourceLabel: string;
  bindMode: FormatSlotMode;
  bindingKey: string;
  bindingPath?: string;
  fieldParts?: Slot["fieldParts"];
  allowedAssetRoles?: Slot["allowedAssetRoles"];
  dataSourceConfig?: Slot["dataSourceConfig"];
  /** Khóa ổn định để tái tạo dataGroupId khi dán sang trang khác. */
  dataGroupKey?: string;
}

export interface SlotFormatClipboard {
  label: string;
  sourcePageTemplateId: string;
  sourcePageLabel: string;
  /** groupId layout — dùng để dán vào cùng cụm trên trang khác. */
  sourceVisualGroupId?: string;
  snapshots: SlotFormatSnapshot[];
}

export interface SlotFormatAssignment {
  snapshot: SlotFormatSnapshot;
  dataGroupId?: string;
}

const cloneJsonValue = <T,>(value: T | undefined): T | undefined =>
  value == null ? undefined : (JSON.parse(JSON.stringify(value)) as T);

export function sortSlotsForFormat(slots: Slot[]) {
  return slots
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x || a.slotId.localeCompare(b.slotId));
}

export function createDataGroupId() {
  return `dg_${nanoid(8)}`;
}

function resolveStableDataGroupKey(
  slot: Slot,
  dataGroupCounts: Map<string, number>,
): string | undefined {
  if (slot.groupId) return `gr:${slot.groupId}`;
  if (slot.dataGroupId && (dataGroupCounts.get(slot.dataGroupId) ?? 0) > 1) {
    return `dg:${slot.dataGroupId}`;
  }
  return undefined;
}

function resolveSingleClusterVisualGroupId(slots: Slot[]): string | undefined {
  const groupIds = new Set(slots.map((slot) => slot.groupId).filter(Boolean));
  if (groupIds.size === 1) return [...groupIds][0];
  return undefined;
}

/** Mở rộng selection sang toàn bộ khối bindable cùng cụm trên trang nguồn. */
export function expandCopySourceSlots(
  template: PageTemplate,
  selectedSlots: Slot[],
  isBindable: (slot: Slot) => boolean,
): Slot[] {
  const bindableSelected = selectedSlots.filter((slot) => isBindable(slot));
  if (bindableSelected.length === 0) return [];

  const clusterKeys = new Set<string>();
  for (const slot of bindableSelected) {
    if (slot.groupId) clusterKeys.add(`gr:${slot.groupId}`);
    else if (slot.dataGroupId) clusterKeys.add(`dg:${slot.dataGroupId}`);
  }

  if (clusterKeys.size !== 1) {
    return sortSlotsForFormat(bindableSelected);
  }

  const clusterSlotIds = collectClusterBindableSlotIds(
    template,
    bindableSelected.map((slot) => slot.slotId),
    isBindable,
  );
  return sortSlotsForFormat(template.slots.filter((slot) => clusterSlotIds.has(slot.slotId)));
}

export function buildSlotFormatClipboard(params: {
  template: PageTemplate;
  selectedSlots: Slot[];
  pageTemplateId: string;
  pageLabel: string;
  isBindable: (slot: Slot) => boolean;
  getBindMode: (slot: Slot) => FormatSlotMode | null;
  getBindingKey: (slot: Slot) => string;
  getSlotLabel: (slot: Slot, index: number) => string;
}): { clipboard: SlotFormatClipboard } | { error: string } {
  const {
    template,
    selectedSlots,
    pageTemplateId,
    pageLabel,
    isBindable,
    getBindMode,
    getBindingKey,
    getSlotLabel,
  } = params;

  const sourceSlots = expandCopySourceSlots(template, selectedSlots, isBindable);
  if (sourceSlots.length === 0) {
    return { error: "Chọn ít nhất 1 khối để sao chép liên kết dữ liệu" };
  }

  const dataGroupCounts = new Map<string, number>();
  sourceSlots.forEach((slot) => {
    if (!slot.dataGroupId) return;
    dataGroupCounts.set(slot.dataGroupId, (dataGroupCounts.get(slot.dataGroupId) ?? 0) + 1);
  });

  const mergedClusterSource = mergeGroupSourceConfigs(
    sourceSlots.map((slot) => slot.dataSourceConfig),
  );

  const snapshots = sourceSlots
    .map((slot, index): SlotFormatSnapshot | null => {
      const mode = getBindMode(slot);
      if (!mode) return null;
      return {
        sourceSlotId: slot.slotId,
        sourceLabel: getSlotLabel(slot, index),
        bindMode: mode,
        bindingKey: getBindingKey(slot),
        bindingPath: slot.bindingPath,
        fieldParts: cloneJsonValue(slot.fieldParts),
        allowedAssetRoles: cloneJsonValue(slot.allowedAssetRoles),
        dataSourceConfig: cloneJsonValue(mergedClusterSource ?? slot.dataSourceConfig),
        dataGroupKey: resolveStableDataGroupKey(slot, dataGroupCounts),
      };
    })
    .filter((snapshot): snapshot is SlotFormatSnapshot => !!snapshot);

  if (snapshots.length === 0) {
    return { error: "Khối đang chọn không có liên kết dữ liệu để sao chép" };
  }

  const sourceVisualGroupId = resolveSingleClusterVisualGroupId(sourceSlots);
  const label =
    snapshots.length === 1
      ? snapshots[0].sourceLabel
      : sourceVisualGroupId
        ? `Cụm (${snapshots.length} khối)`
        : `${snapshots.length} khối`;

  return {
    clipboard: {
      label,
      sourcePageTemplateId: pageTemplateId,
      sourcePageLabel: pageLabel,
      sourceVisualGroupId,
      snapshots,
    },
  };
}

export function resolveClusterPasteTargets(
  template: PageTemplate,
  clipboard: SlotFormatClipboard,
  isBindable: (slot: Slot) => boolean,
): Slot[] {
  if (!clipboard.sourceVisualGroupId) return [];
  return sortSlotsForFormat(
    template.slots.filter(
      (slot) => isBindable(slot) && slot.groupId === clipboard.sourceVisualGroupId,
    ),
  );
}

function assignDataGroupIds(
  assignments: Map<string, SlotFormatAssignment>,
  snapshots: SlotFormatSnapshot[],
) {
  const shouldApply = snapshots.some((snapshot) => snapshot.dataGroupKey);
  if (!shouldApply) return;

  const dataGroupIds = new Map<string, string>();
  for (const [slotId, assignment] of assignments) {
    const key = assignment.snapshot.dataGroupKey;
    if (!key) continue;
    let dataGroupId = dataGroupIds.get(key);
    if (!dataGroupId) {
      dataGroupId = createDataGroupId();
      dataGroupIds.set(key, dataGroupId);
    }
    assignments.set(slotId, { ...assignment, dataGroupId });
  }
}

/** Khớp snapshot ↔ target theo bindingKey trong cùng cụm layout. */
function buildClusterBindingKeyAssignments(
  clipboard: SlotFormatClipboard,
  targets: Slot[],
  getBindMode: (slot: Slot) => FormatSlotMode | null,
  getBindingKey: (slot: Slot) => string,
): Map<string, SlotFormatAssignment> | null {
  if (!clipboard.sourceVisualGroupId) return null;
  if (!targets.every((target) => target.groupId === clipboard.sourceVisualGroupId)) return null;

  const sortedTargets = sortSlotsForFormat(targets).filter((target) => getBindMode(target));
  const assignments = new Map<string, SlotFormatAssignment>();
  const snapshotByKey = new Map<string, SlotFormatSnapshot>();
  for (const snapshot of clipboard.snapshots) {
    if (!snapshotByKey.has(snapshot.bindingKey)) {
      snapshotByKey.set(snapshot.bindingKey, snapshot);
    }
  }

  for (const target of sortedTargets) {
    const snapshot = snapshotByKey.get(getBindingKey(target));
    if (!snapshot) return null;
    assignments.set(target.slotId, { snapshot });
  }

  if (assignments.size === 0) return null;
  assignDataGroupIds(assignments, clipboard.snapshots);
  return assignments;
}

export function buildFormatAssignments(
  clipboard: SlotFormatClipboard,
  targets: Slot[],
  getBindMode: (slot: Slot) => FormatSlotMode | null,
  getBindingKey: (slot: Slot) => string,
): Map<string, SlotFormatAssignment> {
  const clusterAssignments = buildClusterBindingKeyAssignments(
    clipboard,
    targets,
    getBindMode,
    getBindingKey,
  );
  if (clusterAssignments && clusterAssignments.size === targets.filter((t) => getBindMode(t)).length) {
    return clusterAssignments;
  }

  const sortedTargets = sortSlotsForFormat(targets).filter((target) => getBindMode(target));
  const byKey = new Map<string, SlotFormatSnapshot[]>();
  const byMode = new Map<FormatSlotMode, SlotFormatSnapshot[]>();
  for (const snapshot of clipboard.snapshots) {
    const keyGroup = byKey.get(snapshot.bindingKey) ?? [];
    keyGroup.push(snapshot);
    byKey.set(snapshot.bindingKey, keyGroup);

    const modeGroup = byMode.get(snapshot.bindMode) ?? [];
    modeGroup.push(snapshot);
    byMode.set(snapshot.bindMode, modeGroup);
  }

  if (
    clipboard.snapshots.length > 1 &&
    sortedTargets.length >= clipboard.snapshots.length &&
    sortedTargets.length % clipboard.snapshots.length === 0
  ) {
    const chunkedAssignments = new Map<string, SlotFormatAssignment>();
    const chunkSize = clipboard.snapshots.length;
    for (let start = 0; start < sortedTargets.length; start += chunkSize) {
      const chunk = sortedTargets.slice(start, start + chunkSize);
      const chunkDataGroupIds = new Map<string, string>();
      const chunkMatches = chunk.every((target, index) => {
        const snapshot = clipboard.snapshots[index];
        return snapshot && getBindMode(target) === snapshot.bindMode;
      });
      if (!chunkMatches) {
        chunkedAssignments.clear();
        break;
      }
      chunk.forEach((target, index) => {
        const snapshot = clipboard.snapshots[index];
        let dataGroupId: string | undefined;
        if (snapshot.dataGroupKey) {
          dataGroupId = chunkDataGroupIds.get(snapshot.dataGroupKey);
          if (!dataGroupId) {
            dataGroupId = createDataGroupId();
            chunkDataGroupIds.set(snapshot.dataGroupKey, dataGroupId);
          }
        }
        chunkedAssignments.set(target.slotId, { snapshot, dataGroupId });
      });
    }
    if (chunkedAssignments.size === sortedTargets.length) return chunkedAssignments;
  }

  if (sortedTargets.length === clipboard.snapshots.length) {
    const orderedAssignments = new Map<string, SlotFormatAssignment>();
    const dataGroupIds = new Map<string, string>();
    sortedTargets.forEach((target, index) => {
      const snapshot = clipboard.snapshots[index];
      if (snapshot && getBindMode(target) === snapshot.bindMode) {
        let dataGroupId: string | undefined;
        if (snapshot.dataGroupKey) {
          dataGroupId = dataGroupIds.get(snapshot.dataGroupKey);
          if (!dataGroupId) {
            dataGroupId = createDataGroupId();
            dataGroupIds.set(snapshot.dataGroupKey, dataGroupId);
          }
        }
        orderedAssignments.set(target.slotId, { snapshot, dataGroupId });
      }
    });
    if (orderedAssignments.size === sortedTargets.length) return orderedAssignments;
  }

  const keyUseCount = new Map<string, number>();
  const modeUseCount = new Map<FormatSlotMode, number>();
  const assignments = new Map<string, SlotFormatAssignment>();

  for (const target of sortedTargets) {
    const mode = getBindMode(target);
    if (!mode) continue;

    const bindingKey = getBindingKey(target);
    const exactMatches = byKey.get(bindingKey) ?? [];
    if (exactMatches.length > 0) {
      const used = keyUseCount.get(bindingKey) ?? 0;
      if (clipboard.snapshots.length > 1 && used >= exactMatches.length) continue;
      assignments.set(target.slotId, {
        snapshot: clipboard.snapshots.length === 1 ? exactMatches[0] : exactMatches[used],
      });
      keyUseCount.set(bindingKey, used + 1);
      continue;
    }

    const modeMatches = byMode.get(mode) ?? [];
    if (modeMatches.length === 0) continue;
    const used = modeUseCount.get(mode) ?? 0;
    if (clipboard.snapshots.length > 1 && used >= modeMatches.length) continue;
    assignments.set(target.slotId, {
      snapshot: clipboard.snapshots.length === 1 ? modeMatches[0] : modeMatches[used],
    });
    modeUseCount.set(mode, used + 1);
  }

  assignDataGroupIds(assignments, clipboard.snapshots);
  return assignments;
}

export function stringifyFormatValue(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function applyFormatAssignmentsToSlots(
  slots: Slot[],
  assignments: Map<string, SlotFormatAssignment>,
): { slots: Slot[]; changed: boolean } {
  const shouldApplyDataGroups = [...assignments.values()].some(
    (assignment) => assignment.dataGroupId !== undefined,
  );
  let changed = false;

  const nextSlots = slots.map((slot) => {
    const assignment = assignments.get(slot.slotId);
    if (!assignment) return slot;
    const { snapshot } = assignment;

    const nextSlot = {
      ...slot,
      bindingPath: snapshot.bindingPath,
      fieldParts: cloneJsonValue(snapshot.fieldParts),
      allowedAssetRoles: cloneJsonValue(snapshot.allowedAssetRoles),
      dataSourceConfig: cloneJsonValue(snapshot.dataSourceConfig),
      dataGroupId: shouldApplyDataGroups ? assignment.dataGroupId : slot.dataGroupId,
    };

    if (
      slot.bindingPath !== nextSlot.bindingPath ||
      stringifyFormatValue(slot.fieldParts) !== stringifyFormatValue(nextSlot.fieldParts) ||
      stringifyFormatValue(slot.allowedAssetRoles) !==
        stringifyFormatValue(nextSlot.allowedAssetRoles) ||
      stringifyFormatValue(slot.dataSourceConfig) !==
        stringifyFormatValue(nextSlot.dataSourceConfig) ||
      slot.dataGroupId !== nextSlot.dataGroupId
    ) {
      changed = true;
    }
    return nextSlot;
  });

  return { slots: nextSlots, changed };
}
