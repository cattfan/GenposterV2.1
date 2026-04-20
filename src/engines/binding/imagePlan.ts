// Plan ảnh cho cả 1 page: đảm bảo các block ảnh/shape không bị trùng asset.
// Logic:
//  - Duyệt slot có bindingPath kiểu "asset.*" theo (zIndex asc, slotId).
//  - Với mỗi slot, ưu tiên asset chưa được dùng:
//      asset.cover           → cover của entity (nếu chưa dùng), không thì asset chưa dùng có quality cao nhất, fallback chính cover (có cảnh báo trùng).
//      asset.byRole:<role>   → đúng role chưa dùng, không thì role khác chưa dùng theo quality, fallback role gốc nếu hết.
//  - Trả Map<slotId, {src, assetId, fallback?}> để renderer dùng.
//
// Lưu ý: dùng src `idb://...` hoặc URL — caller (PageRenderer/BindCanvas) sẽ resolve qua useResolvedImageSrc.

import type { Asset, AssetRole, Entity, PageTemplate, Slot } from "@/models";

export interface PlannedImage {
  src: string;
  assetId: string;
  entityId: string;
  fallback?: boolean; // true nếu phải dùng lại ảnh đã được slot khác dùng
}

export type SlotImagePlan = Map<string, PlannedImage>;

function isImageBindingSlot(s: Slot): boolean {
  return (s.kind === "image" || s.kind === "shape") && !!s.bindingPath && s.bindingPath.startsWith("asset.");
}

function pickBest(pool: Asset[]): Asset | undefined {
  if (pool.length === 0) return undefined;
  return pool.slice().sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))[0];
}

export function buildSlotImagePlan(
  template: PageTemplate,
  entity: Entity | undefined,
  assets: Asset[],
): SlotImagePlan {
  const plan: SlotImagePlan = new Map();
  if (!entity) return plan;

  const pool = assets.filter((a) => a.entityId === entity.entityId);
  if (pool.length === 0) return plan;

  // Sort slot deterministic: zIndex asc, slotId tie-breaker
  const slots = template.slots
    .filter(isImageBindingSlot)
    .slice()
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.slotId.localeCompare(b.slotId));

  const usedAssetIds = new Set<string>();

  for (const slot of slots) {
    const bp = slot.bindingPath!;
    let chosen: Asset | undefined;
    let fallback = false;

    if (bp === "asset.cover") {
      const cover = pool.find((a) => a.isCover) ?? pool.find((a) => a.role === "cover");
      if (cover && !usedAssetIds.has(cover.assetId)) {
        chosen = cover;
      } else {
        // Lấy asset chưa dùng có quality cao nhất
        const free = pool.filter((a) => !usedAssetIds.has(a.assetId));
        chosen = pickBest(free);
        if (!chosen) {
          // Hết ảnh: fallback dùng lại cover
          chosen = cover ?? pool[0];
          fallback = true;
        }
      }
    } else if (bp.startsWith("asset.byRole:")) {
      const role = bp.slice("asset.byRole:".length) as AssetRole;
      const sameRoleFree = pool.filter((a) => a.role === role && !usedAssetIds.has(a.assetId));
      chosen = pickBest(sameRoleFree);
      if (!chosen) {
        // Role khác chưa dùng (ưu tiên cover trước)
        const free = pool.filter((a) => !usedAssetIds.has(a.assetId));
        chosen = free.find((a) => a.isCover) ?? pickBest(free);
        if (chosen) fallback = true;
      }
      if (!chosen) {
        // Hết hoàn toàn: lấy bất kỳ ảnh role gốc, hoặc cover
        chosen = pool.find((a) => a.role === role) ?? pool.find((a) => a.isCover) ?? pool[0];
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
