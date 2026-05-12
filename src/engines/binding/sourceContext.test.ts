import { describe, expect, it } from "vitest";
import {
  mergeBindingSources,
  resolveAssetsFromContext,
  resolveEntitiesFromContext,
} from "./sourceContext";
import type { Asset, Entity } from "@/models";

const entities = [
  {
    entityId: "e1",
    name: "Entity 1",
    sheetName: "sheet-a",
    partnerFlag: false,
    partnerPriority: 0,
    partnerType: "none",
    campaignTags: [],
    seoKeywords: [],
    status: "active",
  },
  {
    entityId: "e2",
    name: "Entity 2",
    sheetName: "sheet-b",
    partnerFlag: false,
    partnerPriority: 0,
    partnerType: "none",
    campaignTags: [],
    seoKeywords: [],
    status: "active",
  },
] satisfies Entity[];

const assets = [
  {
    assetId: "a1",
    entityId: "e1",
    sourceType: "local",
    sourceValue: "/a1.jpg",
    role: "generic",
    qualityScore: 100,
    isCover: false,
    status: "ok",
  },
  {
    assetId: "a2",
    entityId: "e2",
    sourceType: "local",
    sourceValue: "/a2.jpg",
    role: "generic",
    qualityScore: 100,
    isCover: false,
    status: "ok",
  },
] satisfies Asset[];

describe("sourceContext", () => {
  it("falls back to secondary source when primary is empty", () => {
    const context = mergeBindingSources(
      { id: "p", kind: "sheet", label: "Primary", entityIds: [] },
      [{ id: "s", kind: "sheet", label: "Secondary", sheetName: "sheet-b" }],
    );

    expect(resolveEntitiesFromContext(context, { entities, assets })).toHaveLength(2);
    expect(resolveAssetsFromContext(context, { entities, assets })).toHaveLength(2);
  });
});
