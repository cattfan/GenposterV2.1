// Tone preset + bundle context utilities cho AI caption.
//
// Trước đây [exportArtifacts.ts] dùng 1 system prompt rigid (UPPERCASE,
// <90/300 chars, đúng 5 hashtag) cho mọi Bộ → output bị "đồng phục".
// User muốn mỗi Bộ ra 1 tone khác nhau, AI dựa trên data thật của bundle.
//
// File này tách logic tone + context để [exportArtifacts.ts] chỉ lo gọi
// AI và format output. Picker dùng djb2 hash deterministic theo
// (bundleIndex, seedKey) — cùng pack render 2 lần ra cùng tone, nhưng các
// Bộ trong cùng pack ra tone khác nhau.

import type { Entity, RenderedItem } from "@/models";

export interface CaptionTone {
  id: string;
  label: string;
  /** Bổ sung vào system prompt — mô tả phong cách viết cho AI. */
  styleHint: string;
  /** Hook lines dùng cho fallback khi AI fail/timeout. */
  fallbackHooks: string[];
  /** Body template cho fallback — nhận context, trả 1 đoạn. */
  fallbackBody: (ctx: BundleContext) => string;
  /** Hashtag suffix gợi ý (sau 3 hashtag SEO core). */
  fallbackTrailingTags: string[];
}

export interface BundleContextEntity {
  name: string;
  address?: string;
  categoryMain?: string;
  categorySub?: string;
  style?: string;
  openingHours?: string;
  priceRange?: string;
  seoKeywords?: string[];
  partnerFlag?: boolean;
}

export interface BundleContext {
  packName: string;
  bundleLabel: string;
  pageNames: string[];
  entityCount: number;
  partnerCount: number;
  mainCategories: string[];
  styles: string[];
  entities: BundleContextEntity[];
}

export interface CaptionDraft {
  hook: string;
  body: string;
  hashtags: string[];
}

const SEO_CORE_HASHTAGS = ["#riviudalat", "#dalat", "#dalatreview"];

function topNames(ctx: BundleContext, max: number): string {
  return ctx.entities
    .map((e) => e.name)
    .filter((n): n is string => !!n && n.trim().length > 0)
    .slice(0, max)
    .join(", ");
}

// Quy ước format chặt (xem [exportArtifacts.ts]):
//   - Hook: UPPERCASE, ≤90 ký tự (đã được [enforceStrictFormat] cắt + uppercase).
//   - Body: ≤300 ký tự, có 1-2 SEO keyword Đà Lạt phù hợp tone.
// fallbackHooks bên dưới được viết hoa sẵn để mỗi Bộ ra caption đúng spec
// kể cả khi AI fail và phải dùng template local.
const STYLE_RULES = " Hook PHẢI UPPERCASE, tối đa 90 ký tự. Body tối đa 300 ký tự.";

