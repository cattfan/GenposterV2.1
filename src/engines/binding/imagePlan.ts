// Plan ảnh cho cả 1 page: đảm bảo các block ảnh/shape không bị trùng asset.

import type { Asset, AssetRole, Entity, PageTemplate, Slot } from "@/models";

export interface PlannedImage {
  src: string;
  assetId: string;
  entityId: string;
  fallback?: boolean;
}

export type SlotImagePlan = Map<string, PlannedImage>;

function isImageBindingSlot(slot: Slot): boolean {
  return (
    (slot.kind === "image" || slot.kind === "shape") &&
    !!slot.bindingPath &&
    slot.bindingPath.startsWith("asset.")
  );
}

function pickBest(pool: Asset[]): Asset | undefined {
  if (pool.length === 0) return undefined;
  return pool.slice().sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))[0];
}

function buildImagePlanForSlots(
  slots: Slot[],
  resolveEntity: (slot: Slot) => Entity | undefined,
  assets: Asset[],
): SlotImagePlan {
  const plan: SlotImagePlan = new Map();
  const usedAssetIdsByEntity = new Map<string, Set<string>>();

  const bindableSlots = slots
    .filter(isImageBindingSlot)
    .slice()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.slotId.localeCompare(b.slotId));

  for (const slot of bindableSlots) {
    const entity = resolveEntity(slot);
    if (!entity) continue;

    const pool = assets.filter((asset) => asset.entityId === entity.entityId);
    if (pool.length === 0) continue;

    const usedAssetIds =
      usedAssetIdsByEntity.get(entity.entityId) ?? new Set<string>();
    usedAssetIdsByEntity.set(entity.entityId, usedAssetIds);

    const bindingPath = slot.bindingPath!;
    let chosen: Asset | undefined;
    let fallback = false;

    if (bindingPath === "asset.cover") {
      const cover = pool.find((asset) => asset.isCover) ?? pool.find((asset) => asset.role === "cover");
      if (cover && !usedAssetIds.has(cover.assetId)) {
        chosen = cover;
      } else {
        const free = pool.filter((asset) => !usedAssetIds.has(asset.assetId));
        chosen = pickBest(free);
        if (!chosen) {
          chosen = cover ?? pool[0];
          fallback = true;
        }
      }
    } else if (bindingPath.startsWith("asset.byRole:")) {
      const role = bindingPath.slice("asset.byRole:".length) as AssetRole;
      const sameRoleFree = pool.filter(
        (asset) => asset.role === role && !usedAssetIds.has(asset.assetId),
      );
      chosen = pickBest(sameRoleFree);
      if (!chosen) {
        const free = pool.filter((asset) => !usedAssetIds.has(asset.assetId));
        chosen = free.find((asset) => asset.isCover) ?? pickBest(free);
        if (chosen) fallback = true;
      }
      if (!chosen) {
        chosen = pool.find((asset) => asset.role === role) ?? pool.find((asset) => asset.isCover) ?? pool[0];
        fallback = true;
      }
    }

    if (chosen) {
      usedAssetIds.add(chosen.assetId);
      plan.set(slot.slotId, {
        src: chosen.sourceValue,
        assetId: chosen.assetId,
        entityId: entity.entityId,
        fallback,
      });
    }
  }

  return plan;
}

export function buildSlotImagePlan(
  template: PageTemplate,
  entity: Entity | undefined,
  assets: Asset[],
): SlotImagePlan {
  if (!entity) return new Map();
  return buildImagePlanForSlots(template.slots, () => entity, assets);
}

export function buildExpandedSlotImagePlan(
  slots: Slot[],
  assets: Asset[],
  resolveEntity: (slot: Slot) => Entity | undefined,
): SlotImagePlan {
  return buildImagePlanForSlots(slots, resolveEntity, assets);
}
