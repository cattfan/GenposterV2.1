import { describe, expect, it } from "vitest";

import type { PageTemplate } from "@/models";
import { duplicatePageTemplate } from "./packTemplateUtils";

function basePage(): PageTemplate {
  return {
    pageTemplateId: "page-1",
    name: "Page 1",
    type: "cover",
    canvas: { width: 1080, height: 1350, background: "#fff" },
    slots: [
      {
        slotId: "group-1",
        kind: "group",
        x: 100,
        y: 100,
        width: 300,
        height: 240,
        zIndex: 10,
      },
      {
        slotId: "image-1",
        kind: "image",
        groupId: "group-1",
        dataGroupId: "data-group-1",
        x: 110,
        y: 110,
        width: 160,
        height: 120,
      },
      {
        slotId: "text-1",
        kind: "text",
        groupId: "group-1",
        dataGroupId: "data-group-1",
        x: 280,
        y: 120,
        width: 120,
        height: 40,
        staticText: "Ten",
      },
    ],
    sections: [],
    cardGroups: [{ groupId: "group-1", repeatCount: 3, gap: 12, direction: "vertical" }],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("duplicatePageTemplate", () => {
  it("remaps group roots, children, data groups and card group references", () => {
    const duplicated = duplicatePageTemplate(basePage());
    const group = duplicated.slots.find((slot) => slot.kind === "group");
    const image = duplicated.slots.find((slot) => slot.kind === "image");
    const text = duplicated.slots.find((slot) => slot.kind === "text");

    expect(duplicated.pageTemplateId).not.toBe("page-1");
    expect(group?.slotId).toBeTruthy();
    expect(group?.slotId).not.toBe("group-1");
    expect(image?.groupId).toBe(group?.slotId);
    expect(text?.groupId).toBe(group?.slotId);
    expect(image?.dataGroupId).toBe(text?.dataGroupId);
    expect(image?.dataGroupId).not.toBe("data-group-1");
    expect(duplicated.cardGroups?.[0]?.groupId).toBe(group?.slotId);
  });
});