export const CAPTION_TONES: CaptionTone[] = [
  {
    id: "chaotic_hype",
    label: "Chaotic hype",
    styleHint:
      "Giọng văn rối rít, phấn khích, nói chuyện kiểu tâm sự với bạn bè. " +
      "Hook UPPERCASE có thán từ + 1 emoji rung động (🫣 🥺 🤧). " +
      "Body 2-3 câu ngắn, nhịp gấp, dùng 'ơi cả nhà', 'thề', 'mê quá đi'. " +
      "Có 1 SEO keyword Đà Lạt (du lịch Đà Lạt / ăn uống Đà Lạt)." +
      STYLE_RULES,
    fallbackHooks: [
      "CHỐT LIỀN TAY NÀO CẢ NHÀ ƠI 🫣",
      "MÊ QUÁ ĐI MÀ, SAVE LẸ KẺO TIẾC 🥺",
      "AI ĐI ĐÀ LẠT MÀ CHƯA BIẾT LIST NÀY THÌ UỔNG LẮM 🤧",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 3);
      const intro = names
        ? `Vừa đi về thấy tim run run với ${names}.`
        : `Vừa đi về thấy tim run run với danh sách ăn uống Đà Lạt này.`;
      return `${intro} ${ctx.entityCount > 0 ? `${ctx.entityCount} điểm chất ` : "Cả list chất "}hết gu, lưu liền kẻo tiếc. Save về rồi rủ hội đi liền nha cả nhà ơi.`;
    },
    fallbackTrailingTags: ["#chayphodalat", "#dalatcheckin"],
  },
  {
    id: "slow_poetic",
    label: "Slow poetic",
    styleHint:
      "Giọng chậm rãi, thơ. Hook UPPERCASE nhưng giàu cảm xúc + 1 emoji thiên nhiên (🍂 🌿 ☁️). " +
      "Body 2-3 câu nhịp đều, dùng nhiều từ gợi cảm giác (gió, sương, ấm, lặng). " +
      "Có 1 SEO keyword Đà Lạt (du lịch Đà Lạt / cafe Đà Lạt)." +
      STYLE_RULES,
    fallbackHooks: [
      "VÀI NGÀY CHẬM RÃI VÀ NHỮNG BẢN TÌNH CA GIÓ 🍂",
      "ĐÀ LẠT — NƠI TA THẢ MÌNH VÀO SƯƠNG ☁️",
      "MỘT CHUYẾN ĐI ĐỂ NGHE LÒNG MÌNH THỞ NHẸ 🌿",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 3);
      const intro = names
        ? `Cảm giác vừa về vẫn còn nguyên nồng ấm từ ${names}.`
        : `Cảm giác vừa về vẫn còn nguyên nồng ấm Đà Lạt.`;
      return `${intro} Danh sách dành cho ai muốn sống thật chậm, thả mình vào quán cóc, lạc giữa nhịp nhẹ Đà Lạt. Lưu mang theo cho lần kế.`;
    },
    fallbackTrailingTags: ["#langman", "#chuyendiduyen"],
  },
  {
    id: "practical_guide",
    label: "Practical guide",
    styleHint:
      "Giọng hướng dẫn thực dụng, thân thiện. Hook UPPERCASE + emoji 😎 hoặc 📌. " +
      "Body nêu rõ đối tượng phù hợp (cặp đôi/nhóm bạn/lần đầu), nhắc 1 lưu ý thực tế. " +
      "Có 1-2 SEO keyword Đà Lạt (cẩm nang du lịch Đà Lạt / ăn uống Đà Lạt). Liệt kê 2-4 tên." +
      STYLE_RULES,
    fallbackHooks: [
      "LƯU LẠI ĐỂ KHÔNG LỠ MÓN NGON ĐÀ LẠT NHA 😎",
      "CẨM NANG ĐÀ LẠT ĐẦY ĐỦ — SAVE VỀ DÙNG DẦN 📌",
      "ĐI ĐÀ LẠT LẦN ĐẦU? LIST NÀY DÀNH CHO BẠN 📌",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 4);
      const targets = ctx.entityCount >= 4 ? "nhóm bạn hay cặp đôi đi lần đầu" : "ai sắp đi Đà Lạt";
      const detailLine = names
        ? `Cẩm nang du lịch Đà Lạt mình gom cho ${targets}: ${names}.`
        : `Cẩm nang du lịch Đà Lạt mình gom cho ${targets}.`;
      return `${detailLine} Các điểm đều có giờ cụ thể, vừa có cảnh đẹp vừa có quán ăn ngon. Lưu về dùng dần đi ạ.`;
    },
    fallbackTrailingTags: ["#camnangdalat", "#checkindalat"],
  },
  {
    id: "excited_hero",
    label: "Excited hero",
    styleHint:
      "Giọng hype editorial — hook UPPERCASE mạnh mẽ, gây tò mò, không emoji. " +
      "Body có chất 'reveal', dùng 'hóa ra', 'không ngờ', 'chất hết gu'. " +
      "Có 1 SEO keyword Đà Lạt. Nêu 3-5 tên nếu có." +
      STYLE_RULES,
    fallbackHooks: [
      "ĐÀ LẠT HÓA RA CÓ CẢ LIST SPOT XỊN MLEM VẬY",
      "KHÔNG NGỜ ĐÀ LẠT CÒN GIẤU NHỮNG CHỖ NÀY",
      "LƯU NGAY LIST ĐÀ LẠT KẺO ĐI VỀ LẠI TIẾC",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 4);
      return names
        ? `Em thề những địa điểm check-in Đà Lạt này rất đáng để lưu. Gồm ${names}. Dùng cẩm nang này, lịch trình du lịch Đà Lạt sẽ chất hơn nhiều.`
        : `Em thề lịch trình du lịch Đà Lạt này rất đáng để lưu. Mix điểm check-in, ăn uống, nghỉ ngơi cho chuyến đi không trôi giữa muôn vàn lựa chọn.`;
    },
    fallbackTrailingTags: ["#checkindalat", "#andalat"],
  },
  {
    id: "casual_friend",
    label: "Casual friend",
    styleHint:
      "Giọng bạn bè kể chuyện, gần gũi. Hook UPPERCASE dạng câu hỏi gợi mở. " +
      "Body 2-3 câu nhẹ, có 'mình', 'mọi người', tối đa 1 emoji nhẹ. " +
      "Có 1 SEO keyword Đà Lạt. Tránh hype, tránh thơ." +
      STYLE_RULES,
    fallbackHooks: [
      "ĐI ĐÀ LẠT MÀ CHƯA BIẾT ĐI ĐÂU? SAVE LIỀN NÈ",
      "MÌNH MỚI ĐI VỀ, GOM XONG LIST NÀY CHO MỌI NGƯỜI",
      "BẠN NÀO SẮP ĐI ĐÀ LẠT THÌ XEM CÁI NÀY TRƯỚC NHA",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 3);
      const intro = names
        ? `Mình tổng hợp lịch trình du lịch Đà Lạt với ${names} cùng vài chỗ khác.`
        : `Mình tổng hợp lịch trình du lịch Đà Lạt cho ai chưa biết đi đâu, ăn gì.`;
      return `${intro} Ai đi rồi review giúp mình nhé, còn ai chưa đi thì save lại đi đã. Lúc cần là có liền.`;
    },
    fallbackTrailingTags: ["#dulichdalat", "#dalatcheckin"],
  },
  {
    id: "editorial_review",
    label: "Editorial review",
    styleHint:
      "Giọng blog review nghiêm túc. Hook UPPERCASE dạng 'REVIEW' hoặc 'CẨM NANG'. " +
      "Body có nhận xét chất lượng, phân loại (cafe / quán ăn / homestay / checkin). " +
      "Tối đa 1 emoji nhẹ. Có 1-2 SEO keyword Đà Lạt." +
      STYLE_RULES,
    fallbackHooks: [
      "REVIEW ĐÀ LẠT: CẨM NANG KHÔNG BỎ LỠ",
      "CẨM NANG DU LỊCH ĐÀ LẠT — CHECKLIST TRỌN VẸN",
      "TỔNG HỢP ĐÀ LẠT: TỪ CAFE ĐẾN HOMESTAY ĐỦ VIBE",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 4);
      const catLine = ctx.mainCategories.length
        ? ` Mix các loại: ${ctx.mainCategories.join(", ")}.`
        : "";
      const intro = names
        ? `Cẩm nang du lịch Đà Lạt gồm ${ctx.entityCount} điểm chọn lọc: ${names}.`
        : `Cẩm nang du lịch Đà Lạt được biên tập kỹ lưỡng cho chuyến đi sắp tới.`;
      return `${intro}${catLine} Mỗi điểm đều có đặc trưng riêng. Lưu để lên lịch trình.`;
    },
    fallbackTrailingTags: ["#reviewdalat", "#dulichdalat"],
  },
];

