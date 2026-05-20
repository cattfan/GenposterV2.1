import { describe, expect, it } from "vitest";
import type { PageTemplate, Slot } from "@/models";
import {
  buildPinnedAssignmentsForTargets,
  fingerprintGroupSource,
  resolveBindingGroupKey,
  resolvePreviewEntityForSlot,
} from "./stickyPreviewAllocation";

describe("stickyPreviewAllocation", () => {
  it("keeps pin when a new bound field is added in the same visual group", () => {
    const nameSlot: Slot = {
      slotId: "name-1",
      kind: "text",
      groupId: "gr1",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      bindingPath: "entity.name",
    } as Slot;
    const addressSlot: Slot = {
      ...nameSlot,
      slotId: "address-1",
      y: 20,
      bindingPath: "entity.address",
    };
    const slotsById = new Map([
      ["name-1", nameSlot],
      ["address-1", addressSlot],
    ]);
    const pins = new Map([
      [
        "gr:gr1",
        {
          entityId: "e1",
          sourceFingerprint: fingerprintGroupSource([nameSlot]),
        },
      ],
    ]);
    const targets = [
      {
        targetId: "gr1",
        slotIds: ["name-1", "address-1"],
        candidateEntities: [
          { entityId: "e1", name: "A", status: "active" } as never,
          { entityId: "e2", name: "B", status: "active" } as never,
        ],
      },
    ];
    const pinned = buildPinnedAssignmentsForTargets(targets, slotsById, pins);
    expect(pinned.get("gr1")).toBe("e1");
  });

  it("drops pin when group source filter changes", () => {
    const slot: Slot = {
      slotId: "name-1",
      kind: "text",
      groupId: "gr1",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      bindingPath: "entity.name",
      dataSourceConfig: { selectedSheet: "SheetA" },
    } as Slot;
    const pins = new Map([
      [
        "gr:gr1",
        {
          entityId: "e1",
          sourceFingerprint: fingerprintGroupSource([
            { ...slot, dataSourceConfig: { selectedSheet: "SheetB" } } as Slot,
          ]), // pin was SheetB, slot now SheetA
        },
      ],
    ]);
    const pinned = buildPinnedAssignmentsForTargets(
      [
        {
          targetId: "gr1",
          slotIds: ["name-1"],
          candidateEntities: [{ entityId: "e1", name: "A", status: "active" } as never],
        },
      ],
      new Map([["name-1", slot]]),
      pins,
    );
    expect(pinned.size).toBe(0);
  });

  it("resolveBindingGroupKey prefers dataGroupId over groupId", () => {
    const slots = [
      { slotId: "a", groupId: "gr1", dataGroupId: "dg1" } as Slot,
    ];
    expect(resolveBindingGroupKey(slots, "t1")).toBe("dg:dg1");
  });

  it("resolvePreviewEntityForSlot reads sibling slot in same visual group", () => {
    const template = {
      pageTemplateId: "p1",
      slots: [
        { slotId: "name-1", groupId: "gr1", kind: "text" } as Slot,
        { slotId: "img-1", groupId: "gr1", kind: "image" } as Slot,
        { slotId: "name-2", groupId: "gr2", kind: "text" } as Slot,
      ],
    } as PageTemplate;
    const entities = [
      { entityId: "e1", name: "Quan A", status: "active" } as never,
      { entityId: "e2", name: "Quan B", status: "active" } as never,
    ];
    const slotItems = [
      { slotId: "name-1", entityId: "e1", reasonCodes: ["entity_bind:gr1"] },
      { slotId: "name-2", entityId: "e2", reasonCodes: ["entity_bind:gr2"] },
    ];

    expect(
      resolvePreviewEntityForSlot({
        slot: template.slots[1],
        template,
        slotItems,
        entities,
      })?.entityId,
    ).toBe("e1");

    expect(
      resolvePreviewEntityForSlot({
        slot: template.slots[2],
        template,
        slotItems,
        entities,
      })?.entityId,
    ).toBe("e2");
  });
});
