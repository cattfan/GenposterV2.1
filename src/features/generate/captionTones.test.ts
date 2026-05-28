// Tests cho captionTones — đảm bảo picker deterministic, varied và
// buildBundleContext extract đúng thông tin từ pages + entities.

import { describe, expect, it } from "vitest";
import type { Entity } from "@/models";
import {
  CAPTION_TONES,
  type CaptionTone,
  buildBundleContext,
  pickCaptionTone,
  renderFallbackCaption,
} from "./captionTones";

function makeEntity(partial: Partial<Entity> & Pick<Entity, "entityId" | "name">): Entity {
  return {
    partnerFlag: false,
    partnerPriority: 0,
    partnerType: "none",
    campaignTags: [],
    seoKeywords: [],
    status: "active",
    ...partial,
  };
}

describe("CAPTION_TONES", () => {
  it("exposes at least 6 distinct tones with required fields", () => {
    expect(CAPTION_TONES.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(CAPTION_TONES.map((t) => t.id));
    expect(ids.size).toBe(CAPTION_TONES.length);
    for (const tone of CAPTION_TONES) {
      expect(tone.label.length).toBeGreaterThan(0);
      expect(tone.styleHint.length).toBeGreaterThan(0);
      expect(tone.fallbackHooks.length).toBeGreaterThan(0);
      expect(typeof tone.fallbackBody).toBe("function");
    }
  });

  it("fallback hooks are UPPERCASE and respect the 90-char hook cap", () => {
    for (const tone of CAPTION_TONES) {
      for (const hook of tone.fallbackHooks) {
        // Emojis hợp lệ — chỉ so sánh phần chữ cái (Đà Lạt → ĐÀ LẠT).
        expect(hook).toBe(hook.toUpperCase());
        expect(hook.length).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe("pickCaptionTone", () => {
  it("is deterministic for same (bundleIndex, seedKey) pair", () => {
    const a = pickCaptionTone(0, "3N2D Đà Lạt");
    const b = pickCaptionTone(0, "3N2D Đà Lạt");
    expect(a.id).toBe(b.id);
  });

  it("picks different tones for sequential bundle indices in a typical pack", () => {
    const seedKey = "Da Lat Pack";
    const picks = [0, 1, 2, 3, 4].map((i) => pickCaptionTone(i, seedKey).id);
    const unique = new Set(picks);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it("returns a valid tone for empty seedKey", () => {
    const tone = pickCaptionTone(0, "");
    expect(CAPTION_TONES.find((t) => t.id === tone.id)).toBeDefined();
  });

  it("always returns one of CAPTION_TONES", () => {
    for (let i = 0; i < 20; i++) {
      const tone = pickCaptionTone(i, `seed-${i}`);
      expect(CAPTION_TONES.find((t) => t.id === tone.id)).toBeDefined();
    }
  });
});

describe("buildBundleContext", () => {
  const entities = [
    makeEntity({
      entityId: "e1",
      name: "Mê Lá",
      categoryMain: "cafe",
      style: "vintage",
      partnerFlag: true,
    }),
    makeEntity({
      entityId: "e2",
      name: "Tiệm Chaiko",
      categoryMain: "cafe",
      style: "trendy",
    }),
    makeEntity({
      entityId: "e3",
      name: "Hanna Land",
      categoryMain: "checkin",
      style: "vintage",
      partnerFlag: true,
    }),
    makeEntity({
      entityId: "e4",
      name: "Bình Minh Ơi",
      categoryMain: "quan_an",
      style: "vintage",
    }),
  ];

  it("aggregates entity names + counts + partner count", () => {
    const ctx = buildBundleContext({
      packName: "3N2D Đà Lạt",
      bundleLabel: "Bộ 1",
      pages: [
        { entityId: "e1", pageName: "Bìa" },
        { entityId: "e2", pageName: "Ngày 1" },
        { entityId: "e3", pageName: "Tiện ích" },
      ],
      entities,
    });
    expect(ctx.packName).toBe("3N2D Đà Lạt");
    expect(ctx.bundleLabel).toBe("Bộ 1");
    expect(ctx.entityCount).toBe(3);
    expect(ctx.partnerCount).toBe(2);
    expect(ctx.pageNames).toEqual(["Bìa", "Ngày 1", "Tiện ích"]);
    expect(ctx.entities.map((e) => e.name)).toEqual(["Mê Lá", "Tiệm Chaiko", "Hanna Land"]);
  });

  it("returns top main categories sorted by frequency", () => {
    const ctx = buildBundleContext({
      packName: "Pack",
      bundleLabel: "Bộ 1",
      pages: [
        { entityId: "e1" },
        { entityId: "e2" },
        { entityId: "e3" },
        { entityId: "e4" },
      ],
      entities,
    });
    expect(ctx.mainCategories[0]).toBe("cafe");
    expect(ctx.mainCategories).toContain("checkin");
    expect(ctx.mainCategories).toContain("quan_an");
  });

  it("returns top styles sorted by frequency", () => {
    const ctx = buildBundleContext({
      packName: "Pack",
      bundleLabel: "Bộ 1",
      pages: [{ entityId: "e1" }, { entityId: "e3" }, { entityId: "e4" }],
      entities,
    });
    expect(ctx.styles[0]).toBe("vintage");
  });

  it("dedupes entities when same entityId appears across pages/items", () => {
    const ctx = buildBundleContext({
      packName: "Pack",
      bundleLabel: "Bộ 1",
      pages: [
        { entityId: "e1" },
        { entityId: "e1", items: [{ entityId: "e1" } as never] },
        { entityId: "e2" },
      ],
      entities,
    });
    expect(ctx.entityCount).toBe(2);
  });

  it("handles empty pages gracefully", () => {
    const ctx = buildBundleContext({
      packName: "Pack",
      bundleLabel: "Bộ 1",
      pages: [],
      entities,
    });
    expect(ctx.entityCount).toBe(0);
    expect(ctx.partnerCount).toBe(0);
    expect(ctx.mainCategories).toEqual([]);
    expect(ctx.styles).toEqual([]);
  });
});

describe("renderFallbackCaption", () => {
  const ctx = {
    packName: "3N2D Đà Lạt",
    bundleLabel: "Bộ 1",
    pageNames: ["Bìa", "Ngày 1"],
    entityCount: 4,
    partnerCount: 2,
    mainCategories: ["cafe", "quan_an"],
    styles: ["vintage"],
    entities: [
      { name: "Mê Lá" },
      { name: "Tiệm Chaiko" },
      { name: "Hanna Land" },
      { name: "Bình Minh Ơi" },
    ],
  };

  it("returns a CaptionDraft with non-empty hook, body, hashtags", () => {
    const tone: CaptionTone = CAPTION_TONES[0];
    const draft = renderFallbackCaption(tone, ctx);
    expect(draft.hook.length).toBeGreaterThan(0);
    expect(draft.body.length).toBeGreaterThan(0);
    expect(draft.hashtags.length).toBeGreaterThanOrEqual(3);
  });

  it("hashtags always start with the SEO core (riviudalat, dalat, dalatreview)", () => {
    const tone = CAPTION_TONES[0];
    const draft = renderFallbackCaption(tone, ctx);
    expect(draft.hashtags[0]).toBe("#riviudalat");
    expect(draft.hashtags[1]).toBe("#dalat");
    expect(draft.hashtags[2]).toBe("#dalatreview");
  });

  it("body uses mood/category instead of entity names", () => {
    const tone = CAPTION_TONES[0];
    const draft = renderFallbackCaption(tone, ctx);
    // Fallback mới không bám tên đối tác — dùng mood từ category/style
    expect(draft.body).toMatch(/cafe|chill|Đà Lạt|vibe|mê|đi/i);
    // Không chứa tên entity cụ thể
    expect(draft.body).not.toMatch(/Mê Lá|Tiệm Chaiko|Hanna Land|Bình Minh Ơi/);
  });

  it("works with empty entities (no crash, generic body)", () => {
    const tone = CAPTION_TONES[0];
    const draft = renderFallbackCaption(tone, {
      ...ctx,
      entityCount: 0,
      entities: [],
      mainCategories: [],
      styles: [],
    });
    expect(draft.hook.length).toBeGreaterThan(0);
    expect(draft.body.length).toBeGreaterThan(0);
  });
});