function djb2Hash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export function pickCaptionTone(bundleIndex: number, seedKey: string): CaptionTone {
  const key = `${seedKey}|${bundleIndex}`;
  const index = djb2Hash(key) % CAPTION_TONES.length;
  return CAPTION_TONES[index];
}

export interface BuildBundleContextInput {
  packName: string;
  bundleLabel: string;
  pages: Array<{
    entityId?: string;
    pageName?: string;
    items?: RenderedItem[];
  }>;
  entities: Entity[];
}

export function buildBundleContext(input: BuildBundleContextInput): BundleContext {
  const entityMap = new Map(input.entities.map((e) => [e.entityId, e]));
  const usedIds = new Set<string>();
  const pageNames: string[] = [];

  for (const page of input.pages) {
    if (page.pageName) pageNames.push(page.pageName);
    if (page.entityId) usedIds.add(page.entityId);
    for (const item of page.items ?? []) {
      if (item.entityId) usedIds.add(item.entityId);
    }
  }

  const usedEntities = Array.from(usedIds)
    .map((id) => entityMap.get(id))
    .filter((e): e is Entity => !!e);

  const partnerCount = usedEntities.filter((e) => e.partnerFlag).length;
  const mainCategories = topByFrequency(
    usedEntities.map((e) => e.categoryMain).filter((c): c is string => !!c),
    3,
  );
  const styles = topByFrequency(
    usedEntities.map((e) => e.style).filter((s): s is string => !!s),
    3,
  );

  return {
    packName: input.packName,
    bundleLabel: input.bundleLabel,
    pageNames,
    entityCount: usedEntities.length,
    partnerCount,
    mainCategories,
    styles,
    entities: usedEntities.map((e) => ({
      name: e.name,
      address: e.address,
      categoryMain: e.categoryMain,
      categorySub: e.categorySub,
      style: e.style,
      openingHours: e.openingHours,
      priceRange: e.priceRange,
      seoKeywords: e.seoKeywords,
      partnerFlag: e.partnerFlag,
    })),
  };
}

