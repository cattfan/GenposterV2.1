import { describe, expect, it } from "vitest";
import type { Entity, PageTemplate } from "@/models";
import { allocateEntityBindingsForTemplate } from "@/engines/selection/entityBindAllocator";

const baseEntity = {
  partnerFlag: false,
  partnerPriority: 0,
  partnerType: "none",
  campaignTags: [],
  seoKeywords: [],
  status: "active",
  sheetName: "Quan_an",
} satisfies Omit<Entity, "entityId" | "name" | "address">;

function entity(entityId: string, name: string, address: string): Entity {
  return {
    ...baseEntity,
    entityId,
    name,
    address,
  };
}

const template = {
  pageTemplateId: "tpl",
  name: "Trang test",
  type: "mixed",
  canvas: { width: 1080, height: 1080 },
  sections: [],
  createdAt: 1,
  updatedAt: 1,
  slots: [
    {
      slotId: "name-1",
      kind: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      bindingPath: "entity.name",
      dataGroupId: "group-1",
    },
    {
      slotId: "address-1",
      kind: "text",
      x: 0,
      y: 35,
      width: 100,
      height: 30,
      bindingPath: "entity.address",
      dataGroupId: "group-1",
    },
    {
      slotId: "name-2",
      kind: "text",
      x: 0,
      y: 120,
      width: 100,
      height: 30,
      bindingPath: "entity.name",
      dataGroupId: "group-2",
    },
    {
      slotId: "address-2",
      kind: "text",
      x: 0,
      y: 155,
      width: 100,
      height: 30,
      bindingPath: "entity.address",
      dataGroupId: "group-2",
    },
  ],
} satisfies PageTemplate;

const threeGroupTemplate = {
  ...template,
  slots: [
    ...template.slots,
    {
      slotId: "name-3",
      kind: "text",
      x: 0,
      y: 240,
      width: 100,
      height: 30,
      bindingPath: "entity.name",
      dataGroupId: "group-3",
    },
    {
      slotId: "address-3",
      kind: "text",
      x: 0,
      y: 275,
      width: 100,
      height: 30,
      bindingPath: "entity.address",
      dataGroupId: "group-3",
    },
  ],
} satisfies PageTemplate;

describe("entityBindAllocator", () => {
  it("does not assign the same venue name to multiple groups on one page", () => {
    const duplicateA = entity("e1", "Tiệm nướng Hoàng Hôn", "Hẻm 118 Đồi Dã Chiến");
    const duplicateB = entity("e2", "Tiem nuong Hoang Hon", "Đường Hoa Cẩm Tú Cầu");
    const unique = entity("e3", "Tiệm nướng Xóm Lèo", "60 Lý Tự Trọng");

    const result = allocateEntityBindingsForTemplate({
      template,
      orderedEntities: [duplicateA, duplicateB, unique],
      partnerQuota: 0,
      prioritizePartner: false,
      batchState: { usedEntityIds: new Set<string>(), usedEntityKeys: new Set<string>() },
    });

    expect(result.assignedEntities.map((item) => item.entityId)).toEqual(["e1", "e3"]);
  });

  it("leaves later groups unassigned instead of repeating a venue in the same bundle", () => {
    const duplicateA = entity("e1", "Tiệm nướng Hoàng Hôn", "Hẻm 118 Đồi Dã Chiến");
    const duplicateB = entity("e2", "Tiem nuong Hoang Hon", "Đường Hoa Cẩm Tú Cầu");
    const unique = entity("e3", "Tiệm nướng Xóm Lèo", "60 Lý Tự Trọng");

    const result = allocateEntityBindingsForTemplate({
      template: threeGroupTemplate,
      orderedEntities: [duplicateA, duplicateB, unique],
      partnerQuota: 0,
      prioritizePartner: false,
      batchState: { usedEntityIds: new Set<string>(), usedEntityKeys: new Set<string>() },
    });

    expect(result.assignedEntities.map((item) => item.entityId)).toEqual(["e1", "e3"]);
    expect(result.warnings).toContain('Page "Trang test": khong du entity de gan du lieu.');
  });
});
