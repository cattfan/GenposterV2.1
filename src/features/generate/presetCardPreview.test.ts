import { describe, expect, it } from "vitest";
import type { Entity, PageTemplate } from "@/models";
import { buildPresetCardPreviewContexts } from "./presetCardPreview";

function page(id: string, slotId: string): PageTemplate {
  return {
    pageTemplateId: id,
    name: id,
    slots: [
      {
        slotId,
        kind: "text",
        x: 0,
        y: 0,
        width: 100,
        height: 16,
        bindingPath: "entity.name",
      },
    ],
    canvas: { width: 400, height: 800 },
  } as PageTemplate;
}

describe("buildPresetCardPreviewContexts", () => {
  it("uses pack-order allocation so page thumbnails match workspace dedup", () => {
    const entities: Entity[] = [
      { entityId: "e1", name: "Mê Lá", status: "active", sheetName: "S1" } as Entity,
      { entityId: "e2", name: "Hanna Land", status: "active", sheetName: "S1" } as Entity,
    ];
    const packPages = [page("p2", "s1"), page("p3", "s2")];

    const contexts = buildPresetCardPreviewContexts({
      packPages,
      resolveStoredTemplate: (template) => template,
      orderedEntities: entities,
      previewEntity: entities[0],
      resolvePageConfig: () => ({ partnerQuota: 0, prioritizePartner: false }),
    });

    const page2Entity = contexts.get("p2")?.slotItems[0]?.entityId;
    const page3Entity = contexts.get("p3")?.slotItems[0]?.entityId;

    expect(page2Entity).toBe("e1");
    expect(page3Entity).toBe("e2");
    expect(contexts.get("p2")?.entity?.name).toBe("Mê Lá");
    expect(contexts.get("p3")?.entity?.name).toBe("Hanna Land");
  });
});
