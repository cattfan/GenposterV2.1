import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the AI client so the batch rewrite can be tested without a live provider.
const callAiMock = vi.fn();
vi.mock("./aiClient", () => ({
  callAi: (...args: unknown[]) => callAiMock(...args),
}));

import { aiRewriteBatch } from "./aiRewriteBatch";

describe("aiRewriteBatch — AI viết lại (mỗi bộ khác nhau)", () => {
  beforeEach(() => {
    callAiMock.mockReset();
  });

  it("returns N distinct rewrites that match the original word count", async () => {
    // Original "Ghé Đà Lạt chơi nào mấy bồ ơi!" = 8 words. All variations below are 8 words.
    callAiMock.mockResolvedValue({
      ok: true,
      content: JSON.stringify({
        variations: [
          "Lên Đà Lạt chơi đi nào bạn ơi!",
          "Rủ nhau Đà Lạt chơi thôi nào bồ!",
          "Ghé thăm Đà Lạt chơi vui nào bồ!",
          "Cùng lên Đà Lạt chơi nhé mấy bồ!",
          "Tới Đà Lạt chơi một chuyến đi bồ!",
        ],
      }),
      toolArgs: null,
    });

    const result = await aiRewriteBatch({
      originalText: "Ghé Đà Lạt chơi nào mấy bồ ơi!",
      count: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.variations).toHaveLength(5);
    // 5 bundles → 5 genuinely different texts.
    expect(new Set(result.variations).size).toBe(5);
    // Every returned line must have exactly the original word count (8).
    for (const v of result.variations) {
      expect(v.trim().split(/\s+/).length).toBe(8);
    }

    // The prompt must ask the AI for exactly the bundle count + exact word count.
    const sentMessages = callAiMock.mock.calls[0][0].messages as Array<{ content: string }>;
    const systemPrompt = sentMessages[0].content;
    expect(systemPrompt).toContain("Đúng 5 câu");
    expect(systemPrompt).toContain("ĐÚNG 8 chữ");
  });

  it("filters out wrong-length variations and retries to backfill", async () => {
    // First call: only 2 of 5 have the right length (8 words). Retry supplies the rest.
    callAiMock
      .mockResolvedValueOnce({
        ok: true,
        content: JSON.stringify({
          variations: [
            "Lên Đà Lạt chơi đi nào bạn ơi!", // 8 ✓
            "Đi Đà Lạt thôi nào!", // 5 ✗
            "Rủ nhau Đà Lạt chơi thôi nào bồ!", // 8 ✓
            "Đà Lạt nha!", // 3 ✗
            "Đi Đà Lạt chơi cho đã đời luôn nha mấy bồ ơi!", // too long ✗
          ],
        }),
        toolArgs: null,
      })
      .mockResolvedValueOnce({
        ok: true,
        content: JSON.stringify({
          variations: [
            "Ghé thăm Đà Lạt chơi vui nào bồ!", // 8 ✓
            "Cùng lên Đà Lạt chơi nhé mấy bồ!", // 8 ✓
            "Tới Đà Lạt chơi một chuyến đi bồ!", // 8 ✓
          ],
        }),
        toolArgs: null,
      });

    const result = await aiRewriteBatch({
      originalText: "Ghé Đà Lạt chơi nào mấy bồ ơi!",
      count: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.variations).toHaveLength(5);
    expect(callAiMock).toHaveBeenCalledTimes(2);
    for (const v of result.variations) {
      expect(v.trim().split(/\s+/).length).toBe(8);
    }
  });

  it("caps the returned variations to the requested count (matchWordCount off)", async () => {
    callAiMock.mockResolvedValue({
      ok: true,
      content: JSON.stringify({
        variations: ["a", "b", "c", "d", "e", "f", "g"],
      }),
      toolArgs: null,
    });

    const result = await aiRewriteBatch({
      originalText: "Xin chào",
      count: 3,
      matchWordCount: false,
    });
    expect(result.variations).toEqual(["a", "b", "c"]);
  });

  it("falls back to empty (caller keeps original text) when the AI call fails", async () => {
    callAiMock.mockResolvedValue({ ok: false, status: 500, error: "boom" });

    const result = await aiRewriteBatch({ originalText: "Xin chào", count: 5 });
    expect(result.ok).toBe(false);
    expect(result.variations).toEqual([]);
  });

  it("returns empty without calling AI for blank text or non-positive count", async () => {
    const blank = await aiRewriteBatch({ originalText: "   ", count: 5 });
    expect(blank.variations).toEqual([]);

    const zero = await aiRewriteBatch({ originalText: "Xin chào", count: 0 });
    expect(zero.variations).toEqual([]);

    expect(callAiMock).not.toHaveBeenCalled();
  });

  it("parses a fenced/loose JSON object embedded in prose", async () => {
    callAiMock.mockResolvedValue({
      ok: true,
      content: 'Đây nhé:\n```json\n{"variations":["một","hai"]}\n```\nXong!',
      toolArgs: null,
    });

    const result = await aiRewriteBatch({ originalText: "Xin chào", count: 2 });
    expect(result.ok).toBe(true);
    expect(result.variations).toEqual(["một", "hai"]);
  });
});
