// Tests cho enforceStrictFormat + formatCaptionDraft — đảm bảo caption.txt
// luôn tuân thủ spec 2026-05-20: hook UPPERCASE ≤90 ký tự, body ≤300 ký tự,
// đúng 5 hashtag. Single point of truth: [formatCaptionDraft] wrap toàn bộ
// flow (AI parse → fallback) qua [enforceStrictFormat] trước khi serialize
// thành text.

import { describe, expect, it } from "vitest";
import { enforceStrictFormat, formatCaptionDraft } from "./exportArtifacts";

describe("enforceStrictFormat", () => {
  it("uppercases the hook", () => {
    const out = enforceStrictFormat({
      hook: "Mê quá đi mà",
      body: "Body ngắn.",
      hashtags: ["#riviudalat", "#dalat", "#dalatreview", "#a", "#b"],
    });
    expect(out.hook).toBe("MÊ QUÁ ĐI MÀ");
  });

  it("truncates hook to 90 chars (max), preferring word boundary", () => {
    const longHook = "a".repeat(120);
    const out = enforceStrictFormat({
      hook: longHook,
      body: "x",
      hashtags: ["#a", "#b", "#c", "#d", "#e"],
    });
    expect(out.hook.length).toBeLessThanOrEqual(90);
  });

  it("preserves hook word boundary when possible (no mid-word cut)", () => {
    const phrase = "PHẦN MỞ ĐẦU CỰC HAY ".repeat(10);
    const out = enforceStrictFormat({
      hook: phrase,
      body: "x",
      hashtags: ["#a", "#b", "#c", "#d", "#e"],
    });
    expect(out.hook.length).toBeLessThanOrEqual(90);
    expect(out.hook.endsWith(" ")).toBe(false);
  });

  it("truncates body to 300 chars (max)", () => {
    const longBody = "X".repeat(500);
    const out = enforceStrictFormat({
      hook: "HOOK",
      body: longBody,
      hashtags: ["#a", "#b", "#c", "#d", "#e"],
    });
    expect(out.body.length).toBeLessThanOrEqual(300);
  });

  it("body keeps under 300 with realistic Vietnamese sentence", () => {
    const body =
      "Cẩm nang du lịch Đà Lạt mình gom cho nhóm bạn đi lần đầu, có cảnh đẹp, có quán ăn ngon, có cafe vibe. ".repeat(
        5,
      );
    const out = enforceStrictFormat({
      hook: "HOOK",
      body,
      hashtags: ["#a", "#b", "#c", "#d", "#e"],
    });
    expect(out.body.length).toBeLessThanOrEqual(300);
  });

  it("pads hashtags up to 5 if AI returns less", () => {
    const out = enforceStrictFormat({
      hook: "HOOK",
      body: "body",
      hashtags: ["#riviudalat", "#dalat"],
    });
    expect(out.hashtags.length).toBe(5);
  });

  it("slices hashtags to 5 if AI returns more", () => {
    const out = enforceStrictFormat({
      hook: "HOOK",
      body: "body",
      hashtags: ["#a", "#b", "#c", "#d", "#e", "#extra1", "#extra2"],
    });
    expect(out.hashtags.length).toBe(5);
    expect(out.hashtags).not.toContain("#extra1");
  });

  it("collapses whitespace in body (no double spaces, no inline newlines)", () => {
    const out = enforceStrictFormat({
      hook: "HOOK",
      body: "First sentence.\n\nSecond   line.   With   spaces.",
      hashtags: ["#a", "#b", "#c", "#d", "#e"],
    });
    expect(out.body).not.toMatch(/\n/);
    expect(out.body).not.toMatch(/ {2,}/);
  });
});

describe("formatCaptionDraft", () => {
  it("emits 3-part structure separated by blank lines", () => {
    const text = formatCaptionDraft({
      hook: "Mở đầu",
      body: "Đoạn body.",
      hashtags: ["#riviudalat", "#dalat", "#dalatreview", "#extra1", "#extra2"],
    });
    const lines = text.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe("");
    expect(lines[3]).toBe("");
    expect(lines[0]).toBe("MỞ ĐẦU");
    expect(lines[4]).toBe("#riviudalat #dalat #dalatreview #extra1 #extra2");
  });
});
