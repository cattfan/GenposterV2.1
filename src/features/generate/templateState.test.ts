import { describe, expect, it } from "vitest";

import type { PageTemplate } from "@/models";
import { resolvePageWorkingTemplate, restoreTemplateGroups } from "./templateState";

function pageWithMissingGroupRoot(): PageTemplate {
  return {
    pageTemplateId: "page-1",
    name: "Page 1",
    type: "cover",
    canvas: { width: 1080, height: 1350, background: "#fff" },
    slots: [
      {
        slotId: "image-1",
        kind: "image",
        groupId: "group-1",
        x: 100,
        y: 100,
        width: 160,
        height: 120,
        zIndex: 1,
      },
      {
        slotId: "name-1",
        kind: "text",
        groupId: "group-1",
        x: 280,
        y: 115,
        width: 180,
        height: 40,
        zIndex: 2,
        staticText: "Tên",
      },
    ],
    sections: [],
    cardGroups: [{ groupId: "group-1", repeatCount: 3, gap: 12, direction: "vertical" }],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("restoreTemplateGroups", () => {
  it("rebuilds a missing group slot from children that still share groupId", () => {
    const restored = restoreTemplateGroups(undefined, pageWithMissingGroupRoot());
    const group = restored.slots.find((slot) => slot.slotId === "group-1");
    const image = restored.slots.find((slot) => slot.slotId === "image-1");
    const text = restored.slots.find((slot) => slot.slotId === "name-1");

    expect(group?.kind).toBe("group");
    expect(group?.x).toBe(100);
    expect(group?.y).toBe(100);
    expect(group?.width).toBe(360);
    expect(group?.height).toBe(120);
    expect(image?.groupId).toBe("group-1");
    expect(text?.groupId).toBe("group-1");
    expect(restored.cardGroups?.[0]?.groupId).toBe("group-1");
  });

  it("clears orphan groupId when only one child points to a missing group", () => {
    const page = pageWithMissingGroupRoot();
    page.slots = [page.slots[0]];

    const restored = restoreTemplateGroups(undefined, page);

    expect(restored.slots.some((slot) => slot.kind === "group")).toBe(false);
    expect(restored.slots[0].groupId).toBeUndefined();
  });

  it("synthesizes real groups for old templates that only have visual image cards", () => {
    const page: PageTemplate = {
      pageTemplateId: "page-card",
      name: "Card page",
      type: "cover",
      canvas: { width: 1080, height: 1350, background: "#fff" },
      slots: [
        {
          slotId: "bg",
          kind: "image",
          isUploadedBackground: true,
          x: 0,
          y: 0,
          width: 1080,
          height: 1350,
        },
        {
          slotId: "image-a",
          kind: "image",
          x: 100,
          y: 100,
          width: 180,
          height: 120,
        },
        {
          slotId: "name-a",
          kind: "text",
          x: 310,
          y: 108,
          width: 160,
          height: 34,
          staticText: "T ê n",
        },
        {
          slotId: "address-a",
          kind: "text",
          x: 310,
          y: 148,
          width: 180,
          height: 34,
          staticText: "Đ ị a  c h ỉ",
        },
        {
          slotId: "image-b",
          kind: "image",
          x: 100,
          y: 340,
          width: 180,
          height: 120,
        },
        {
          slotId: "name-b",
          kind: "text",
          x: 310,
          y: 350,
          width: 160,
          height: 34,
          staticText: "Tên",
        },
      ],
      sections: [],
      createdAt: 1,
      updatedAt: 1,
    };

    const restored = restoreTemplateGroups(undefined, page);
    const imageA = restored.slots.find((slot) => slot.slotId === "image-a");
    const nameA = restored.slots.find((slot) => slot.slotId === "name-a");
    const addressA = restored.slots.find((slot) => slot.slotId === "address-a");
    const imageB = restored.slots.find((slot) => slot.slotId === "image-b");
    const groups = restored.slots.filter((slot) => slot.kind === "group");

    expect(groups).toHaveLength(2);
    expect(imageA?.groupId).toBeTruthy();
    expect(nameA?.groupId).toBe(imageA?.groupId);
    expect(addressA?.groupId).toBe(imageA?.groupId);
    expect(imageB?.groupId).toBeTruthy();
    expect(imageB?.groupId).not.toBe(imageA?.groupId);
    expect(restored.slots.find((slot) => slot.slotId === "bg")?.groupId).toBeUndefined();
  });

  it("also normalizes the effective preview template when there is no draft", () => {
    const page: PageTemplate = {
      pageTemplateId: "page-preview",
      name: "Preview page",
      type: "cover",
      canvas: { width: 1080, height: 1350, background: "#fff" },
      slots: [
        {
          slotId: "image-a",
          kind: "image",
          x: 100,
          y: 100,
          width: 180,
          height: 120,
        },
        {
          slotId: "name-a",
          kind: "text",
          x: 310,
          y: 108,
          width: 160,
          height: 34,
          staticText: "Tên",
        },
      ],
      sections: [],
      createdAt: 1,
      updatedAt: 1,
    };

    const resolved = resolvePageWorkingTemplate(page);
    const image = resolved?.slots.find((slot) => slot.slotId === "image-a");
    const text = resolved?.slots.find((slot) => slot.slotId === "name-a");

    expect(resolved?.slots.some((slot) => slot.kind === "group")).toBe(true);
    expect(image?.groupId).toBeTruthy();
    expect(text?.groupId).toBe(image?.groupId);
  });
});
