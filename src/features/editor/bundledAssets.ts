// Offline bundled asset library for the editor "Kho asset" panel.
//
// Data-only, no network: a curated set of open-license-style SVG graphics
// (illustrations + stickers) shipped with the app. Each asset inserts as a
// `kind: "svg"` element, so it reuses the existing SVG render + tint path.
//
// SVGs that use `currentColor` are tintable from the inspector; multi-color
// graphics keep their own palette. Keep this file data-only.

export type BundledAssetCategory = "illustration" | "sticker" | "decor";

export interface BundledAsset {
  id: string;
  name: string;
  category: BundledAssetCategory;
  tags: string[];
  /** Suggested insert size on the canvas. */
  width: number;
  height: number;
  /** Inline SVG markup (viewBox-based, scales to the element box). */
  svg: string;
}

// ─── Illustrations (flat, multi-color scenes) ──────────────────────────────

const ILLUSTRATIONS: BundledAsset[] = [
  {
    id: "ill-mountains",
    name: "Núi và mặt trời",
    category: "illustration",
    tags: ["núi", "thiên nhiên", "phong cảnh", "mountain", "nature"],
    width: 360,
    height: 240,
    svg: `<svg viewBox="0 0 360 240" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<rect width="360" height="240" rx="16" fill="#e0f2fe"/>
<circle cx="280" cy="70" r="34" fill="#fbbf24"/>
<path d="M0 200 L90 90 L150 170 L210 70 L300 200 Z" fill="#34d399"/>
<path d="M120 200 L210 70 L300 200 Z" fill="#10b981"/>
<path d="M0 200 L90 90 L130 140 L70 200 Z" fill="#059669"/>
<rect y="196" width="360" height="44" fill="#047857"/>
</svg>`,
  },
  {
    id: "ill-city",
    name: "Thành phố",
    category: "illustration",
    tags: ["thành phố", "nhà", "city", "building", "đô thị"],
    width: 320,
    height: 240,
    svg: `<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<rect width="320" height="240" rx="16" fill="#ede9fe"/>
<rect x="30" y="90" width="50" height="120" fill="#8b5cf6"/>
<rect x="95" y="50" width="56" height="160" fill="#7c3aed"/>
<rect x="166" y="110" width="48" height="100" fill="#a78bfa"/>
<rect x="228" y="70" width="60" height="140" fill="#6d28d9"/>
<g fill="#fef9c3">
<rect x="42" y="104" width="10" height="12"/><rect x="60" y="104" width="10" height="12"/>
<rect x="110" y="66" width="12" height="14"/><rect x="128" y="66" width="12" height="14"/>
<rect x="244" y="86" width="12" height="14"/><rect x="262" y="86" width="12" height="14"/>
</g>
<rect y="206" width="320" height="34" fill="#4c1d95"/>
</svg>`,
  },
  {
    id: "ill-plant",
    name: "Chậu cây",
    category: "illustration",
    tags: ["cây", "chậu", "plant", "lá", "nội thất"],
    width: 200,
    height: 260,
    svg: `<svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M100 150 C60 120 50 60 70 30 C95 60 100 100 100 150Z" fill="#22c55e"/>
<path d="M100 150 C140 120 150 60 130 30 C105 60 100 100 100 150Z" fill="#16a34a"/>
<path d="M100 160 C80 140 60 130 50 100 C90 110 100 130 100 160Z" fill="#4ade80"/>
<path d="M70 170 H130 L120 240 H80 Z" fill="#ea580c"/>
<rect x="64" y="160" width="72" height="18" rx="6" fill="#c2410c"/>
</svg>`,
  },
  {
    id: "ill-coffee",
    name: "Ly cà phê",
    category: "illustration",
    tags: ["cà phê", "coffee", "đồ uống", "cup", "quán"],
    width: 220,
    height: 220,
    svg: `<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<rect width="220" height="220" rx="18" fill="#fef3c7"/>
<path d="M60 90 H150 V150 A30 30 0 0 1 120 180 H90 A30 30 0 0 1 60 150 Z" fill="#92400e"/>
<rect x="62" y="90" width="86" height="16" fill="#b45309"/>
<path d="M150 104 H168 A18 18 0 0 1 168 140 H150" fill="none" stroke="#92400e" stroke-width="10"/>
<path d="M88 60 C84 70 96 74 92 84" stroke="#a16207" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M112 56 C108 66 120 70 116 80" stroke="#a16207" stroke-width="6" fill="none" stroke-linecap="round"/>
</svg>`,
  },
  {
    id: "ill-rocket",
    name: "Tên lửa",
    category: "illustration",
    tags: ["tên lửa", "rocket", "khởi nghiệp", "startup", "bay"],
    width: 180,
    height: 260,
    svg: `<svg viewBox="0 0 180 260" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M90 20 C130 60 130 140 110 180 H70 C50 140 50 60 90 20Z" fill="#e2e8f0"/>
<circle cx="90" cy="90" r="20" fill="#38bdf8"/>
<path d="M70 160 L40 200 L70 185Z" fill="#ef4444"/>
<path d="M110 160 L140 200 L110 185Z" fill="#ef4444"/>
<path d="M78 180 H102 L96 210 H84Z" fill="#f97316"/>
<path d="M82 210 Q90 240 98 210Z" fill="#fbbf24"/>
</svg>`,
  },
  {
    id: "ill-wave",
    name: "Sóng nền",
    category: "illustration",
    tags: ["sóng", "wave", "nền", "background", "trang trí"],
    width: 360,
    height: 160,
    svg: `<svg viewBox="0 0 360 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<rect width="360" height="160" rx="16" fill="#f0f9ff"/>
<path d="M0 100 C60 70 120 130 180 100 C240 70 300 130 360 100 V160 H0Z" fill="#7dd3fc"/>
<path d="M0 120 C60 95 120 145 180 120 C240 95 300 145 360 120 V160 H0Z" fill="#38bdf8"/>
<path d="M0 140 C60 120 120 160 180 140 C240 120 300 160 360 140 V160 H0Z" fill="#0284c7"/>
</svg>`,
  },
  {
    id: "ill-gift",
    name: "Hộp quà",
    category: "illustration",
    tags: ["quà", "gift", "hộp", "sinh nhật", "khuyến mãi"],
    width: 220,
    height: 220,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<rect x="18" y="44" width="64" height="44" rx="4" fill="#f472b6"/>
<rect x="18" y="36" width="64" height="16" rx="4" fill="#ec4899"/>
<rect x="44" y="36" width="12" height="52" fill="#be185d"/>
<path d="M50 36 C40 20 24 28 50 36 C60 20 76 28 50 36Z" fill="#f9a8d4"/>
</svg>`,
  },
  {
    id: "ill-cloud",
    name: "Mây",
    category: "illustration",
    tags: ["mây", "cloud", "trời", "thời tiết", "nền"],
    width: 240,
    height: 160,
    svg: `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M30 60 A20 20 0 0 1 34 22 A24 24 0 0 1 80 26 A18 18 0 0 1 92 60 Z" fill="#bae6fd"/>
<path d="M30 60 A20 20 0 0 1 34 22 A24 24 0 0 1 60 18 L60 60 Z" fill="#e0f2fe"/>
</svg>`,
  },
  {
    id: "ill-laptop",
    name: "Laptop",
    category: "illustration",
    tags: ["laptop", "máy tính", "công nghệ", "làm việc", "tech"],
    width: 260,
    height: 200,
    svg: `<svg viewBox="0 0 130 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<rect x="28" y="20" width="74" height="50" rx="5" fill="#334155"/>
<rect x="34" y="26" width="62" height="38" rx="2" fill="#38bdf8"/>
<path d="M18 78 H112 L104 70 H26 Z" fill="#94a3b8"/>
<rect x="52" y="70" width="26" height="4" rx="2" fill="#64748b"/>
</svg>`,
  },
];

// ─── Stickers (bold, single-subject graphics) ──────────────────────────────

const STICKERS: BundledAsset[] = [
  {
    id: "stk-star",
    name: "Ngôi sao",
    category: "sticker",
    tags: ["sao", "star", "đánh giá", "nổi bật"],
    width: 160,
    height: 160,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M50 6 L61 38 L96 38 L68 59 L79 92 L50 71 L21 92 L32 59 L4 38 L39 38 Z" fill="#facc15" stroke="#eab308" stroke-width="3" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: "stk-heart",
    name: "Trái tim",
    category: "sticker",
    tags: ["tim", "heart", "yêu", "love", "thích"],
    width: 160,
    height: 160,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M50 86 C16 60 8 38 22 24 C34 12 50 22 50 34 C50 22 66 12 78 24 C92 38 84 60 50 86 Z" fill="#f43f5e" stroke="#e11d48" stroke-width="3" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: "stk-bolt",
    name: "Tia chớp",
    category: "sticker",
    tags: ["chớp", "bolt", "nhanh", "năng lượng", "flash"],
    width: 130,
    height: 170,
    svg: `<svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M34 4 L8 56 H28 L24 96 L54 40 H32 Z" fill="#f59e0b" stroke="#d97706" stroke-width="3" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: "stk-speech",
    name: "Bong bóng thoại",
    category: "sticker",
    tags: ["thoại", "chat", "speech", "bong bóng", "nói"],
    width: 180,
    height: 150,
    svg: `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M16 12 H104 A12 12 0 0 1 116 24 V64 A12 12 0 0 1 104 76 H52 L30 94 L34 76 H16 A12 12 0 0 1 4 64 V24 A12 12 0 0 1 16 12 Z" fill="#38bdf8" stroke="#0ea5e9" stroke-width="3" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: "stk-badge-sale",
    name: "Nhãn SALE",
    category: "sticker",
    tags: ["sale", "giảm giá", "khuyến mãi", "nhãn", "badge"],
    width: 170,
    height: 170,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M50 4 L60 14 L74 10 L78 24 L92 30 L86 44 L94 56 L82 64 L82 78 L68 78 L60 90 L50 82 L40 90 L32 78 L18 78 L18 64 L6 56 L14 44 L8 30 L22 24 L26 10 L40 14 Z" fill="#ef4444" stroke="#b91c1c" stroke-width="2.5" stroke-linejoin="round"/>
<text x="50" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">SALE</text>
</svg>`,
  },
  {
    id: "stk-check",
    name: "Dấu tích",
    category: "sticker",
    tags: ["tích", "check", "đúng", "hoàn thành", "ok"],
    width: 150,
    height: 150,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<circle cx="50" cy="50" r="44" fill="#22c55e" stroke="#16a34a" stroke-width="3"/>
<path d="M30 52 L44 66 L72 36" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: "stk-pin",
    name: "Ghim địa điểm",
    category: "sticker",
    tags: ["ghim", "pin", "địa điểm", "location", "bản đồ"],
    width: 130,
    height: 170,
    svg: `<svg viewBox="0 0 70 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M35 6 C53 6 66 19 66 37 C66 60 35 92 35 92 C35 92 4 60 4 37 C4 19 17 6 35 6 Z" fill="#8b5cf6" stroke="#6d28d9" stroke-width="3"/>
<circle cx="35" cy="37" r="13" fill="#ffffff"/>
</svg>`,
  },
  {
    id: "stk-sparkle",
    name: "Lấp lánh",
    category: "sticker",
    tags: ["lấp lánh", "sparkle", "ánh sáng", "magic", "trang trí"],
    width: 150,
    height: 150,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M50 8 C54 36 64 46 92 50 C64 54 54 64 50 92 C46 64 36 54 8 50 C36 46 46 36 50 8 Z" fill="#c084fc" stroke="#a855f7" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: "stk-fire",
    name: "Lửa",
    category: "sticker",
    tags: ["lửa", "fire", "hot", "trend", "nóng"],
    width: 130,
    height: 160,
    svg: `<svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M35 4 C50 24 58 34 58 54 A23 23 0 0 1 12 54 C12 40 22 38 24 28 C34 38 30 16 35 4Z" fill="#f97316" stroke="#ea580c" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M35 38 C44 50 46 54 46 60 A11 11 0 0 1 24 60 C24 52 30 50 35 38Z" fill="#fde047"/>
</svg>`,
  },
  {
    id: "stk-crown",
    name: "Vương miện",
    category: "sticker",
    tags: ["vương miện", "crown", "vip", "premium", "vua"],
    width: 170,
    height: 130,
    svg: `<svg viewBox="0 0 100 76" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M10 64 L18 22 L36 44 L50 14 L64 44 L82 22 L90 64 Z" fill="#fbbf24" stroke="#d97706" stroke-width="3" stroke-linejoin="round"/>
<rect x="14" y="62" width="72" height="10" rx="3" fill="#f59e0b"/>
<circle cx="50" cy="14" r="5" fill="#ef4444"/>
</svg>`,
  },
  {
    id: "stk-thumbsup",
    name: "Like",
    category: "sticker",
    tags: ["like", "thích", "thumbs up", "ngón cái", "tốt"],
    width: 140,
    height: 150,
    svg: `<svg viewBox="0 0 90 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<rect x="12" y="44" width="20" height="44" rx="4" fill="#1d4ed8"/>
<path d="M36 88 V44 L52 12 C60 10 66 18 60 32 L56 42 H78 A8 8 0 0 1 86 52 L80 80 A10 10 0 0 1 70 88 Z" fill="#3b82f6" stroke="#1d4ed8" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`,
  },
  {
    id: "stk-gift-tag",
    name: "Thẻ giảm %",
    category: "sticker",
    tags: ["giảm giá", "phần trăm", "tag", "discount", "khuyến mãi"],
    width: 160,
    height: 160,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M48 8 H88 V48 L48 88 L12 52 Z" fill="#10b981" stroke="#059669" stroke-width="3" stroke-linejoin="round"/>
<circle cx="72" cy="28" r="6" fill="#ffffff"/>
<text x="44" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#ffffff" transform="rotate(-45 44 56)">%</text>
</svg>`,
  },
];

// ─── Decor (frames, ribbons, geometric accents) ────────────────────────────

const DECOR: BundledAsset[] = [
  {
    id: "dec-ribbon",
    name: "Dải băng",
    category: "decor",
    tags: ["băng", "ribbon", "tiêu đề", "banner", "nhãn"],
    width: 300,
    height: 90,
    svg: `<svg viewBox="0 0 150 45" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M10 8 H140 L150 22 L140 37 H10 L0 22 Z" fill="#ef4444"/>
<path d="M10 37 L2 45 L10 37 Z" fill="#b91c1c"/>
<path d="M140 37 L148 45 L140 37 Z" fill="#b91c1c"/>
</svg>`,
  },
  {
    id: "dec-frame",
    name: "Khung tròn",
    category: "decor",
    tags: ["khung", "frame", "viền", "tròn", "circle"],
    width: 200,
    height: 200,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<circle cx="50" cy="50" r="44" fill="none" stroke="#0f172a" stroke-width="3"/>
<circle cx="50" cy="50" r="38" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="4 4"/>
</svg>`,
  },
  {
    id: "dec-burst",
    name: "Tia nổ",
    category: "decor",
    tags: ["tia", "burst", "nổ", "sale", "nổi bật"],
    width: 200,
    height: 200,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M50 2 L58 20 L78 12 L72 32 L92 36 L78 50 L92 64 L72 68 L78 88 L58 80 L50 98 L42 80 L22 88 L28 68 L8 64 L22 50 L8 36 L28 32 L22 12 L42 20 Z" fill="#f43f5e"/>
</svg>`,
  },
  {
    id: "dec-dots",
    name: "Chấm bi",
    category: "decor",
    tags: ["chấm", "dots", "hoạ tiết", "pattern", "nền"],
    width: 200,
    height: 200,
    svg: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<g fill="#8b5cf6">
<circle cx="15" cy="15" r="6"/><circle cx="50" cy="15" r="6"/><circle cx="85" cy="15" r="6"/>
<circle cx="15" cy="50" r="6"/><circle cx="50" cy="50" r="6"/><circle cx="85" cy="50" r="6"/>
<circle cx="15" cy="85" r="6"/><circle cx="50" cy="85" r="6"/><circle cx="85" cy="85" r="6"/>
</g>
</svg>`,
  },
  {
    id: "dec-arrow-curve",
    name: "Mũi tên cong",
    category: "decor",
    tags: ["mũi tên", "arrow", "cong", "chỉ dẫn", "hướng"],
    width: 180,
    height: 140,
    svg: `<svg viewBox="0 0 90 70" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M8 58 C20 20 50 10 76 22" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
<path d="M62 14 L80 20 L70 36 Z" fill="#0f172a"/>
</svg>`,
  },
  {
    id: "dec-underline",
    name: "Gạch nhấn",
    category: "decor",
    tags: ["gạch", "underline", "nhấn", "đường", "trang trí"],
    width: 280,
    height: 50,
    svg: `<svg viewBox="0 0 140 25" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<path d="M6 16 C40 6 100 6 134 14" fill="none" stroke="#f59e0b" stroke-width="6" stroke-linecap="round"/>
</svg>`,
  },
];

/** All bundled assets in one list (illustrations first, then stickers). */
export const BUNDLED_ASSETS: BundledAsset[] = [...ILLUSTRATIONS, ...STICKERS, ...DECOR];

/**
 * Filter bundled assets by category and a free-text query (matches name + tags,
 * accent-insensitive). Empty query returns all assets in the category.
 */
export function filterBundledAssets(
  category: BundledAssetCategory,
  query: string,
): BundledAsset[] {
  const normalized = query.trim().toLowerCase();
  return BUNDLED_ASSETS.filter((asset) => {
    if (asset.category !== category) return false;
    if (!normalized) return true;
    const haystack = `${asset.name} ${asset.tags.join(" ")}`.toLowerCase();
    return haystack.includes(normalized);
  });
}
