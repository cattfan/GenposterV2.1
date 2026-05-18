import { describe, expect, it } from "vitest";
import type { PageTemplate, Slot } from "@/models";
import {
  createWorkingTemplate,
  resolvePageWorkingTemplate,
  GENERATE_TEMPLATE_OPTIONS,
} from "./templateState";
import {
  cloneTemplateDraftsWithSource,
  type PreviewPageDrafts,
} from "./usePreviewPageDrafts";

function makeSlot(partial: Partial<Slot> & { slotId: string; kind: Slot["kind"] }): Slot {
  return { x: 0, y: 0, width: 100, height: 40, ...partial } as Slot;
}

function makeTemplate(slots: Slot[]): PageTemplate {
  return {
    pageTemplateId: "tpl-1",
    name: "test",
    type: "cover",
    canvas: { width: 1080, height: 1080 },
    slots,
    sections: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("bind group persistence", () => {
  it("preserves bindings of group A when later writing bindings of group B", () => {
    const baseTemplate = makeTemplate([
      makeSlot({ slotId: "a-img", kind: "image", groupId: "gA" }),
      makeSlot({ slotId: "a-name", kind: "text", groupId: "gA" }),
      makeSlot({ slotId: "a-addr", kind: "text", groupId: "gA" }),
      makeSlot({ slotId: "b-img", kind: "image", groupId: "gB" }),
      makeSlot({ slotId: "b-name", kind: "text", groupId: "gB" }),
      makeSlot({ slotId: "b-addr", kind: "text", groupId: "gB" }),
    ]);

    let working = createWorkingTemplate(
      baseTemplate,
      undefined,
      baseTemplate,
      GENERATE_TEMPLATE_OPTIONS,
    );
    working = {
      ...working,
      slots: working.slots.map((slot) => {
        if (slot.slotId === "a-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "a-addr") return { ...slot, bindingPath: "entity.address" };
        if (slot.slotId === "a-img") return { ...slot, bindingPath: "asset.cover" };
        return slot;
      }),
    };

    const afterA = working;
    let workingB = createWorkingTemplate(
      baseTemplate,
      undefined,
      afterA,
      GENERATE_TEMPLATE_OPTIONS,
    );
    workingB = {
      ...workingB,
      slots: workingB.slots.map((slot) => {
        if (slot.slotId === "b-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "b-addr") return { ...slot, bindingPath: "entity.address" };
        if (slot.slotId === "b-img") return { ...slot, bindingPath: "asset.cover" };
        return slot;
      }),
    };

    const resolved = resolvePageWorkingTemplate(
      baseTemplate,
      undefined,
      workingB,
      GENERATE_TEMPLATE_OPTIONS,
    );

    expect(resolved?.slots.find((s) => s.slotId === "a-name")?.bindingPath).toBe("entity.name");
    expect(resolved?.slots.find((s) => s.slotId === "a-addr")?.bindingPath).toBe("entity.address");
    expect(resolved?.slots.find((s) => s.slotId === "a-img")?.bindingPath).toBe("asset.cover");
    expect(resolved?.slots.find((s) => s.slotId === "b-name")?.bindingPath).toBe("entity.name");
    expect(resolved?.slots.find((s) => s.slotId === "b-addr")?.bindingPath).toBe("entity.address");
    expect(resolved?.slots.find((s) => s.slotId === "b-img")?.bindingPath).toBe("asset.cover");
  });
});

describe("bind group persistence — React pipeline", () => {
  it("commit + hydrate cycle does not drop earlier bindings", () => {
    const baseTemplate = makeTemplate([
      makeSlot({ slotId: "a-name", kind: "text", groupId: "gA", x: 0, y: 0 }),
      makeSlot({ slotId: "a-addr", kind: "text", groupId: "gA", x: 0, y: 50 }),
      makeSlot({ slotId: "b-name", kind: "text", groupId: "gB", x: 200, y: 0 }),
      makeSlot({ slotId: "b-addr", kind: "text", groupId: "gB", x: 200, y: 50 }),
    ]);

    let drafts: PreviewPageDrafts = {};

    const setNoHistory = (next: PreviewPageDrafts) => {
      drafts = cloneTemplateDraftsWithSource(next, [baseTemplate]);
    };

    const commit = (updater: (prev: PreviewPageDrafts) => PreviewPageDrafts) => {
      const next = updater(drafts);
      setNoHistory(next);
    };

    // Bind group A
    commit((prev) => {
      const current = prev["tpl-1"] ?? baseTemplate;
      const next = createWorkingTemplate(current, undefined, current, GENERATE_TEMPLATE_OPTIONS);
      next.slots = next.slots.map((slot) => {
        if (slot.slotId === "a-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "a-addr") return { ...slot, bindingPath: "entity.address" };
        return slot;
      });
      return { ...prev, "tpl-1": next };
    });

    expect(drafts["tpl-1"].slots.find((s) => s.slotId === "a-name")?.bindingPath).toBe(
      "entity.name",
    );

    // Bind group B
    commit((prev) => {
      const current = prev["tpl-1"] ?? baseTemplate;
      const next = createWorkingTemplate(current, undefined, current, GENERATE_TEMPLATE_OPTIONS);
      next.slots = next.slots.map((slot) => {
        if (slot.slotId === "b-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "b-addr") return { ...slot, bindingPath: "entity.address" };
        return slot;
      });
      return { ...prev, "tpl-1": next };
    });

    const slots = drafts["tpl-1"].slots;
    expect(slots.find((s) => s.slotId === "a-name")?.bindingPath).toBe("entity.name");
    expect(slots.find((s) => s.slotId === "a-addr")?.bindingPath).toBe("entity.address");
    expect(slots.find((s) => s.slotId === "b-name")?.bindingPath).toBe("entity.name");
    expect(slots.find((s) => s.slotId === "b-addr")?.bindingPath).toBe("entity.address");
  });
});