function topByFrequency(values: string[], max: number): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([v]) => v);
}

export function renderFallbackCaption(tone: CaptionTone, ctx: BundleContext): CaptionDraft {
  const hookIndex = djb2Hash(`${tone.id}|${ctx.bundleLabel}|${ctx.packName}`) % tone.fallbackHooks.length;
  const hook = tone.fallbackHooks[hookIndex];
  const body = tone.fallbackBody(ctx);
  const hashtags = buildHashtags(tone, ctx);
  return { hook, body, hashtags };
}

export function buildHashtags(tone: CaptionTone, ctx: BundleContext): string[] {
  const dynamic: string[] = [];
  const blob = [
    ...ctx.mainCategories,
    ...ctx.styles,
    ...ctx.entities.flatMap((e) => e.seoKeywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  if (blob.includes("homestay")) dynamic.push("#homestaydalat");
  if (blob.includes("cafe")) dynamic.push("#cafedalat");
  if (blob.includes("checkin") || blob.includes("check-in")) dynamic.push("#checkindalat");
  if (blob.includes("ăn") || blob.includes("quan_an")) dynamic.push("#andalat");
  if (blob.includes("spa")) dynamic.push("#thugiandalat");

  const all = [...SEO_CORE_HASHTAGS, ...tone.fallbackTrailingTags, ...dynamic];
  const unique: string[] = [];
  for (const tag of all) {
    if (!unique.includes(tag)) unique.push(tag);
    if (unique.length >= 5) break;
  }
  return unique;
}

export function getSeoCoreHashtags(): string[] {
  return [...SEO_CORE_HASHTAGS];
}
