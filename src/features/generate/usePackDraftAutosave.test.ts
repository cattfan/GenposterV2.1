// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePackDraftAutosave } from "./usePackDraftAutosave";

const putMock = vi.fn().mockResolvedValue(undefined);
const getMock = vi.fn();

vi.mock("@/storage/db", () => ({
  db: {
    packDrafts: {
      put: (...args: unknown[]) => putMock(...args),
      get: (...args: unknown[]) => getMock(...args),
    },
  },
}));

describe("usePackDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    putMock.mockClear();
    getMock.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("debounces multiple rapid changes into one save after 500ms", async () => {
    const { rerender } = renderHook<
      void,
      { packOv: Record<string, Record<string, string>> }
    >(
      ({ packOv }) =>
        usePackDraftAutosave({
          packTemplateId: "p1",
          packOv,
          previewPageDrafts: {},
        }),
      { initialProps: { packOv: { p1: { s1: "entity.name" } } } },
    );
    rerender({ packOv: { p1: { s1: "entity.name", s2: "entity.address" } } });
    rerender({ packOv: { p1: { s2: "entity.address" } } });

    expect(putMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(putMock).toHaveBeenCalledTimes(1);
    const saved = putMock.mock.calls[0]![0];
    expect(saved.packTemplateId).toBe("p1");
    expect(saved.packOv).toEqual({ p1: { s2: "entity.address" } });
  });

  it("does nothing when packTemplateId is undefined", async () => {
    renderHook(() =>
      usePackDraftAutosave({
        packTemplateId: undefined,
        packOv: { p1: {} },
        previewPageDrafts: {},
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(putMock).not.toHaveBeenCalled();
  });

  it("flushes pending save on unmount", async () => {
    const { rerender, unmount } = renderHook<
      void,
      { packOv: Record<string, Record<string, string>> }
    >(
      ({ packOv }) =>
        usePackDraftAutosave({
          packTemplateId: "p1",
          packOv,
          previewPageDrafts: {},
        }),
      { initialProps: { packOv: { p1: { s1: "entity.name" } } } },
    );
    rerender({ packOv: { p1: { s1: "entity.name", s2: "entity.address" } } });

    unmount();
    // Flush microtasks
    await Promise.resolve();
    expect(putMock).toHaveBeenCalledTimes(1);
  });
});
