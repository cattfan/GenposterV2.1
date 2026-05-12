import { describe, expect, it } from "vitest";
import type { Entity } from "@/models";
import { mergeBindingSources, pickAssetsForSource, pickEntitiesForSource } from "./sourceContext";
import {
  buildEntityListBindingPath,
  resolveEntityListBinding,
  resolveTextBinding,
  shapeBorderRadius,
} from "./dataBinding";

const entities = [
  {
    entityId: "e1",
    name: "Cafe A",
    partnerFlag: false,
    partnerPriority: 0,
    partnerType: "none" as const,
    campaignTags: [],
    seoKeywords: [],
    status: "active" as const,
    sheetName: "sheet-a",
    metadata: { address: "A1" },
  },
  {
    entityId: "e2",
    name: "Cafe B",
    partnerFlag: false,
    partnerPriority: 0,
    partnerType: "none" as const,
    campaignTags: [],
    seoKeywords: [],
    status: "active" as const,
    sheetName: "sheet-b",
    metadata: { address: "B1" },
  },
];

const assets = [
  {
    assetId: "a1",
    entityId: "e1",
    sourceType: "local" as const,
    sourceValue: "idb://blob-1",
    blobKey: "blob-1",
    role: "generic" as const,
    qualityScore: 80,
    isCover: false,
    status: "ok" as const,
  },
  {
    assetId: "a2",
    entityId: "e2",
    sourceType: "local" as const,
    sourceValue: "idb://blob-2",
    blobKey: "blob-2",
    role: "generic" as const,
    qualityScore: 80,
    isCover: false,
    status: "ok" as const,
  },
];

const entityBase = {
  partnerFlag: false,
  partnerPriority: 0,
  partnerType: "none",
  campaignTags: [],
  seoKeywords: [],
  status: "active",
  sheetName: "Quan_an",
} satisfies Omit<Entity, "entityId" | "name" | "address">;

function entity(entityId: string, name: string, address: string): Entity {
  return { ...entityBase, entityId, name, address };
}

describe("binding sources", () => {
  it("filters entities and assets by source descriptor", () => {
    const source = { id: "s1", kind: "sheet" as const, label: "Sheet A", sheetName: "sheet-a" };
    expect(pickEntitiesForSource(source, { entities, assets })).toHaveLength(1);
    expect(pickAssetsForSource(source, { entities, assets })).toHaveLength(2);
  });

  it("resolves text binding with scoped entity source", () => {
    const source = { id: "s1", kind: "sheet" as const, label: "Sheet B", sheetName: "sheet-b" };
    const text = resolveTextBinding(
      "entity.scoped:" +
        encodeURIComponent(JSON.stringify({ path: "entity.address", sheetName: "sheet-b" })),
      entities[0],
      "fallback",
      entities,
      { entities, source },
    );

    expect(text).toBe("B1");
  });

  it("merges primary and secondary sources", () => {
    const merged = mergeBindingSources(
      { id: "p", kind: "page_primary", label: "Primary" },
      [{ id: "s", kind: "sheet", label: "Sheet" }],
    );
    expect(merged.primary?.id).toBe("p");
    expect(merged.secondary).toHaveLength(1);
  });
});

describe("resolveEntityListBinding", () => {
  it("deduplicates equivalent venue names inside a generated text list", () => {
    const binding = buildEntityListBindingPath({
      fields: ["entity.name"],
      count: 4,
      bullet: "none",
      separator: " - ",
      randomize: false,
      prioritizePartner: false,
      seed: "test",
    });

    const text = resolveEntityListBinding(
      binding,
      [
        entity("e1", "Tiem nuong Hoang Hon", "Hem 118 Doi Da Chien"),
        entity("e2", "Tiem-nuong   Hoang Hon", "Duong Hoa Cam Tu Cau"),
        entity("e3", "Tiem nuong Xom Leo", "60 Ly Tu Trong"),
      ],
      "",
    );

    expect(text.split("\n")).toEqual(["Tiem nuong Hoang Hon", "Tiem nuong Xom Leo"]);
  });
});

describe("shapeBorderRadius", () => {
  it("keeps badge pill by default but respects manual corner radius", () => {
    expect(shapeBorderRadius("badge", undefined, 1)).toBe(9999);
    expect(shapeBorderRadius("badge", 18, 2)).toBe(36);
  });
});
