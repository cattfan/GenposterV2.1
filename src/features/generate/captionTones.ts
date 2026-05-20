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

export const CAPTION_TONES: CaptionTone[] = [
  {
    id: "chaotic_hype",
    label: "Chaotic hype",
    styleHint:
      "Giọng văn rối rít, phấn khích, nói chuyện kiểu tâm sự với bạn bè. " +
      "Hook ngắn, có thán từ và 1-2 emoji rung động (🫣 🥺 🤧). " +
      "Body 2-4 câu ngắn, nhịp gấp, hay dùng 'ơi cả nhà', 'thề', 'mê quá đi'. " +
      "Không cần SEO khô cứng, viết như chốt deal nhanh.",
    fallbackHooks: [
      "Chốt liền tay nào cả nhà ơi 🫣",
      "Mê quá đi mà, save lẹ kẻo tiếc 🥺",
      "Ai đi Đà Lạt mà chưa biết list này thì uổng lắm luôn 🤧",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 3);
      const intro = names
        ? `Vừa đi về thấy tim run run với ${names}.`
        : `Vừa đi về thấy tim run run với list ${ctx.packName} này.`;
      return `${intro} ${ctx.entityCount} điểm chất hết gu, tha hồ check-in mỗi ngày không chán. Dễ áp, khỏi nghĩ, save về rồi rủ hội đi liền đi nha.`;
    },
    fallbackTrailingTags: ["#chayphodalat", "#dalatcheckin"],
  },
  {
    id: "slow_poetic",
    label: "Slow poetic",
    styleHint:
      "Giọng chậm rãi, thơ, nhiều khoảng lặng. Có emoji thiên nhiên (🍂 🌿 ☁️). " +
      "Hook là 1 câu cảm xúc, không phải tiêu đề khô. Body 3-5 câu nhịp đều, " +
      "dùng nhiều từ gợi cảm giác (gió, sương, ấm, lặng). Không liệt kê khô cứng.",
    fallbackHooks: [
      "Vài ngày chậm rãi và những bản tình ca gió 🍂",
      "Đà Lạt — nơi ta thả mình vào sương ☁️",
      "Một chuyến đi để nghe lòng mình thở nhẹ 🌿",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 3);
      const intro = names
        ? `Cảm giác vừa về vẫn còn nguyên nồng ấm từ ${names}.`
        : `Cảm giác vừa về vẫn còn nguyên nồng ấm.`;
      return `${intro} Bộ list này dành cho ai muốn sống thật chậm, thả mình vào quán cóc, lạc giữa nhịp nhẹ. Mỗi điểm đều có gió, có mùi và có lý do để thương. Lưu để mang theo vài ngày xa phố.`;
    },
    fallbackTrailingTags: ["#langman", "#chuyendiduyen"],
  },
  {
    id: "practical_guide",
    label: "Practical guide",
    styleHint:
      "Giọng hướng dẫn thực dụng, thân thiện. Hook là 1 câu nhắc 'lưu lại' " +
      "hoặc 'cẩm nang'. Có emoji 😎 hoặc 📌. Body nêu rõ đối tượng phù hợp " +
      "(cặp đôi/nhóm bạn/lần đầu), nhắc giờ mở cửa hoặc lưu ý thực tế nếu có. " +
      "Liệt kê 2-4 cái tên cụ thể.",
    fallbackHooks: [
      "Lưu lại để không lỡ món ngon Đà Lạt nha 😎",
      "Cẩm nang Đà Lạt đầy đủ — save về dùng dần 📌",
      "Đi Đà Lạt lần đầu? List này dành cho bạn 📌",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 4);
      const targets = ctx.entityCount >= 4 ? "nhóm bạn hay cặp đôi mới đi lần đầu" : "ai sắp đi Đà Lạt";
      const detailLine = names
        ? `List này mình gom cho ${targets}: ${names}.`
        : `List này mình gom cho ${targets}.`;
      return `${detailLine} Các điểm đều có giờ cụ thể, khỏi lo tối mò. Vừa có cảnh đẹp, vừa có quán ăn ngon, lưu về dùng dần đi ạ.`;
    },
    fallbackTrailingTags: ["#camnangdalat", "#checkindalat"],
  },
  {
    id: "excited_hero",
    label: "Excited hero",
    styleHint:
      "Giọng hype editorial — hook VIẾT HOA mạnh mẽ, gây tò mò. " +
      "Body có chất 'reveal', dùng các từ như 'hóa ra', 'không ngờ', 'chất hết gu'. " +
      "Nêu 3-5 cái tên cụ thể nếu có. Hashtag mạnh.",
    fallbackHooks: [
      "ĐÀ LẠT HÓA RA CÓ CẢ LIST SPOT XỊN MLEM VẬY",
      "KHÔNG NGỜ ĐÀ LẠT CÒN GIẤU NHỮNG CHỖ NÀY",
      "LƯU NGAY LIST ĐÀ LẠT KẺO ĐI VỀ LẠI TIẾC",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 4);
      const styleWord = ctx.styles[0] ? `, ${ctx.styles[0]}` : "";
      return names
        ? `Em thề những địa điểm này rất đáng để lưu lại. Gồm ${names}. Dùng cẩm nang này, lịch trình du lịch Đà Lạt sẽ chất hơn${styleWord}. Không sợ trôi giữa muôn vàn lựa chọn đâu.`
        : `Em thề ${ctx.packName} này rất đáng để lưu lại. Dùng cẩm nang này, lịch trình du lịch Đà Lạt sẽ chất hơn. Không sợ trôi giữa muôn vàn lựa chọn đâu.`;
    },
    fallbackTrailingTags: ["#checkindalat", "#andalat"],
  },
  {
    id: "casual_friend",
    label: "Casual friend",
    styleHint:
      "Giọng bạn bè kể chuyện, gần gũi. Hook là câu hỏi hoặc gợi mở, " +
      "không UPPERCASE. Body 2-3 câu nhẹ, có 'mình', 'mọi người', " +
      "ít emoji (tối đa 1). Tránh hype, tránh thơ.",
    fallbackHooks: [
      "Đi Đà Lạt mà chưa biết đi đâu? Save liền nè",
      "Mình mới đi về, gom xong list này cho mọi người luôn",
      "Bạn nào sắp đi Đà Lạt thì xem cái này trước nha",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 3);
      const intro = names
        ? `Mình tổng hợp ${ctx.packName.toLowerCase()} với ${names} cùng vài chỗ khác.`
        : `Mình tổng hợp ${ctx.packName.toLowerCase()} dành cho ai chưa biết đi đâu, ăn gì.`;
      return `${intro} Ai đi rồi review giúp mình nhé, còn ai chưa đi thì save lại đi đã. Lúc cần là có liền.`;
    },
    fallbackTrailingTags: ["#dulichdalat", "#dalatcheckin"],
  },
  {
    id: "editorial_review",
    label: "Editorial review",
    styleHint:
      "Giọng blog review nghiêm túc, cấu trúc rõ. Hook là tiêu đề 'Review' " +
      "hoặc 'Cẩm nang'. Body có nhận xét chất lượng và phân loại " +
      "(cafe / quán ăn / homestay / checkin). Tránh teen/emoji rối. " +
      "Tối đa 1 emoji nhẹ ở đầu hoặc cuối.",
    fallbackHooks: [
      "Review Đà Lạt: cẩm nang không bỏ lỡ",
      "Cẩm nang Đà Lạt — checklist trọn vẹn cho chuyến đi",
      "Tổng hợp Đà Lạt: từ cafe đến homestay, đủ vibe",
    ],
    fallbackBody: (ctx) => {
      const names = topNames(ctx, 4);
      const catLine = ctx.mainCategories.length
        ? ` Mix các loại: ${ctx.mainCategories.join(", ")}.`
        : "";
      const intro = names
        ? `Bộ ${ctx.packName} bao gồm ${ctx.entityCount} điểm chọn lọc: ${names}.`
        : `Bộ ${ctx.packName} bao gồm ${ctx.entityCount} điểm chọn lọc.`;
      return `${intro}${catLine} Mỗi điểm đều có đặc trưng riêng và đã được xác minh thực tế. Lưu lại để lên lịch trình cho chuyến đi sắp tới.`;
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
