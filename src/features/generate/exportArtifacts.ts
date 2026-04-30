import * as XLSX from "xlsx";
import { callAi } from "@/features/ai/aiClient";
import type { Entity, RenderedItem } from "@/models";

export interface ExportPageEntityData {
  pageFile?: string;
  pageName?: string;
  entityId?: string;
  entityName?: string;
  items?: RenderedItem[];
}

interface CaptionVariant {
  headline: string;
  body: string;
  hashtags: string[];
}

const FIXED_HASHTAGS = ["#riviudalat", "#dalat", "#dalatreview"];
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8";

const PARTNER_FIELDS: Array<{
  label: string;
  path: string;
  read: (entity: Entity) => unknown;
}> = [
  { label: "Tên đối tác", path: "name", read: (entity) => entity.name },
  { label: "Địa chỉ", path: "address", read: (entity) => entity.address },
  { label: "Số điện thoại", path: "phone", read: (entity) => entity.phone },
  { label: "Mô hình", path: "categoryMain", read: (entity) => entity.categoryMain },
  { label: "Phong cách", path: "categorySub", read: (entity) => entity.categorySub },
  { label: "Giá", path: "priceRange", read: (entity) => entity.priceRange },
  { label: "Giờ mở cửa", path: "openingHours", read: (entity) => entity.openingHours },
  { label: "Phong cách khác", path: "style", read: (entity) => entity.style },
  {
    label: "Từ khóa SEO",
    path: "seoKeywords",
    read: (entity) => entity.seoKeywords.join(", "),
  },
  { label: "Nguồn dữ liệu", path: "sheetName", read: (entity) => entity.sheetName },
  { label: "Mã dòng nguồn", path: "sourceRowId", read: (entity) => entity.sourceRowId },
];

export function buildPartnerWorkbookBlob(input: {
  pages: ExportPageEntityData[];
  entities: Entity[];
}): Blob {
  const partners = collectPartnerLikeEntities(input.pages, input.entities);
  const metadataKeys = Array.from(
    new Set(partners.flatMap((entity) => Object.keys(entity.metadata ?? {}))),
  ).sort((a, b) => a.localeCompare(b, "vi"));

  const fields = [
    ...PARTNER_FIELDS,
    ...metadataKeys.map((key) => ({
      label: `Metadata: ${key}`,
      path: `metadata.${key}`,
      read: (entity: Entity) => entity.metadata?.[key],
    })),
  ];

  const dataRows =
    partners.length > 0
      ? fields.map((field) => partners.map((entity) => stringifyCell(field.read(entity))))
    : [["Không có đối tác hoặc dữ liệu nào trong bộ ảnh đã chọn."]];

  const workbook = XLSX.utils.book_new();
  const partnerSheet = XLSX.utils.aoa_to_sheet(dataRows);
  partnerSheet["!cols"] = partners.length ? partners.map(() => ({ wch: 34 })) : [{ wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, partnerSheet, "doitac");

  const guideRows = fields.map((field, index) => [index + 1, field.label, field.path]);
  const guideSheet = XLSX.utils.aoa_to_sheet([["Dòng", "Trường", "Path"], ...guideRows]);
  guideSheet["!cols"] = [{ wch: 8 }, { wch: 24 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, "fields");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buffer], { type: XLSX_MIME });
}

export async function buildTikTokCaptionBlob(input: {
  packName: string;
  bundleLabel?: string;
  pages: ExportPageEntityData[];
  entities: Entity[];
  variantCount?: number;
}): Promise<Blob> {
  const text = await buildTikTokCaptionText(input);
  return new Blob([text], { type: "text/plain;charset=utf-8" });
}

