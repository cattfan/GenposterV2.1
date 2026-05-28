// Build caption.txt + doitac.xlsx cho từng Bộ trong pack.
//
// Trước đây caption AI dùng 1 system prompt rigid (HEADLINE VIẾT HOA, body
// <300 chars, đúng 5 hashtag) cho mọi Bộ → output bị "đồng phục", không
// phản ánh dữ liệu thực tế của bundle. Refactor 2026-05-20: chia tone preset
// (xem [captionTones.ts]) — picker chọn tone deterministic theo bundleIndex,
// system prompt nhúng tone styleHint + bundle context (pageNames, entity mix,
// partnerCount). Fallback cũng tone-aware nếu AI fail.
//
// Output format thay đổi:
//   - Trước: HEADLINE\nbody\nhashtags (3 dòng dính)
//   - Sau:   hook\n\nbody\n\nhashtags (cấu trúc 3 phần có khoảng trắng)
// Match đúng style 4 ví dụ TikTok thực tế.

import * as XLSX from "xlsx";
import type { Entity, RenderedItem } from "@/models";
import { callAi } from "@/features/ai/aiClient";
import {
  type BundleContext,
  type CaptionDraft,
  type CaptionTone,
  buildBundleContext,
  buildHashtags,
  getSeoCoreHashtags,
  pickCaptionTone,
  renderFallbackCaption,
} from "./captionTones";

export interface ExportPageEntityData {
  pageFile?: string;
  pageName?: string;
  entityId?: string;
  entityName?: string;
  items?: RenderedItem[];
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8";

export function buildPartnerWorkbookBlob(input: {
  pages: ExportPageEntityData[];
  entities: Entity[];
}): Blob {
  const used = collectUsedEntities(input.pages, input.entities);
  const partners = used.filter((e) => e.partnerFlag);

  const workbook = XLSX.utils.book_new();

  if (partners.length === 0) {
    const dataRows = [["Không có đối tác"]];
    const sheet = XLSX.utils.aoa_to_sheet(dataRows);
    sheet["!cols"] = [{ wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "doitac");
  } else {
    const dataRows = [partners.map((entity) => entity.name || "")];
    const sheet = XLSX.utils.aoa_to_sheet(dataRows);
    sheet["!cols"] = partners.map((entity) => ({
      wch: Math.max(18, Math.min(36, (entity.name || "").length + 4)),
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, "doitac");
  }

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buffer], { type: XLSX_MIME });
}

export interface BuildCaptionInput {
  packName: string;
  bundleLabel?: string;
  /** 0-based bundle index trong pack — dùng để pick tone deterministic. */
  bundleIndex?: number;
  pages: ExportPageEntityData[];
  entities: Entity[];
}

export async function buildTikTokCaptionBlob(input: BuildCaptionInput): Promise<Blob> {
  // Caller chịu trách nhiệm wrap timeout (xem buildExportArtifacts với Promise.race).
  // Nếu AI fail/timeout, caller catch và fallback sang buildFallbackCaptionBlob.
  const text = await buildTikTokCaptionText(input);
  return new Blob([text], { type: "text/plain;charset=utf-8" });
}

export async function buildTikTokCaptionText(input: BuildCaptionInput): Promise<string> {
  const ctx = buildBundleContext({
    packName: input.packName,
    bundleLabel: input.bundleLabel ?? "Bộ 1",
    pages: input.pages,
    entities: input.entities,
  });
  const tone = pickCaptionTone(input.bundleIndex ?? 0, input.packName);
  const aiDraft = await requestAiCaption(tone, ctx);
  const draft = aiDraft ?? renderFallbackCaption(tone, ctx);
  return formatCaptionDraft(draft);
}

/**
 * Build caption blob bằng fallback template (no AI call). Dùng cho fallback
 * path khi AI timeout/fail trong batch export.
 */
export function buildFallbackCaptionBlob(input: BuildCaptionInput): Blob {
  const ctx = buildBundleContext({
    packName: input.packName,
    bundleLabel: input.bundleLabel ?? "Bộ 1",
    pages: input.pages,
    entities: input.entities,
  });
  const tone = pickCaptionTone(input.bundleIndex ?? 0, input.packName);
  const draft = renderFallbackCaption(tone, ctx);
  return new Blob([formatCaptionDraft(draft)], { type: "text/plain;charset=utf-8" });
}

/** Spec strict format từ design 2026-05-20: hook UPPERCASE ≤90, body ≤300, đúng 5 hashtag. */
const HOOK_MAX = 90;
const BODY_MAX = 300;
const HASHTAG_COUNT = 5;

export function enforceStrictFormat(draft: CaptionDraft): CaptionDraft {
  const hookUpper = draft.hook.replace(/\s+/g, " ").trim().toUpperCase();
  const hook = truncateAtWord(hookUpper, HOOK_MAX);
  const bodyClean = draft.body.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  const body = truncateAtWord(bodyClean, BODY_MAX);
  const hashtags = draft.hashtags.slice(0, HASHTAG_COUNT);
  while (hashtags.length < HASHTAG_COUNT) hashtags.push("#dalat");
  return { hook, body, hashtags };
}

function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const slice = value.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > max * 0.6) return slice.slice(0, lastSpace).trimEnd();
  return slice.trimEnd();
}

