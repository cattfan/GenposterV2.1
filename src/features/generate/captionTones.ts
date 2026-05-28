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

/** Chọn 1 phần tử trong pool theo seed deterministic. */
function pickFromPool<T>(pool: T[], seed: string): T {
  const idx = djb2Hash(seed) % pool.length;
  return pool[idx];
}

/**
 * Diễn tả mood của bundle dựa trên category/style — dùng trong fallback body
 * thay cho việc liệt kê tên đối tác. Đảm bảo caption tự nhiên, không bám tên.
 */
function describeMood(ctx: BundleContext): string {
  const blob = [...ctx.mainCategories, ...ctx.styles].join(" ").toLowerCase();
  const phrases: string[] = [];
  if (blob.includes("cafe") || blob.includes("coffee")) phrases.push("cafe view chill");
  if (blob.includes("an") || blob.includes("quan_an") || blob.includes("food")) {
    phrases.push("món ngon local");
  }
  if (blob.includes("homestay") || blob.includes("resort") || blob.includes("villa")) {
    phrases.push("homestay xinh");
  }
  if (blob.includes("checkin") || blob.includes("check-in") || blob.includes("spot")) {
    phrases.push("spot sống ảo");
  }
  if (blob.includes("spa") || blob.includes("massage")) phrases.push("góc thư giãn");
  if (phrases.length === 0) return "đủ vibe Đà Lạt";
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return phrases.join(" với ");
  return phrases.slice(0, -1).join(", ") + " và " + phrases[phrases.length - 1];
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
      "UI TRỜI ƠI XỊN ĐẾN MỨC NÀY LUÔN HẢ 🫣",
      "THỀ LUÔN, ĐI XONG VỀ NHỚ ĐÀ LẠT QUÁ 🥺",
      "CẢ NHÀ ƠI NGHE EM KỂ NÈ, MÊ LẮM 🤧",
      "NGỒI VIẾT CAPTION MÀ TIM CÒN RUNG 🫣",
      "ĐI VỀ KHÔNG NÓI THÊM CÂU NÀO, CHỈ MUỐN QUAY LẠI 🥺",
      "SAVE NGAY KẺO LẦN SAU LẠI QUÊN HU HU 🤧",
      "NHƯ THẾ NÀY CÒN GÌ ĐỂ CHÊ NỮA TRỜI 🫣",
      "EM XIN PHÉP MÊ TỪ ĐẦU TỚI CUỐI 🥺",
      "MUỐN GÓI HẾT ĐÀ LẠT MANG VỀ NHÀ 🤧",
    ],
    fallbackBody: (ctx) => {
      const mood = describeMood(ctx);
      const seed = `chaotic|${ctx.packName}|${ctx.bundleLabel}`;
      const intros = [
        `Vừa đi về thấy tim còn run vì ${mood} ơi là chill.`,
        `Đà Lạt lần này em mê thật, ${mood} đúng kiểu em thích.`,
        `Vừa tỉnh dậy đã nhớ ${mood} rồi cả nhà ạ.`,
        `Mới đi vài hôm mà còn đứng hình vì ${mood} đẹp xỉu.`,
      ];
      const outros = [
        "Save nhanh kẻo lần sau lại không kịp lưu nha cả nhà ơi.",
        "Lưu liền rồi rủ team xách balo đi cuối tuần thôi.",
        "Em chốt là ai cũng nên thử ít nhất một lần đi cả nhà.",
        "Save lại để lần sau khỏi đắn đo chọn đi đâu nữa.",
      ];
      return `${pickFromPool(intros, seed + "|i")} ${pickFromPool(outros, seed + "|o")}`;
    },
    fallbackTrailingTags: ["#chayphodalat", "#dalatcheckin"],
  },
  {
    id: "slow_poetic",
    label: "Slow poetic",
    styleHint:
      "Giọng chậm rãi, thơ. Hook UPPERCASE nhưng giàu cảm xúc + 1 emoji thiên nhiên (🍂 🌿 ☁️). " +
      "Body 2-3 câu nhịp đều, dùng nhiều từ gợi cảm giác (gió, sương, ấm, lặng). " +
      "Có 1 SEO keyword Đà Lạt (du lịch Đà Lạt / cafe Đà Lạt). KHÔNG nhắc tên quán/đối tác." +
      STYLE_RULES,
    fallbackHooks: [
      "VÀI NGÀY CHẬM RÃI VÀ NHỮNG BẢN TÌNH CA GIÓ 🍂",
      "ĐÀ LẠT — NƠI TA THẢ MÌNH VÀO SƯƠNG ☁️",
      "MỘT CHUYẾN ĐI ĐỂ NGHE LÒNG MÌNH THỞ NHẸ 🌿",
      "SÁNG SƯƠNG, CHIỀU GIÓ, ĐÊM LÒNG NHẸ TÊNH ☁️",
      "ĐI ĐỂ THẤY THỜI GIAN TRÔI CHẬM HƠN MỘT NHỊP 🍂",
      "ĐÀ LẠT VẪN LẶNG LẼ NHƯ TA NHỚ NGÀY ĐẦU 🌿",
      "CÓ NHỮNG NGÀY CHỈ MUỐN NGỒI YÊN NGHE GIÓ KỂ ☁️",
      "GIỮA NHỊP THÀNH PHỐ, MỘT KHOẢNG LẶNG ĐÀ LẠT 🍂",
      "MƯA NHẸ, NẮNG NHẸ, LÒNG CŨNG NHẸ TÊNH 🌿",
      "ĐI MỘT VÒNG, TRỞ VỀ BÌNH YÊN HƠN MỘT CHÚT ☁️",
      "GÓI MÙA THU ĐÀ LẠT VÀO HÀNH LÝ MANG VỀ 🍂",
      "MỘT TÁCH CAFE, MỘT KHUNG CỬA, MỘT BUỔI CHIỀU 🌿",
    ],
    fallbackBody: (ctx) => {
      const mood = describeMood(ctx);
      const seed = `slow|${ctx.packName}|${ctx.bundleLabel}`;
      const intros = [
        `Đà Lạt lần này có ${mood}, đủ để mình ngồi lặng nhìn sương trôi qua khung cửa.`,
        `Sáng se lạnh, chiều nắng vàng — Đà Lạt vẫn dịu dàng với ${mood} quen thuộc.`,
        `Cafe Đà Lạt giữa làn sương, ${mood} chậm rãi như một bài hát cũ.`,
        `Có những ngày Đà Lạt chỉ cần thế: ${mood} và một tách trà ấm trên tay.`,
      ];
      const outros = [
        "Lưu lại cho lần kế, khi cần một khoảng lặng giữa nhịp sống.",
        "Save về để nhớ rằng nơi này luôn chờ mình quay lại.",
        "Mỗi lần xem lại là một lần lòng nhẹ thêm chút nữa.",
        "Du lịch Đà Lạt không cần vội, chỉ cần lưu sẵn là đủ.",
      ];
      return `${pickFromPool(intros, seed + "|i")} ${pickFromPool(outros, seed + "|o")}`;
    },
    fallbackTrailingTags: ["#langman", "#chuyendiduyen"],
  },
  {
    id: "practical_guide",
    label: "Practical guide",
    styleHint:
      "Giọng hướng dẫn thực dụng, thân thiện. Hook UPPERCASE + emoji 😎 hoặc 📌. " +
      "Body nêu rõ đối tượng phù hợp (cặp đôi/nhóm bạn/lần đầu), nhắc 1 lưu ý thực tế. " +
      "Có 1-2 SEO keyword Đà Lạt (cẩm nang du lịch Đà Lạt / ăn uống Đà Lạt). KHÔNG nhắc tên quán/đối tác." +
      STYLE_RULES,
    fallbackHooks: [
      "LƯU LẠI ĐỂ KHÔNG LỠ MÓN NGON ĐÀ LẠT NHA 😎",
      "CẨM NANG ĐÀ LẠT ĐẦY ĐỦ — SAVE VỀ DÙNG DẦN 📌",
      "ĐI ĐÀ LẠT LẦN ĐẦU? LIST NÀY DÀNH CHO BẠN 📌",
      "CHECKLIST ĐÀ LẠT 2 NGÀY 1 ĐÊM ĐÂY NÈ 😎",
      "LƯU NGAY KẺO LẦN SAU LẠI HỎI ĐI ĐÂU 📌",
      "CẨM NANG NGẮN GỌN CHO CHUYẾN ĐI SẮP TỚI 😎",
      "SAVE LẠI ĐỂ LÊN LỊCH CUỐI TUẦN NHANH 📌",
      "LIST CHILL CUỐI TUẦN ĐÀ LẠT — DÙ ĐI MỘT MÌNH HAY ĐI ĐÔI 😎",
      "ĐÀ LẠT 2N1Đ TIẾT KIỆM MÀ ĐỦ VIBE 📌",
      "LƯU LIỀN CHO CHUYẾN DU LỊCH ĐÀ LẠT KẾ TIẾP 😎",
      "CẨM NANG ĐÀ LẠT — KHÔNG LO LẠC ĐƯỜNG 📌",
      "CHECKLIST CHO TEAM CUỒNG XÊ DỊCH 😎",
    ],
    fallbackBody: (ctx) => {
      const mood = describeMood(ctx);
      const seed = `practical|${ctx.packName}|${ctx.bundleLabel}`;
      const targets = [
        "nhóm bạn lần đầu đi Đà Lạt",
        "cặp đôi muốn chuyến đi nhẹ nhàng",
        "team đi cuối tuần ngắn ngày",
        "ai muốn checklist đầy đủ trước khi xếp lịch",
      ];
      const intros = [
        `Cẩm nang du lịch Đà Lạt mình gom cho ${pickFromPool(targets, seed + "|t")}, có ${mood}.`,
        `Lưu list này đi: ${mood}, mix đủ để cẩm nang du lịch Đà Lạt khỏi lo trùng lặp.`,
        `Mình tổng hợp ăn uống Đà Lạt + chỗ chill cho ${pickFromPool(targets, seed + "|t2")}.`,
        `Cẩm nang du lịch Đà Lạt rút gọn: ${mood}, dễ áp lịch cho 2 ngày 1 đêm.`,
      ];
      const outros = [
        "Save về để khi cần là có liền, không phải search lại.",
        "Lưu lại rồi rủ team xếp lịch đi luôn cuối tuần này.",
        "Đi sớm chút để đỡ đông, kèm áo ấm vì Đà Lạt hay se lạnh tối.",
        "Save xong gửi cho người sắp đi để khỏi tốn công gom lại.",
      ];
      return `${pickFromPool(intros, seed + "|i")} ${pickFromPool(outros, seed + "|o")}`;
    },
    fallbackTrailingTags: ["#camnangdalat", "#checkindalat"],
  },
  {
    id: "excited_hero",
    label: "Excited hero",
    styleHint:
      "Giọng hype editorial — hook UPPERCASE mạnh mẽ, gây tò mò, không emoji. " +
      "Body có chất 'reveal', dùng 'hóa ra', 'không ngờ', 'chất hết gu'. " +
      "Có 1 SEO keyword Đà Lạt. KHÔNG nhắc tên quán/đối tác." +
      STYLE_RULES,
    fallbackHooks: [
      "ĐÀ LẠT HÓA RA CÓ CẢ LIST SPOT XỊN MLEM VẬY",
      "KHÔNG NGỜ ĐÀ LẠT CÒN GIẤU NHỮNG CHỖ NÀY",
      "LƯU NGAY LIST ĐÀ LẠT KẺO ĐI VỀ LẠI TIẾC",
      "HÓA RA CHECK-IN ĐÀ LẠT XỊN HƠN MÌNH NGHĨ",
      "ĐÀ LẠT 2026 CHẤT HẾT GU CHƯA TỪNG CÓ",
      "NHỮNG GÓC ĐÀ LẠT KHÔNG XUẤT HIỆN TRONG TOUR",
      "ĐI ĐÀ LẠT MỘT VÒNG XONG CHỈ MUỐN VIẾT BÀI",
      "CHƯA KỂ HẾT VỀ ĐÀ LẠT TRONG MỘT CHUYẾN",
      "ĐÀ LẠT SAU MƯA CÒN ĐẸP HƠN CẢ POSTCARD",
      "DU LỊCH ĐÀ LẠT XỨNG ĐÁNG MỖI GIÂY ĐƯỢC GHI",
      "MỘT CHUYẾN ĐI MỞ KHOÁ BAO NHIÊU GÓC LẠ",
      "ĐÀ LẠT THẬT SỰ CHO MÌNH NHIỀU HƠN MONG ĐỢI",
    ],
    fallbackBody: (ctx) => {
      const mood = describeMood(ctx);
      const seed = `excited|${ctx.packName}|${ctx.bundleLabel}`;
      const intros = [
        `Hóa ra check-in Đà Lạt còn nhiều ${mood} mình chưa từng kể.`,
        `Không ngờ du lịch Đà Lạt lần này có ${mood} chất đến vậy.`,
        `Chuyến đi xong mới biết Đà Lạt còn cả ${mood} đợi mình quay lại.`,
        `Đà Lạt thật sự đầy bất ngờ với ${mood} không có trong tour quen.`,
      ];
      const outros = [
        "Save lại để chuyến sau đỡ phải nghĩ đi đâu, ăn gì.",
        "Lưu nhanh kẻo lần sau lại hỏi ai có list không.",
        "Mỗi điểm một vibe khác nhau, lưu để dùng dần.",
        "Lịch trình du lịch Đà Lạt từ đây gọn gàng hẳn ra.",
      ];
      return `${pickFromPool(intros, seed + "|i")} ${pickFromPool(outros, seed + "|o")}`;
    },
    fallbackTrailingTags: ["#checkindalat", "#andalat"],
  },
  {
    id: "casual_friend",
    label: "Casual friend",
    styleHint:
      "Giọng bạn bè kể chuyện, gần gũi. Hook UPPERCASE dạng câu hỏi gợi mở. " +
      "Body 2-3 câu nhẹ, có 'mình', 'mọi người', tối đa 1 emoji nhẹ. " +
      "Có 1 SEO keyword Đà Lạt. KHÔNG nhắc tên quán/đối tác. Tránh hype, tránh thơ." +
      STYLE_RULES,
    fallbackHooks: [
      "ĐI ĐÀ LẠT MÀ CHƯA BIẾT ĐI ĐÂU? SAVE LIỀN NÈ",
      "MÌNH MỚI ĐI VỀ, GOM XONG LIST NÀY CHO MỌI NGƯỜI",
      "BẠN NÀO SẮP ĐI ĐÀ LẠT THÌ XEM CÁI NÀY TRƯỚC NHA",
      "AI ĐANG TÍNH ĐI ĐÀ LẠT GIƠ TAY LÊN NÀO",
      "MÌNH KỂ NHANH CHO MỌI NGƯỜI VỀ ĐÀ LẠT",
      "ĐÀ LẠT CUỐI TUẦN — ĐI HAY KHÔNG ĐI?",
      "LIST NÀY MÌNH GOM CHO BẠN NÀO LƯỜI SEARCH",
      "AI HỎI ĐÀ LẠT ĂN GÌ THÌ MÌNH ĐỂ ĐÂY NHA",
      "NGƯỜI HỎI ĐÀ LẠT CÓ GÌ MỚI THÌ XEM CÁI NÀY",
      "BẠN NÀO LẦN ĐẦU ĐI ĐÀ LẠT THÌ ĐỌC TRƯỚC NHA",
      "MÌNH KỂ KIỂU GIẢN DỊ THÔI, MỌI NGƯỜI XEM NHẸ",
      "ĐÀ LẠT VẪN VẬY, MÀ MỖI LẦN ĐI LẠI THÍCH",
    ],
    fallbackBody: (ctx) => {
      const mood = describeMood(ctx);
      const seed = `casual|${ctx.packName}|${ctx.bundleLabel}`;
      const intros = [
        `Mình mới đi Đà Lạt về, gom xong list ${mood} nên chia sẻ nhanh.`,
        `Lịch trình du lịch Đà Lạt mình tổng hợp gồm ${mood}, đỡ mất công tìm.`,
        `Đà Lạt lần này mình thấy có ${mood}, tiện kể lại cho ai sắp đi.`,
        `Mình ngồi gom ${mood} cho ai đang tính lên Đà Lạt cuối tuần.`,
      ];
      const outros = [
        "Ai đi rồi review lại giúp mình nhé, chưa đi thì save lại đã.",
        "Save về dùng dần, lúc cần là có liền không phải search lại.",
        "Mọi người thấy thiếu gì comment thêm cho mình bổ sung nha.",
        "Lưu lại rồi rủ team đi cuối tuần luôn, chần chừ chi nữa.",
      ];
      return `${pickFromPool(intros, seed + "|i")} ${pickFromPool(outros, seed + "|o")}`;
    },
    fallbackTrailingTags: ["#dulichdalat", "#dalatcheckin"],
  },
  {
    id: "editorial_review",
    label: "Editorial review",
    styleHint:
      "Giọng blog review nghiêm túc. Hook UPPERCASE dạng 'REVIEW' hoặc 'CẨM NANG'. " +
      "Body có nhận xét chất lượng, phân loại (cafe / quán ăn / homestay / checkin). " +
      "Tối đa 1 emoji nhẹ. Có 1-2 SEO keyword Đà Lạt. KHÔNG nhắc tên quán/đối tác." +
      STYLE_RULES,
    fallbackHooks: [
      "REVIEW ĐÀ LẠT: CẨM NANG KHÔNG BỎ LỠ",
      "CẨM NANG DU LỊCH ĐÀ LẠT — CHECKLIST TRỌN VẸN",
      "TỔNG HỢP ĐÀ LẠT: TỪ CAFE ĐẾN HOMESTAY ĐỦ VIBE",
      "REVIEW NHANH ĐÀ LẠT — ĐÁNG ĐI HAY KHÔNG",
      "CẨM NANG ĐÀ LẠT CUỐI TUẦN — GỌN MÀ ĐỦ",
      "TỔNG HỢP ĐIỂM ĐẾN ĐÀ LẠT THEO TỪNG VIBE",
      "REVIEW ĐÀ LẠT: CAFE VIEW, ĂN LOCAL, NGHỈ CHILL",
      "CẨM NANG ĐÀ LẠT CHO NGƯỜI THÍCH ĐI CHẬM",
      "TỔNG HỢP ĐÀ LẠT — MỖI GÓC MỘT CÂU CHUYỆN",
      "REVIEW ĐÀ LẠT: CHỌN LỌC TỪ NHIỀU CHUYẾN ĐI",
      "CẨM NANG ĐÀ LẠT — TỪ SÁNG ĐẾN TỐI ĐỦ LỊCH",
      "TỔNG HỢP ĐÀ LẠT: KHÔNG QUẢNG CÁO, CHỈ TRẢI NGHIỆM",
    ],
    fallbackBody: (ctx) => {
      const mood = describeMood(ctx);
      const seed = `editorial|${ctx.packName}|${ctx.bundleLabel}`;
      const catLine = ctx.mainCategories.length
        ? ` Mix các loại: ${ctx.mainCategories.join(", ")}.`
        : "";
      const intros = [
        `Cẩm nang du lịch Đà Lạt được biên tập kỹ: ${mood}.${catLine}`,
        `Review Đà Lạt lần này tập trung vào ${mood}.${catLine}`,
        `Tổng hợp du lịch Đà Lạt theo vibe: ${mood}.${catLine}`,
        `Cẩm nang Đà Lạt gọn gàng cho ai thích ${mood}.${catLine}`,
      ];
      const outros = [
        "Mỗi điểm đều có đặc trưng riêng. Lưu để lên lịch trình.",
        "Đánh giá khách quan, không quảng cáo. Save về dùng dần.",
        "Phân loại rõ ràng để bạn chọn theo mood từng ngày.",
        "Lưu lại cho chuyến đi sắp tới, khỏi mất công tìm lại.",
      ];
      return `${pickFromPool(intros, seed + "|i")} ${pickFromPool(outros, seed + "|o")}`;
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