export async function buildTikTokCaptionText(input: {
  packName: string;
  bundleLabel?: string;
  pages: ExportPageEntityData[];
  entities: Entity[];
  variantCount?: number;
}): Promise<string> {
  const usedEntities = collectUsedEntities(input.pages, input.entities);
  const variantCount = Math.max(1, Math.min(6, input.variantCount ?? 4));
  const aiVariants = await requestAiCaptions({
    packName: input.packName,
    bundleLabel: input.bundleLabel,
    entities: usedEntities,
    variantCount,
  });
  const variants =
    aiVariants.length > 0
      ? aiVariants
      : buildFallbackCaptions(input.packName, input.bundleLabel, usedEntities, variantCount);

  return variants
    .slice(0, variantCount)
    .map((variant, index) => formatCaptionVariant(variant, index + 1, input.bundleLabel))
    .join("\n\n---\n\n");
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

function collectPartnerLikeEntities(pages: ExportPageEntityData[], entities: Entity[]): Entity[] {
  const used = collectUsedEntities(pages, entities);
  const flaggedIds = new Set<string>();
  for (const page of pages) {
    if (page.entityId) {
      const owner = entities.find((entity) => entity.entityId === page.entityId);
      if (owner?.partnerFlag) flaggedIds.add(page.entityId);
    }
    for (const item of page.items ?? []) {
      if (item.partnerFlag && item.entityId) flaggedIds.add(item.entityId);
    }
  }

  const partners = used.filter((entity) => entity.partnerFlag || flaggedIds.has(entity.entityId));
  return partners.length > 0 ? partners : used;
}

async function requestAiCaptions(input: {
  packName: string;
  bundleLabel?: string;
  entities: Entity[];
  variantCount: number;
}): Promise<CaptionVariant[]> {
  const payload = {
    packName: input.packName,
    bundleLabel: input.bundleLabel,
    variantCount: input.variantCount,
    fixedHashtags: FIXED_HASHTAGS,
    entities: input.entities.slice(0, 30).map((entity) => ({
      name: entity.name,
      address: entity.address,
      categoryMain: entity.categoryMain,
      categorySub: entity.categorySub,
      style: entity.style,
      priceRange: entity.priceRange,
      openingHours: entity.openingHours,
      seoKeywords: entity.seoKeywords,
      metadata: entity.metadata,
      partnerFlag: entity.partnerFlag,
    })),
  };

  try {
    const result = await callAi({
      messages: [
        {
          role: "system",
          content:
      "Bạn viết chú thích TikTok tiếng Việt cho bộ ảnh du lịch Đà Lạt. " +
            "Chỉ dùng dữ liệu được đưa vào, không bịa tên, địa chỉ, giá hoặc ưu đãi. " +
            "Trả về JSON object duy nhất theo schema: " +
            '{"captions":[{"headline":"...","body":"...","hashtags":["#..."]}]}. ' +
            "Mỗi headline phải VIẾT HOA, giật gân, dưới 90 ký tự. " +
            "Mỗi body tối đa 300 ký tự, có từ khóa SEO liên quan. " +
            "Mỗi hashtags đúng 5 hashtag: #riviudalat, #dalat, #dalatreview và 2 hashtag viết liền không dấu.",
        },
        {
          role: "user",
          content: JSON.stringify(payload, null, 2),
        },
      ],
      temperature: 0.75,
    });
    if (!result.ok) return [];
    return parseAiCaptionJson(result.content ?? "", input.entities).slice(0, input.variantCount);
  } catch {
    return [];
  }
}

function parseAiCaptionJson(raw: string, entities: Entity[]): CaptionVariant[] {
  const jsonText = extractJson(raw);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as {
      captions?: Array<{ headline?: unknown; body?: unknown; hashtags?: unknown }>;
    };
    return (parsed.captions ?? [])
      .map((caption) =>
        normalizeCaptionVariant(
          String(caption.headline ?? ""),
          String(caption.body ?? ""),
          Array.isArray(caption.hashtags) ? caption.hashtags.map(String) : [],
          entities,
        ),
      )
      .filter((caption) => caption.headline && caption.body);
  } catch {
    return [];
  }
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

function buildFallbackCaptions(
  packName: string,
  bundleLabel: string | undefined,
  entities: Entity[],
  count: number,
): CaptionVariant[] {
  const names = entities.map((entity) => entity.name).filter(Boolean);
  const topNames = names.slice(0, 4).join(", ");
  const categoryText = Array.from(
    new Set(entities.map((entity) => entity.categoryMain || entity.categorySub).filter(Boolean)),
  ).join(", ");
  const baseBody =
    topNames.length > 0
      ? `Gợi ý ${packName.toLowerCase()} với ${topNames}. Lưu lại để lên lịch ăn chơi, check-in, homestay và trải nghiệm du lịch Đà Lạt dễ hơn.`
      : `Gợi ý ${packName.toLowerCase()} cho lịch trình du lịch Đà Lạt, review địa điểm, check-in và lưu lại những lựa chọn đáng thử.`;
  const variants = [
    {
      headline: `${packName} ĐÁNG LƯU NGAY`,
      body: baseBody,
    },
    {
      headline: `ĐI ĐÀ LẠT ĐỪNG BỎ QUA LIST NÀY`,
      body: `${baseBody} ${categoryText ? `Chủ đề nổi bật: ${categoryText}.` : ""}`.trim(),
    },
    {
      headline: `LỊCH ĐÀ LẠT GỌN HƠN VỚI ${names.length || "NHIỀU"} GỢI Ý`,
      body: baseBody,
    },
    {
      headline: `${bundleLabel ?? "BỘ ẢNH"} NÀY HỢP ĐỂ LƯU TRƯỚC KHI ĐI ĐÀ LẠT`,
      body: baseBody,
    },
  ];

  return Array.from({ length: count }, (_, index) => {
    const variant = variants[index % variants.length];
    return normalizeCaptionVariant(variant.headline, variant.body, [], entities);
  });
}

function normalizeCaptionVariant(
  headline: string,
  body: string,
  hashtags: string[],
  entities: Entity[],
): CaptionVariant {
  return {
    headline: trimAt(headline.toUpperCase(), 89),
    body: trimAt(body.replace(/\s+/g, " ").trim(), 300),
    hashtags: ensureHashtags(hashtags, entities),
  };
}

function ensureHashtags(tags: string[], entities: Entity[]): string[] {
  const dynamic = buildDynamicHashtags(entities);
  const normalizedTags = tags.map(normalizeHashtag).filter(Boolean);
  const unique = new Set([...FIXED_HASHTAGS, ...normalizedTags, ...dynamic]);
  return Array.from(unique).slice(0, 5);
}

function buildDynamicHashtags(entities: Entity[]): string[] {
  const text = entities
    .flatMap((entity) => [
      entity.categoryMain,
      entity.categorySub,
      entity.style,
      ...entity.seoKeywords,
      ...Object.values(entity.metadata ?? {}).map(String),
    ])
    .join(" ")
    .toLowerCase();
  const candidates = [
    text.includes("homestay") && "#homestaydalat",
    text.includes("cafe") && "#cafedalat",
    text.includes("check") && "#checkindalat",
    text.includes("ăn") && "#andalat",
    text.includes("spa") && "#thugiandalat",
    "#dulichdalat",
    "#reviewdalat",
    "#dalatcheckin",
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates.map(normalizeHashtag).filter(Boolean))).slice(0, 4);
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

function trimAt(value: string, max: number): string {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

function formatCaptionVariant(
  caption: CaptionVariant,
  index: number,
  bundleLabel: string | undefined,
): string {
  return [
    `CHÚ THÍCH ${index}${bundleLabel ? ` - ${bundleLabel}` : ""}`,
    "",
    "Phần 1 - Tiêu đề (Headline):",
    caption.headline,
    "",
    "Phần 2 - Nội dung (Body/SEO):",
    caption.body,
    "",
    "Phần 3 - Danh sách Hashtags:",
    caption.hashtags.join(" "),
  ].join("\n");
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
