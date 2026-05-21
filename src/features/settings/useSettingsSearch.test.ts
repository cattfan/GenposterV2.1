// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettingsSearch } from "@/features/settings/useSettingsSearch";

describe("useSettingsSearch", () => {
  it("returns no match for empty query", () => {
    const { result } = renderHook(() => useSettingsSearch(""));
    expect(result.current.matches).toHaveLength(0);
    expect(result.current.primarySectionId).toBeNull();
  });

  it('matches "model" against ai/model and ai/visionModel', () => {
    const { result } = renderHook(() => useSettingsSearch("model"));
    const ids = result.current.matches.map((m) => m.fieldId);
    expect(ids).toContain("model");
    expect(ids).toContain("visionModel");
    expect(result.current.primarySectionId).toBe("ai");
  });

  it('matches "drive" → general/drive', () => {
    const { result } = renderHook(() => useSettingsSearch("drive"));
    expect(result.current.matches.map((m) => m.fieldId)).toContain("drive");
    expect(result.current.primarySectionId).toBe("general");
  });

  it("returns no match for nonsense query", () => {
    const { result } = renderHook(() => useSettingsSearch("xyzzzznotreal"));
    expect(result.current.matches).toHaveLength(0);
  });

  it("normalizes Vietnamese diacritics — 'khuon' matches Khuôn mẫu", () => {
    const { result } = renderHook(() => useSettingsSearch("khuon"));
    expect(result.current.matches.map((m) => m.fieldId)).toContain("clearTemplates");
  });
});
