import { describe, expect, it } from "vitest";
import type { PageTemplate, Slot } from "@/models";
import {
  canResumePresetWorkspace,
  hasInMemoryWorkspaceState,
} from "./presetWorkspacePersistence";

function makeTemplate(slots: Partial<Slot>[]): PageTemplate {
  return {
    pageTemplateId: "tpl-1",
    name: "test",
    type: "cover",
    canvas: { width: 1080, height: 1080 },
    slots: slots.map(
      (partial, index) =>
        ({
          slotId: `slot-${index}`,
          kind: "text",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          ...partial,
        }) as Slot,
    ),
    sections: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("presetWorkspacePersistence", () => {
  it("hasInMemoryWorkspaceState is true when slot has dataSourceConfig", () => {
    const drafts = {
      "tpl-1": makeTemplate([
        { dataSourceConfig: { selectedSheet: "Sheet A" } },
      ]),
    };
    expect(hasInMemoryWorkspaceState(drafts, {})).toBe(true);
  });

  it("hasInMemoryWorkspaceState is false for empty drafts and overrides", () => {
    expect(hasInMemoryWorkspaceState({}, {})).toBe(false);
  });

  it("canResumePresetWorkspace when same preset was closed with memory", () => {
    const drafts = {
      "tpl-1": makeTemplate([
        { dataSourceConfig: { selectedSheet: "Sheet A" } },
      ]),
    };
    expect(
      canResumePresetWorkspace({
        presetId: "preset-a",
        selectedPresetId: "preset-a",
        lastClosedPresetId: "preset-a",
        drafts,
        packOverrides: {},
      }),
    ).toBe(true);
  });

  it("canResumePresetWorkspace is false when opening a different preset", () => {
    const drafts = {
      "tpl-1": makeTemplate([
        { dataSourceConfig: { selectedSheet: "Sheet A" } },
      ]),
    };
    expect(
      canResumePresetWorkspace({
        presetId: "preset-b",
        selectedPresetId: "preset-a",
        lastClosedPresetId: "preset-a",
        drafts,
        packOverrides: {},
      }),
    ).toBe(false);
  });
});