export function formatCaptionDraft(draft: CaptionDraft): string {
  // Format 3 phần: hook -> dòng trắng -> body -> dòng trắng -> hashtags.
  // Áp [enforceStrictFormat] ngay tại đây — single point đảm bảo mọi caption
  // (AI hay fallback) đều đúng spec UPPERCASE/length.
  const strict = enforceStrictFormat(draft);
  return [strict.hook, "", strict.body, "", strict.hashtags.join(" ")].join("\n");
}

async function requestAiCaption(
  tone: CaptionTone,
  ctx: BundleContext,
): Promise<CaptionDraft | null> {
  // Payload có chủ đích KHÔNG truyền `entities` để AI không bám tên đối tác
  // ra caption — feedback của user 2026-05-28: caption cũ "toàn bám tên đối
  // tác", thiếu cảm hứng tự nhiên.
  const payload = {
    bundleLabel: ctx.bundleLabel,
    packName: ctx.packName,
    pageCount: ctx.pageNames.length,
    entityCount: ctx.entityCount,
    partnerCount: ctx.partnerCount,
    mainCategories: ctx.mainCategories,
    styles: ctx.styles,
  };

  const systemPrompt = [
    "Bạn viết caption TikTok tiếng Việt cho 1 bộ ảnh du lịch/ẩm thực Đà Lạt.",
    "Mỗi bộ là 1 caption duy nhất, dùng cho 1 post TikTok. Không tạo nhiều biến thể.",
    `Phong cách yêu cầu (BẮT BUỘC theo): ${tone.styleHint}`,
    "Quy tắc nội dung (BẮT BUỘC):",
    "- TUYỆT ĐỐI KHÔNG nhắc tên quán, tên đối tác, tên thương hiệu, địa chỉ cụ thể.",
    "- Viết theo cảm hứng, không khí Đà Lạt — sương, gió, hoa, nhịp sống chậm, view, vibe.",
    "- Dựa vào mainCategories và styles trong data để chọn mood (vd: cafe view → chill; quán ăn local → ấm cúng; homestay → thư giãn).",
    "- Không bịa thông tin giá, giờ, khuyến mãi.",
    "- Dùng ngôi 'mình/cậu/bạn' tự nhiên, có thể chèn 1-2 emoji nhẹ nhàng (☕🌸✨🍃) — không spam.",
    "Quy tắc output (BẮT BUỘC, sẽ bị validate cứng):",
    '- Trả JSON object duy nhất: {"hook":"...","body":"...","hashtags":["#a","#b","#c","#d","#e"]}',
    "- hook: 1 dòng UPPERCASE, tối đa 90 ký tự (vượt sẽ bị cắt). KHÔNG chứa tên riêng.",
    "- body: 1 đoạn 2-4 câu, tối đa 300 ký tự (vượt sẽ bị cắt). PHẢI có 1-2 keyword SEO Đà Lạt phù hợp tone (vd: du lịch Đà Lạt / ăn uống Đà Lạt / check-in Đà Lạt / cafe Đà Lạt / homestay Đà Lạt / cẩm nang Đà Lạt).",
    "- hashtags: ĐÚNG 5 phần tử. 3 đầu CHÍNH XÁC là #riviudalat #dalat #dalatreview. 2 cuối: AI sinh, viết liền không dấu, single word, liên quan du lịch Đà Lạt (vd: #checkindalat, #andalat, #cafedalat, #homestaydalat).",
  ].join("\n");

  try {
    const result = await callAi({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Bundle context (chỉ dùng category/style để chọn mood, KHÔNG nhắc tên):\n```json\n" +
            JSON.stringify(payload, null, 2) +
            "\n```",
        },
      ],
      // Tăng từ 0.85 → 0.95: 6 Bộ trong cùng pack ra 6 caption mood/wording
      // khác nhau rõ rệt thay vì similar phrasing.
      temperature: 0.95,
    });
    if (!result.ok) return null;
    return parseCaptionJson(result.content ?? "", tone, ctx);
  } catch {
    return null;
  }
}

