import { describe, expect, it } from "vitest";
import type { PageTemplate, Slot } from "@/models";
import {
  applyGroupSourceConfigsToTemplate,
  extractGroupSourceConfigs,
  mergeGroupSourceConfigs,
  resolveSharedClusterSourceDisplay,
} from "./groupSourceConfig";

function slot(partial: Partial<Slot> & { slotId: string }): Slot {
  return {
    kind: "text",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...partial,
  } as Slot;
}

const template: PageTemplate = {
  pageTemplateId: "p1",
  name: "page",
  type: "cover",
  canvas: { width: 1080, height: 1080 },
  sections: [],
  slots: [
    slot({
      slotId: "name",
      groupId: "gr1",
      bindingPath: "entity.name",
      dataSourceConfig: { selectedSheet: "Sheet A" },
    }),
    slot({
      slotId: "img",
      kind: "image",
      groupId: "gr1",
      bindingPath: "asset.random",
    }),
  ],
  createdAt: 0,
  updatedAt: 0,
};

const isBindable = () => true;

describe("groupSourceConfig", () => {
  it("extracts merged config from cluster slots", () => {
    expect(extractGroupSourceConfigs(template, isBindable)).toEqual({
      "gr:gr1": { selectedSheet: "Sheet A" },
    });
  });

  it("applyGroupSourceConfigs syncs all slots in cluster", () => {
    const next = applyGroupSourceConfigsToTemplate(
      template,
      { "gr:gr1": { selectedSheet: "Sheet B", filterMoHinh: "M1" } },
      isBindable,
    );
    const img = next.slots.find((item) => item.slotId === "img");
    expect(img?.dataSourceConfig).toEqual({
      selectedSheet: "Sheet B",
      filterMoHinh: "M1",
    });
  });

  it("resolveSharedClusterSourceDisplay ignores image slot without config", () => {
    const display = resolveSharedClusterSourceDisplay(template.slots, "__all__");
    expect(display.selectedSheet).toBe("Sheet A");
  });

  it("mergeGroupSourceConfigs prefers defined values", () => {
    expect(
      mergeGroupSourceConfigs([
        { selectedSheet: "A" },
        undefined,
        { filterMoHinh: "M1" },
      ]),
    ).toEqual({ selectedSheet: "A", filterMoHinh: "M1" });
  });
});
