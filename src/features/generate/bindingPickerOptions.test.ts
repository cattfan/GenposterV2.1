import { describe, expect, it } from "vitest";
import type { Entity } from "@/models";
import {
  buildImageBindingPickerOptions,
  buildTextBindingPickerOptions,
  formatBindingPickerLabel,
} from "./bindingPickerOptions";

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    entityId: "e-1",
    name: "Phúc Long Coffee",
    address: "123 Nguyễn Huệ",
    phone: "0901234567",
    partnerFlag: false,
    partnerPriority: 0,
    partnerType: "none",
    campaignTags: [],
    seoKeywords: [],
    status: "active",
    metadata: { Loai_dich_vu: "Cafe specialty" },
    ...overrides,
  } as Entity;
}

describe("bindingPickerOptions", () => {
  it("does not include metadata fields in text binding options", () => {
    const options = buildTextBindingPickerOptions({
      entities: [makeEntity()],
    });

    expect(options.some((option) => option.value.startsWith("entity.metadata."))).toBe(false);
  });

  it("formats label with sample preview", () => {
    expect(
      formatBindingPickerLabel({
        value: "entity.name",
        label: "Tên",
        sample: "Phúc Long Coffee",
        group: "Dữ liệu",
      }),
    ).toBe("Tên · Phúc Long Coffee");
  });

  it("builds image options with asset count sample", () => {
    const options = buildImageBindingPickerOptions({
      entities: [makeEntity()],
      assets: [
        { entityId: "e-1" },
        { entityId: "e-1" },
        { entityId: "e-2" },
      ],
    });

    expect(options.find((option) => option.value === "asset.random")?.sample).toBe("2 ảnh");
  });
});
