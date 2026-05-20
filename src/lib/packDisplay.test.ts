// Tests cho collectVisibleEntityIds — đảm bảo "trang dùng entity Y" được
// định nghĩa duy nhất qua việc slot có thực sự render value từ Y, không phải
// việc allocator gán `entityId` cho item làm context (fix bug 2026-05-20).

import { describe, expect, it } from "vitest";
import type { Entity, PageTemplate, RenderedPage, Slot } from "@/models";
import { collectVisibleEntityIds, groupPagesByBundle, getBundleIndex } from "./packDisplay";

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

function makeSlot(partial: Partial<Slot> & Pick<Slot, "slotId" | "kind">): Slot {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...partial,
  };
}

function makePage(items: RenderedPage["items"], pageIndex = 0): RenderedPage {
  return {
    pageIndex,
    pageFile: `page-${pageIndex}.png`,
    pageTemplateId: "tpl-1",
    state: "accepted",
    selected: true,
    healthScore: 1,
    warnings: [],
    items,
    renderedAt: Date.now(),
  };
}

function makeTemplate(slots: Slot[]): PageTemplate {
  return {
    pageTemplateId: "tpl-1",
    name: "Trang 1",
    canvas: { width: 1080, height: 1080 },
    slots,
  } as PageTemplate;
}

describe("collectVisibleEntityIds", () => {
  const meLa = makeEntity({ entityId: "e1", name: "Mê Lá", address: "Đà Lạt" });
  const empty = makeEntity({ entityId: "e2", name: "", address: "" });
  const entitiesById = new Map([
    ["e1", meLa],
    ["e2", empty],
  ]);

  it("returns empty when there are no items", () => {
    const page = makePage([]);
    const tpl = makeTemplate([]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual([]);
  });

  it("text slot with binding resolving to non-empty value counts as visible", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-name", kind: "text", bindingPath: "entity.name" }),
    ]);
    const page = makePage([{ slotId: "s-name", entityId: "e1" }]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual(["e1"]);
  });

  it("text slot with binding resolving to empty does NOT count", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-name", kind: "text", bindingPath: "entity.name" }),
    ]);
    // e2.name === "" → resolveTextBinding trả "" → không visible.
    const page = makePage([{ slotId: "s-name", entityId: "e2" }]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual([]);
  });

  it("text slot without bindingPath does NOT count (static text)", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-static", kind: "text", staticText: "Hello" }),
    ]);
    const page = makePage([{ slotId: "s-static", entityId: "e1" }]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual([]);
  });

  it("image slot with assetId counts as visible", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-img", kind: "image", bindingPath: "asset.random" }),
    ]);
    const page = makePage([{ slotId: "s-img", entityId: "e1", assetId: "asset-1" }]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual(["e1"]);
  });

  it("image slot without assetId does NOT count (placeholder)", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-img", kind: "image", bindingPath: "asset.random" }),
    ]);
    const page = makePage([{ slotId: "s-img", entityId: "e1" }]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual([]);
  });

  it("deduplicates entity across multiple visible items", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-name", kind: "text", bindingPath: "entity.name" }),
      makeSlot({ slotId: "s-addr", kind: "text", bindingPath: "entity.address" }),
    ]);
    const page = makePage([
      { slotId: "s-name", entityId: "e1" },
      { slotId: "s-addr", entityId: "e1" },
    ]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual(["e1"]);
  });

  it("falls back to page.workingTemplate.slots when explicit template missing", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-name", kind: "text", bindingPath: "entity.name" }),
    ]);
    const page = makePage([{ slotId: "s-name", entityId: "e1" }]);
    page.workingTemplate = tpl;
    expect(collectVisibleEntityIds(page, undefined, entitiesById)).toEqual(["e1"]);
  });

  it("ignores items whose entityId is missing from entitiesById", () => {
    const tpl = makeTemplate([
      makeSlot({ slotId: "s-name", kind: "text", bindingPath: "entity.name" }),
    ]);
    const page = makePage([{ slotId: "s-name", entityId: "e-missing" }]);
    expect(collectVisibleEntityIds(page, tpl, entitiesById)).toEqual([]);
  });
});

describe("getBundleIndex", () => {
  it("returns 1 when total pages fit in one bundle", () => {
    expect(getBundleIndex(3, 6, 6)).toBe(1);
  });

  it("increments bundle for later page indices", () => {
    expect(getBundleIndex(6, 6, 12)).toBe(2);
  });
});

describe("groupPagesByBundle", () => {
  const pack = {
    packTemplateId: "p1",
    name: "Pack",
    orderedPages: ["t1", "t2"],
    requiredPages: [],
    optionalPages: [],
    updatedAt: Date.now(),
    createdAt: Date.now(),
  } satisfies import("@/models").PackTemplate;

  function makeJob(pageCount: number): import("@/models").GenerationJob {
    return {
      jobId: "j1",
      packTemplateId: "p1",
      packTemplateName: "Pack",
      status: "generated",
      pages: Array.from({ length: pageCount }, (_, i) => ({
        pageIndex: i,
        pageFile: `${i}.png`,
        pageTemplateId: "t1",
        state: "accepted" as const,
        selected: true,
        healthScore: 1,
        warnings: [],
        items: [],
        renderedAt: Date.now(),
      })),
      createdAt: Date.now(),
    };
  }

  it("groups selected pages by bundle index", () => {
    const job = makeJob(4);
    const selected = [job.pages[0]!, job.pages[2]!];
    const grouped = groupPagesByBundle(selected, job, pack);
    expect(grouped.get(1)?.length).toBe(1);
    expect(grouped.get(2)?.length).toBe(1);
  });
});
