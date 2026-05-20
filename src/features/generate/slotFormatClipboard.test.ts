import { describe, expect, it } from "vitest";
import type { PageTemplate, Slot } from "@/models";
import {
  buildFormatAssignments,
  buildSlotFormatClipboard,
  expandCopySourceSlots,
  resolveClusterPasteTargets,
} from "./slotFormatClipboard";

function slot(partial: Partial<Slot> & Pick<Slot, "slotId">): Slot {
  return {
    kind: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    ...partial,
  } as Slot;
}

const template: PageTemplate = {
  pageTemplateId: "page-1",
  name: "Trang mẫu",
  type: "cover",
  canvas: { width: 1080, height: 1080 },
  sections: [],
  slots: [
    slot({
      slotId: "name-1",
      groupId: "gr1",
      y: 10,
      bindingPath: "entity.name",
      dataSourceConfig: { selectedSheet: "Cafe" },
    }),
    slot({
      slotId: "addr-1",
      groupId: "gr1",
      y: 20,
      bindingPath: "entity.address",
      dataSourceConfig: { selectedSheet: "Cafe" },
    }),
    slot({
      slotId: "name-2",
      groupId: "gr2",
      y: 110,
      bindingPath: "entity.name",
    }),
  ],
  createdAt: 0,
  updatedAt: 0,
};

const page2: PageTemplate = {
  ...template,
  pageTemplateId: "page-2",
  slots: template.slots.map((s) => ({ ...s, slotId: `${s.slotId}-p2` })),
};

const isBindable = () => true;
const getBindMode = (s: Slot) => (s.kind === "text" ? "text" : null) as "text" | null;
const getBindingKey = (s: Slot) =>
  s.bindingPath?.startsWith("entity.") ? `text:${s.bindingPath.split(".").pop()}` : "text:_static";
const getSlotLabel = (s: Slot) => s.slotId;

describe("slotFormatClipboard", () => {
  it("expandCopySourceSlots mở rộng sang cả cụm khi chỉ chọn một field", () => {
    const expanded = expandCopySourceSlots(template, [template.slots[1]], isBindable);
    expect(expanded.map((s) => s.slotId)).toEqual(["name-1", "addr-1"]);
  });

  it("buildSlotFormatClipboard gộp nguồn dữ liệu cụm và lưu sourceVisualGroupId", () => {
    const result = buildSlotFormatClipboard({
      template,
      selectedSlots: [template.slots[1]],
      pageTemplateId: "page-1",
      pageLabel: "Trang 1",
      isBindable,
      getBindMode,
      getBindingKey,
      getSlotLabel,
    });
    expect("clipboard" in result).toBe(true);
    if (!("clipboard" in result)) return;
    expect(result.clipboard.sourceVisualGroupId).toBe("gr1");
    expect(result.clipboard.sourcePageLabel).toBe("Trang 1");
    expect(result.clipboard.snapshots).toHaveLength(2);
    expect(result.clipboard.snapshots.every((s) => s.dataSourceConfig?.selectedSheet === "Cafe")).toBe(
      true,
    );
  });

  it("resolveClusterPasteTargets tìm cụm cùng groupId trên trang khác", () => {
    const copyResult = buildSlotFormatClipboard({
      template,
      selectedSlots: [template.slots[0]],
      pageTemplateId: "page-1",
      pageLabel: "Trang 1",
      isBindable,
      getBindMode,
      getBindingKey,
      getSlotLabel,
    });
    if (!("clipboard" in copyResult)) throw new Error("expected clipboard");
    const targets = resolveClusterPasteTargets(page2, copyResult.clipboard, isBindable);
    expect(targets.map((s) => s.slotId)).toEqual(["name-1-p2", "addr-1-p2"]);
  });

  it("buildFormatAssignments khớp theo bindingKey giữa các trang", () => {
    const copyResult = buildSlotFormatClipboard({
      template,
      selectedSlots: template.slots.filter((s) => s.groupId === "gr1"),
      pageTemplateId: "page-1",
      pageLabel: "Trang 1",
      isBindable,
      getBindMode,
      getBindingKey,
      getSlotLabel,
    });
    if (!("clipboard" in copyResult)) throw new Error("expected clipboard");
    const targets = resolveClusterPasteTargets(page2, copyResult.clipboard, isBindable);
    const assignments = buildFormatAssignments(
      copyResult.clipboard,
      targets,
      getBindMode,
      getBindingKey,
    );
    expect(assignments.size).toBe(2);
    expect(assignments.get("name-1-p2")?.snapshot.bindingPath).toBe("entity.name");
    expect(assignments.get("addr-1-p2")?.snapshot.bindingPath).toBe("entity.address");
    expect(assignments.get("name-1-p2")?.dataGroupId).toBeTruthy();
    expect(assignments.get("addr-1-p2")?.dataGroupId).toBe(assignments.get("name-1-p2")?.dataGroupId);
  });
});