function parseCaptionJson(
  raw: string,
  tone: CaptionTone,
  ctx: BundleContext,
): CaptionDraft | null {
  const jsonText = extractJson(raw);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as {
      hook?: unknown;
      body?: unknown;
      hashtags?: unknown;
      // Backward-compat nếu model lỡ trả schema cũ.
      headline?: unknown;
      captions?: Array<{ hook?: unknown; body?: unknown; hashtags?: unknown; headline?: unknown }>;
    };

    const source = parsed.captions?.[0] ?? parsed;
    const hookRaw = pickString(source.hook) ?? pickString(source.headline);
    const bodyRaw = pickString(source.body);
    if (!hookRaw || !bodyRaw) return null;

    const hashtagsRaw = Array.isArray(source.hashtags)
      ? source.hashtags.map((t) => String(t))
      : [];

    return {
      hook: hookRaw.replace(/\s+/g, " ").trim(),
      body: bodyRaw.replace(/\s+\n/g, "\n").trim(),
      hashtags: normalizeHashtags(hashtagsRaw, tone, ctx),
    };
  } catch {
    return null;
  }
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHashtags(tags: string[], tone: CaptionTone, ctx: BundleContext): string[] {
  const seoCore = getSeoCoreHashtags();
  const cleaned = tags
    .map(normalizeHashtag)
    .filter((t): t is string => !!t);
  const userTags = cleaned.filter((t) => !seoCore.includes(t));
  // Đảm bảo SEO core ở đầu, kèm thêm tag từ AI hoặc fallback tone tags.
  const result = [...seoCore];
  for (const t of userTags) {
    if (!result.includes(t)) result.push(t);
    if (result.length >= 5) break;
  }
  if (result.length < 5) {
    const filler = buildHashtags(tone, ctx);
    for (const t of filler) {
      if (!result.includes(t)) result.push(t);
      if (result.length >= 5) break;
    }
  }
  return result.slice(0, 5);
}

function normalizeHashtag(tag: string): string {
  const body = stripVietnamese(String(tag))
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9]+/g, "");
  return body ? `#${body}` : "";
}

function stripVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

function collectUsedEntities(pages: ExportPageEntityData[], entities: Entity[]): Entity[] {
  const entityMap = new Map(entities.map((entity) => [entity.entityId, entity]));
  const ids = new Set<string>();
  for (const page of pages) {
    if (page.entityId) ids.add(page.entityId);
    for (const item of page.items ?? []) {
      if (item.entityId) ids.add(item.entityId);
    }
  }
  return Array.from(ids)
    .map((id) => entityMap.get(id))
    .filter((entity): entity is Entity => !!entity);
}
