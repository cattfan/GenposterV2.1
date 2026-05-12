import { describe, expect, it } from "vitest";
import type { Asset, Slot } from "@/models";
import { buildExpandedSlotImagePlan } from "@/engines/binding/imagePlan";

function asset(assetId: string, sourceValue: string): Asset {
  return {
    assetId,
    entityId: `entity-${assetId}`,
    sourceType: "url",
    sourceValue,
    role: "generic",
    qualityScore: 80,
    isCover: false,
    status: "ok",
  };
}

describe("buildExpandedSlotImagePlan", () => {
  it("does not lock asset.random_global to the slot static image", () => {
    const locked = asset("a0", "https://example.com/locked.jpg");
    const pool = [
      locked,
      asset("a1", "https://example.com/one.jpg"),
      asset("a2", "https://example.com/two.jpg"),
      asset("a3", "https://example.com/three.jpg"),
    ];
    const slot: Slot = {
      slotId: "image-1",
      kind: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      staticImage: locked.sourceValue,
      bindingPath: "asset.random_global",
    };

    const picked = Array.from({ length: 20 }, (_, index) =>
      buildExpandedSlotImagePlan([slot], pool, () => undefined, `seed-${index}`).get(slot.slotId)
        ?.assetId,
    );

    expect(new Set(picked).size).toBeGreaterThan(1);
    expect(picked.some((assetId) => assetId !== locked.assetId)).toBe(true);
  });

  it("resolves asset.random_global even when no entity owns the image slot", () => {
    const pool = [asset("a1", "https://example.com/one.jpg"), asset("a2", "https://example.com/two.jpg")];
    const slot: Slot = {
      slotId: "image-1",
      kind: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      bindingPath: "asset.random_global",
    };

    const picked = buildExpandedSlotImagePlan([slot], pool, () => undefined, "seed").get(slot.slotId);

    expect(picked?.assetId).toBeTruthy();
  });

  it("does not resolve entity-scoped random image without a linked entity", () => {
    const pool = [asset("a1", "https://example.com/one.jpg")];
    const slot: Slot = {
      slotId: "image-1",
      kind: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      bindingPath: "asset.random",
    };

    const picked = buildExpandedSlotImagePlan([slot], pool, () => undefined, "seed").get(slot.slotId);

    expect(picked).toBeUndefined();
  });
});
