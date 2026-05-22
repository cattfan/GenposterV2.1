import { describe, expect, it } from "vitest";
import type { PageTemplate } from "@/models";
import { computeCanvasScale } from "./GenerateCanvasPanel";

function makeTemplate(width: number, height: number): PageTemplate {
  return {
    pageTemplateId: "tpl-1",
    name: "test",
    type: "cover",
    canvas: { width, height },
    slots: [],
    sections: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("computeCanvasScale", () => {
  it("fills available width up to native canvas size", () => {
    const template = makeTemplate(1080, 1920);
    const scale = computeCanvasScale(template, 540);
    expect(scale).toBeCloseTo(528 / 1080, 4);
  });

  it("never scales above 1", () => {
    const template = makeTemplate(400, 400);
    expect(computeCanvasScale(template, 1200)).toBe(1);
  });
});
