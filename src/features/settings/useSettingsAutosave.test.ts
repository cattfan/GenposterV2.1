// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettingsAutosave } from "./useSettingsAutosave";
import type { AppSettings } from "@/models";

const saveMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/storage/settings", () => ({
  saveSettings: (...args: unknown[]) => saveMock(...args),
}));

const base: AppSettings = {
  language: "vi",
  captionProvider: "local",
  exportScale: 2,
  defaultCanvas: { width: 1588, height: 2248, background: "#fff" },
  theme: "system",
};

describe("useSettingsAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("debounces saves to 400ms and saves the latest snapshot", async () => {
    const { rerender } = renderHook(
      ({ s }: { s: AppSettings | null }) => useSettingsAutosave(s),
      { initialProps: { s: base } as { s: AppSettings | null } },
    );
    rerender({ s: { ...base, exportScale: 3 } });
    rerender({ s: { ...base, exportScale: 4 } });

    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect((saveMock.mock.calls[0]![0] as AppSettings).exportScale).toBe(4);
  });

  it("skips save when settings is null", async () => {
    renderHook(() => useSettingsAutosave(null));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("skips save when signature unchanged", async () => {
    const { rerender } = renderHook(
      ({ s }: { s: AppSettings | null }) => useSettingsAutosave(s),
      { initialProps: { s: base } as { s: AppSettings | null } },
    );
    rerender({ s: { ...base } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("flushes pending save on unmount", async () => {
    const { rerender, unmount } = renderHook(
      ({ s }: { s: AppSettings | null }) => useSettingsAutosave(s),
      { initialProps: { s: base } as { s: AppSettings | null } },
    );
    rerender({ s: { ...base, exportScale: 9 } });
    unmount();
    await Promise.resolve();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
