// AI batch rewrite: tạo N variations của 1 câu text giữ nguyên ý.
// Dùng khi generate bộ ảnh có slot binding "ai.rewrite".

import { callAi } from "./aiClient";

export interface AiRewriteBatchInput {
  /** Câu gốc cần viết lại */
  originalText: string;
  /** Số lượng variation cần tạo */
  count: number;
  /** Gợi ý tone/style (optional) */
  toneHint?: string;
  /** Ép mỗi câu có đúng số chữ như câu gốc (mặc định true). */
  matchWordCount?: boolean;
}

export interface AiRewriteBatchResult {
  ok: boolean;
  variations: string[];
  error?: string;
}

/**
 * Gọi AI tạo N variations của 1 câu text, giữ nguyên ý nghĩa.
 * Nếu AI fail → trả về mảng rỗng (caller dùng fallback = text gốc).
 */
export async function aiRewriteBatch(
  input: AiRewriteBatchInput,
): Promise<AiRewriteBatchResult> {
  const { originalText, count, toneHint, matchWordCount = true } = input;
  if (!originalText.trim() || count <= 0) {
    return { ok: true, variations: [] };
  }

  const targetWords = countWords(originalText);
  const lengthRule = matchWordCount
    ? `QUAN TRỌNG: mỗi câu PHẢI có ĐÚNG ${targetWords} chữ (tiếng Việt, đếm theo từ tách bằng dấu cách), không hơn không kém, để vừa khít khung thiết kế. `
    : "Giữ độ dài tương đương câu gốc. ";

  try {
    const first = await requestVariations({
      originalText,
      count,
      toneHint,
      lengthRule,
    });
    if (!first.ok) {
      return { ok: false, variations: [], error: first.error };
    }
    if (first.variations.length === 0) {
      return { ok: false, variations: [], error: "AI không trả về variations hợp lệ" };
    }

    if (!matchWordCount) {
      return { ok: true, variations: first.variations.slice(0, count) };
    }

    // Keep only variations with the exact target word count.
    const exact = dedupe(
      first.variations.filter((v) => countWords(v) === targetWords),
    );
    if (exact.length >= count) {
      return { ok: true, variations: exact.slice(0, count) };
    }

    // One retry to backfill the shortfall with stricter wording.
    const missing = count - exact.length;
    const retry = await requestVariations({
      originalText,
      count: missing + 2, // ask a couple extra to improve odds
      toneHint,
      lengthRule:
        lengthRule +
        `Câu gốc có ${targetWords} chữ. Tuyệt đối không lệch số chữ. `,
    });
    if (retry.ok) {
      for (const v of retry.variations) {
        if (countWords(v) === targetWords && !exact.includes(v)) exact.push(v);
        if (exact.length >= count) break;
      }
    }

    // Best effort: if still short, pad with the closest-length variations so the
    // caller still gets `count` items rather than falling back to original text.
    if (exact.length < count) {
      const byCloseness = dedupe(first.variations)
        .filter((v) => !exact.includes(v))
        .sort(
          (a, b) =>
            Math.abs(countWords(a) - targetWords) - Math.abs(countWords(b) - targetWords),
        );
      for (const v of byCloseness) {
        exact.push(v);
        if (exact.length >= count) break;
      }
    }

    return { ok: true, variations: exact.slice(0, count) };
  } catch (e) {
    return {
      ok: false,
      variations: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Count Vietnamese words (whitespace-separated tokens). */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

async function requestVariations(args: {
  originalText: string;
  count: number;
  toneHint?: string;
  lengthRule: string;
}): Promise<AiRewriteBatchResult> {
  const { originalText, count, toneHint, lengthRule } = args;
  const result = await callAi({
    messages: [
      {
        role: "system",
        content:
          "Bạn là copywriter tiếng Việt chuyên viết caption social media du lịch Đà Lạt. " +
          "Nhiệm vụ: viết lại câu gốc thành nhiều phiên bản khác nhau, giữ nguyên ý nghĩa. " +
          lengthRule +
          "Mỗi phiên bản phải tự nhiên, sáng tạo, không lặp từ. " +
          `${toneHint ? `Tone: ${toneHint}. ` : ""}` +
          `Trả về JSON: {"variations":["câu 1","câu 2",...]}. Đúng ${count} câu.`,
      },
      {
        role: "user",
        content: `Câu gốc: "${originalText}"\nSố lượng: ${count}`,
      },
    ],
    temperature: 0.85,
  });

  if (!result.ok) {
    return { ok: false, variations: [], error: result.error };
  }
  const parsed = parseVariationsJson(result.content ?? "");
  return { ok: true, variations: parsed };
}

function parseVariationsJson(raw: string): string[] {
  const trimmed = raw.trim();
  // Try JSON parse
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { variations?: unknown[] };
      if (Array.isArray(parsed.variations)) {
        return parsed.variations
          .map((v) => String(v).trim())
          .filter((v) => v.length > 0);
      }
    } catch {
      /* fall through */
    }
  }
  // Fallback: split by newlines
  return trimmed
    .split("\n")
    .map((line) => line.replace(/^\d+[.)]\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((line) => line.length > 5);
}
