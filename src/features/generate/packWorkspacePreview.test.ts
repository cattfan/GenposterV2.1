import { describe, expect, it } from "vitest";
import type { Entity, PageTemplate } from "@/models";
import { allocatePackWorkspacePreview } from "./packWorkspacePreview";

function page(id: string, slotIds: string[]): PageTemplate {
  return {
    pageTemplateId: id,
    name: id,
    slots: slotIds.map((slotId, index) => ({
      slotId,
      kind: "text",
      x: 0,
      y: index * 20,
      width: 100,
      height: 16,
      bindingPath: "entity.name",
    })),
    canvas: { width: 400, height: 800 },
  } as PageTemplate;
}

describe("allocatePackWorkspacePreview", () => {
  it("does not reuse the same entity across pages in pack order", () => {
    const entities: Entity[] = [
      { entityId: "e1", name: "Mê Lá", status: "active", sheetName: "S1" } as Entity,
      { entityId: "e2", name: "Quán B", status: "active", sheetName: "S1" } as Entity,
      { entityId: "e3", name: "Quán C", status: "active", sheetName: "S1" } as Entity,
    ];
    const packPages = [page("p2", ["s1"]), page("p3", ["s2"])];
    const pinsByPage = new Map();

    const results = allocatePackWorkspacePreview({
      packPages,
      resolveEffectiveTemplate: (template) => template,
      orderedEntities: entities,
      pinsByPage,
      resolvePageConfig: () => ({ partnerQuota: 0, prioritizePartner: false }),
      previewEntity: entities[0],
    });

    const page2Entity = results.get("p2")?.items[0]?.entityId;
    const page3Entity = results.get("p3")?.items[0]?.entityId;

    expect(page2Entity).toBeTruthy();
    expect(page3Entity).toBeTruthy();
    expect(page2Entity).not.toBe(page3Entity);
  });
});
