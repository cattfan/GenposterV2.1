import { nanoid } from "nanoid";
import { aiGenerateComboFromImages } from "@/features/ai/aiFeatures";
import { callAi } from "@/features/ai/aiClient";
import { aiLayoutToTemplateWithQuality } from "@/features/ai/templateFromImage";
import { parseLayoutBlueprintJson } from "@/features/ai/blueprint";
import type {
  AnalysisMode,
  AnalyzedPack,
  AnalyzedPage,
  AnalyzedPageType,
  AnalyzedUiRegion,
  Asset,
  CompatibilityLevel,
  CompatibilityReport,
  DataBlueprint,
  DraftPageSuggestion,
  DraftReadiness,
  DraftTemplateSuggestion,
  Entity,
  GapCategory,
  GapItem,
  GapLevel,
  InferredDataRequirement,
  PackTemplate,
  PageTemplate,
  RequirementKind,
  Section,
  SheetCompatibilityDetail,
  SheetSemanticProfile,
  Slot,
  VisualBlueprint,
} from "@/models";

type UploadedAnalysisImage = {
  name: string;
  dataUrl: string;
  blobKey: string;
};

type ComboRole = "cover" | "utilities" | "day" | "outro" | "other";
type EvaluationStatus = "have" | "mappable" | "missing";

interface PageAnalysisToolResult {
  pageRole: string;
  pageType: AnalyzedPageType;
  summary: string;
  layoutDensity: "low" | "medium" | "high";
  numberOfSections: number;
  estimatedItemCount: number;
  hasMainTitle: boolean;
  hasSubtitle: boolean;
  hasBackgroundImage: boolean;
  hasPanel: boolean;
  hasSectionImages: boolean;
  hasListRepeater: boolean;
  hasSlotRepeater: boolean;
  hasPriceBadge: boolean;
  hasCTA: boolean;
  confidenceScore: number;
  uiRegions: Array<{
    kind: AnalyzedUiRegion["kind"];
    label: string;
    description: string;
    estimatedItems?: number;
  }>;
  requiredFields: Array<{
    fieldKey: string;
    label: string;
    scope: InferredDataRequirement["scope"];
    required: boolean;
    kind?: RequirementKind;
    bindCandidate?: string;
    bindCandidates?: string[];
    examples?: string[];
    notes?: string;
    acceptsManualInput?: boolean;
    minRecords?: number;
    assetRoleHint?: string;
    confidence?: number;
  }>;
}

interface SheetProfile {
  sheetName: string;
  entities: Entity[];
  assets: Asset[];
  rowCount: number;
  assetCount: number;
  coverAssetCount: number;
  metadataKeys: string[];
  metadataKeySet: Set<string>;
  topCategories: string[];
  uniqueCategories: string[];
  semantic: SheetSemanticProfile;
  flags: {
    hasPhone: boolean;
    hasPrice: boolean;
    hasHours: boolean;
    hasAddress: boolean;
    hasAssets: boolean;
    hasPartners: boolean;
  };
  roleCounts: Record<string, number>;
}

interface RequirementEvaluation {
  requirement: InferredDataRequirement;
  status: EvaluationStatus;
  notes: string[];
  category: GapCategory;
  scoreWeight: number;
}

interface SheetEvaluation {
  detail: SheetCompatibilityDetail;
  evaluations: RequirementEvaluation[];
}

const PAGE_ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "analyze_page",
    description:
      "Phân tích một ảnh page social, suy ra vai trò, kiểu page, vùng UI chính và các requirement để tái tạo tương đương.",
    parameters: {
      type: "object",
      properties: {
        pageRole: { type: "string" },
        pageType: {
          type: "string",
          enum: [
            "cover",
            "board",
            "mixed_board",
            "itinerary",
            "checklist",
            "service_directory",
            "recap",
            "closing",
            "unknown",
          ],
        },
        summary: { type: "string" },
        layoutDensity: { type: "string", enum: ["low", "medium", "high"] },
        numberOfSections: { type: "number" },
        estimatedItemCount: { type: "number" },
        hasMainTitle: { type: "boolean" },
        hasSubtitle: { type: "boolean" },
        hasBackgroundImage: { type: "boolean" },
        hasPanel: { type: "boolean" },
        hasSectionImages: { type: "boolean" },
        hasListRepeater: { type: "boolean" },
        hasSlotRepeater: { type: "boolean" },
        hasPriceBadge: { type: "boolean" },
        hasCTA: { type: "boolean" },
        confidenceScore: { type: "number" },
        uiRegions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string" },
              label: { type: "string" },
              description: { type: "string" },
              estimatedItems: { type: "number" },
            },
            required: ["kind", "label", "description"],
          },
        },
        requiredFields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fieldKey: { type: "string" },
              label: { type: "string" },
              scope: { type: "string", enum: ["pack", "page", "section", "item", "asset"] },
              required: { type: "boolean" },
              kind: {
                type: "string",
                enum: ["data_field", "asset", "structural", "manual_literal"],
              },
              bindCandidate: { type: "string" },
              bindCandidates: { type: "array", items: { type: "string" } },
              examples: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
              acceptsManualInput: { type: "boolean" },
              minRecords: { type: "number" },
              assetRoleHint: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["fieldKey", "label", "scope", "required"],
          },
        },
      },
      required: [
        "pageRole",
        "pageType",
        "summary",
        "layoutDensity",
        "numberOfSections",
        "estimatedItemCount",
        "hasMainTitle",
        "hasSubtitle",
        "hasBackgroundImage",
        "hasPanel",
        "hasSectionImages",
        "hasListRepeater",
        "hasSlotRepeater",
        "hasPriceBadge",
        "hasCTA",
        "confidenceScore",
        "uiRegions",
        "requiredFields",
      ],
    },
  },
};

const PAGE_ANALYSIS_SYSTEM =
  "Bạn là Reverse Pack Analyzer. Mục tiêu là phân tích cấu trúc để tái tạo tương đương, không hứa clone pixel-perfect. " +
  "Trả lời ngắn gọn bằng tiếng Việt và luôn gọi tool analyze_page. " +
  "Khi liệt kê requiredFields, hãy ưu tiên field thật có thể bind như entity.name, entity.address, entity.phone, entity.openingHours, entity.priceRange, entity.categoryMain, entity.categorySub, entity.metadata.signatureDish, entity.metadata.description, asset.cover, asset.byRole:section_image, asset.byRole:facade, asset.byRole:food_closeup, asset.byRole:space. " +
  "Nếu requirement chỉ là text có thể gõ tay như ngày, tagline, CTA, tổng chi phí, subtitle, hãy đặt kind=manual_literal và required=false. " +
  "Nếu requirement là cấu trúc như danh sách lặp, nhóm section, số item cần lấp, hãy đặt kind=structural thay vì biến nó thành cột dữ liệu. " +
  "Nếu requirement là ảnh, hãy đặt kind=asset và cố gắng gợi ý asset role gần nhất. ";

const FIELD_CANDIDATES: Array<{
  bindingPath: string;
  aliases: string[];
  topField?: keyof Entity;
  metadataAliases?: string[];
}> = [
  {
    bindingPath: "entity.name",
    topField: "name",
    aliases: [
      "name",
      "ten",
      "ten_quan",
      "thuong_hieu",
      "brand",
      "ten dia diem",
      "ten dich vu",
    ],
  },
  {
    bindingPath: "entity.address",
    topField: "address",
    aliases: ["address", "dia chi", "dia_chi", "location", "vi tri", "addr", "khu vuc"],
  },
  {
    bindingPath: "entity.phone",
    topField: "phone",
    aliases: ["phone", "sdt", "hotline", "dien thoai", "lien he", "so dien thoai"],
    metadataAliases: ["phone", "sdt", "hotline", "dien_thoai", "contact"],
  },
  {
    bindingPath: "entity.openingHours",
    topField: "openingHours",
    aliases: ["opening hours", "gio mo cua", "hours", "open", "gio hoat dong"],
    metadataAliases: ["openinghours", "hours", "gio_mo_cua", "open"],
  },
  {
    bindingPath: "entity.priceRange",
    topField: "priceRange",
    aliases: [
      "price",
      "gia",
      "chi phi",
      "price range",
      "price_range",
      "budget",
      "price badge",
      "khoang gia",
    ],
    metadataAliases: ["price", "gia", "price_range", "priceRange", "chi_phi", "budget"],
  },
  {
    bindingPath: "entity.categoryMain",
    topField: "categoryMain",
    aliases: [
      "category",
      "category main",
      "loai",
      "loai hinh",
      "nhom chinh",
      "loai dich vu",
      "service type",
      "group",
    ],
    metadataAliases: [
      "category",
      "categorymain",
      "loai",
      "loai_hinh",
      "loai_dich_vu",
      "nhom",
      "service_type",
    ],
  },
  {
    bindingPath: "entity.categorySub",
    topField: "categorySub",
    aliases: ["subcategory", "category sub", "phong cach", "nhom phu", "loai phu"],
    metadataAliases: ["categorysub", "subcategory", "phong_cach", "loai_phu", "nhom_phu"],
  },
  {
    bindingPath: "entity.metadata.signatureDish",
    aliases: [
      "signature dish",
      "mon an noi bat",
      "mon noi bat",
      "highlight",
      "must try",
      "noi bat",
    ],
    metadataAliases: [
      "signaturedish",
      "mon_an_noi_bat",
      "mon_noi_bat",
      "highlight",
      "noi_bat",
      "signature",
    ],
  },
  {
    bindingPath: "entity.metadata.description",
    aliases: ["description", "mo ta", "ghi chu", "notes", "desc"],
    metadataAliases: ["description", "mo_ta", "ghi_chu", "notes", "desc"],
  },
];

const ASSET_CANDIDATES: Array<{
  bindingPath: string;
  aliases: string[];
  roles: string[];
}> = [
  {
    bindingPath: "asset.cover",
    aliases: ["cover image", "background image", "hero image", "anh nen", "cover", "background"],
    roles: ["cover", "space"],
  },
  {
    bindingPath: "asset.byRole:section_image",
    aliases: ["section image", "group image", "anh section", "anh nhom", "section visual"],
    roles: ["section_image", "space", "cover"],
  },
  {
    bindingPath: "asset.byRole:facade",
    aliases: ["facade", "mat tien", "front", "dia diem", "quan", "shop front"],
    roles: ["facade", "cover"],
  },
  {
    bindingPath: "asset.byRole:food_closeup",
    aliases: ["food image", "food closeup", "mon an", "dish", "food"],
    roles: ["food_closeup", "cover"],
  },
  {
    bindingPath: "asset.byRole:space",
    aliases: ["space", "view", "khong gian", "mood", "interior"],
    roles: ["space", "cover"],
  },
];

const MANUAL_HINTS = [
  "co the nhap tay",
  "tagline",
  "subtitle",
  "cta",
  "headline",
  "tieu de",
  "tieu de trang",
  "ten ngay",
  "so ngay",
  "tong chi phi",
  "tong budget",
  "nha nho",
  "nhan dia danh",
  "thoi luong",
];

const STRUCTURAL_HINTS = [
  "danh sach",
  "list",
  "repeater",
  "chuoi",
  "nhom",
  "group",
  "section",
  "block",
  "item",
  "slot",
  "luot lap",
];

const SERVICE_HINTS = [
  "dich vu",
  "service",
  "hotline",
  "van chuyen",
  "di chuyen",
  "homestay",
  "khach san",
  "tien ich",
  "thu xe",
  "xe",
  "spa",
];

const FOOD_HINTS = [
  "quan an",
  "food",
  "am thuc",
  "mon an",
  "restaurant",
  "eat",
  "an choi",
  "an uong",
];

const CAFE_HINTS = ["cafe", "coffee", "ca phe"];
const CHECKIN_HINTS = ["checkin", "check-in", "view", "song ao", "landmark", "canh", "diem den"];

const REQUIREMENT_ORDER: Record<RequirementKind, number> = {
  data_field: 0,
  asset: 1,
  structural: 2,
  manual_literal: 3,
};

function normalizeToken(input: string | undefined): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeKey(input: string | undefined): string {
  return normalizeToken(input).replace(/\s+/g, "_");
}

function limitText(text: string, max = 220): string {
  const safe = text.trim();
  return safe.length <= max ? safe : `${safe.slice(0, max - 1).trimEnd()}…`;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
}

function hasAny(text: string, hints: string[]): boolean {
  return hints.some((hint) => text.includes(normalizeToken(hint)));
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function typeFromRole(role: ComboRole): AnalyzedPageType {
  switch (role) {
    case "cover":
      return "cover";
    case "utilities":
      return "board";
    case "day":
      return "itinerary";
    case "outro":
      return "closing";
    default:
      return "unknown";
  }
}

function currentTemplateTypeFromAnalysis(pageType: AnalyzedPageType): PageTemplate["type"] {
  switch (pageType) {
    case "cover":
      return "cover";
    case "itinerary":
    case "checklist":
      return "itinerary";
    case "board":
    case "mixed_board":
    case "service_directory":
      return "board";
    case "recap":
    case "closing":
    case "unknown":
    default:
      return "mixed";
  }
}

export function compatibilityLabelText(level: CompatibilityLevel): string {
  switch (level) {
    case "very_compatible":
      return "Rất phù hợp";
    case "partial":
      return "Phù hợp một phần";
    case "significant_missing":
      return "Thiếu dữ liệu đáng kể";
    case "not_ready":
    default:
      return "Chưa thể generate";
  }
}

export function draftReadinessText(level: DraftReadiness): string {
  switch (level) {
    case "ready":
      return "Có thể mở editor ngay";
    case "needs_data":
      return "Cần bổ sung data trước";
    case "skeleton_only":
    default:
      return "Draft chỉ mang tính khung";
  }
}

function labelFromScore(score: number): CompatibilityLevel {
  if (score >= 85) return "very_compatible";
  if (score >= 60) return "partial";
  if (score >= 35) return "significant_missing";
  return "not_ready";
}

function scopeLabel(scope: InferredDataRequirement["scope"]): string {
  switch (scope) {
    case "pack":
      return "pack";
    case "page":
      return "page";
    case "section":
      return "section";
    case "item":
      return "item";
    case "asset":
      return "asset";
    default:
      return scope;
  }
}

function categoryFromRequirementKind(kind: RequirementKind): GapCategory {
  switch (kind) {
    case "asset":
      return "asset";
    case "structural":
      return "structure";
    case "manual_literal":
      return "manual";
    case "data_field":
    default:
      return "field";
  }
}

function pickBestAssetCandidate(text: string): string[] {
  const normalized = normalizeToken(text);
  const matches = ASSET_CANDIDATES.filter((item) => hasAny(normalized, item.aliases)).map(
    (item) => item.bindingPath,
  );
  return uniqueStrings(matches);
}

function pickBestFieldCandidates(text: string): string[] {
  const normalized = normalizeToken(text);
  const matches = FIELD_CANDIDATES.filter((item) => hasAny(normalized, item.aliases)).map(
    (item) => item.bindingPath,
  );
  return uniqueStrings(matches);
}

function inferRequirementKind(
  raw: PageAnalysisToolResult["requiredFields"][number],
): RequirementKind {
  const source = normalizeToken(`${raw.fieldKey} ${raw.label} ${raw.notes ?? ""}`);
  const explicit = raw.kind;
  if (explicit) return explicit;
  if (raw.scope === "asset" || raw.bindCandidate?.startsWith("asset.")) return "asset";
  if (hasAny(source, MANUAL_HINTS) || raw.acceptsManualInput) return "manual_literal";
  if (hasAny(source, STRUCTURAL_HINTS)) return "structural";
  if (pickBestAssetCandidate(source).length > 0) return "asset";
  return "data_field";
}

function inferAssetRoleHint(
  raw: PageAnalysisToolResult["requiredFields"][number],
  candidates: string[],
): string | undefined {
  if (raw.assetRoleHint) return raw.assetRoleHint;
  const fromCandidate = candidates.find((candidate) => candidate.startsWith("asset.byRole:"));
  if (fromCandidate) return fromCandidate.slice("asset.byRole:".length);

  const normalized = normalizeToken(`${raw.fieldKey} ${raw.label}`);
  if (hasAny(normalized, ["background", "hero", "cover", "anh nen"])) return "cover";
  if (hasAny(normalized, ["section", "nhom", "group"])) return "section_image";
  if (hasAny(normalized, ["mat tien", "facade", "front"])) return "facade";
  if (hasAny(normalized, ["food", "mon an", "dish"])) return "food_closeup";
  if (hasAny(normalized, ["space", "khong gian", "view"])) return "space";
  return undefined;
}

function canonicalRequirementKey(
  kind: RequirementKind,
  label: string,
  fieldKey: string,
  bindCandidates: string[],
): string {
  const source = normalizeToken(`${label} ${fieldKey}`);
  if (kind === "data_field" && bindCandidates[0]?.startsWith("entity.")) {
    return bindCandidates[0];
  }
  if (kind === "asset") {
    if (hasAny(source, ["background", "hero", "cover", "anh nen"])) {
      return "asset.cover_background";
    }
    if (hasAny(source, ["section", "nhom", "group"])) {
      return "asset.section_image";
    }
    if (hasAny(source, ["mat tien", "facade", "front"])) {
      return "asset.facade";
    }
    if (hasAny(source, ["food", "mon an", "dish"])) {
      return "asset.food_closeup";
    }
    if (hasAny(source, ["space", "khong gian", "view"])) {
      return "asset.space";
    }
    if (hasAny(source, ["dai dien", "avatar", "item image", "anh item"])) {
      return "asset.item_image";
    }
  }
  if (kind === "structural") {
    if (hasAny(source, ["danh sach", "list", "item", "repeater", "slot"])) {
      return "structural.item_list";
    }
    if (hasAny(source, ["section", "nhom", "group", "block"])) {
      return "structural.section_groups";
    }
    return `structural.${normalizeKey(fieldKey || label) || "layout"}`;
  }
  if (kind === "manual_literal") {
    if (hasAny(source, ["cta", "call to action"])) return "manual.cta";
    if (hasAny(source, ["subtitle", "tagline", "mo ta"])) return "manual.subtitle";
    if (hasAny(source, ["ngay", "day"])) return "manual.day_label";
    if (hasAny(source, ["tong chi phi", "budget"])) return "manual.budget";
    if (hasAny(source, ["title", "tieu de", "headline"])) return "manual.title";
    return `manual.${normalizeKey(fieldKey || label) || "text"}`;
  }
  return normalizeKey(fieldKey || label) || "unknown_requirement";
}

function makeRequirement(
  partial: Omit<InferredDataRequirement, "requirementId">,
): InferredDataRequirement {
  return {
    requirementId: nanoid(),
    ...partial,
    bindCandidate: partial.bindCandidate ?? partial.bindCandidates?.[0],
  };
}

function normalizeRequirement(
  raw: PageAnalysisToolResult["requiredFields"][number],
  page: Pick<
    AnalyzedPage,
    "pageType" | "estimatedItemCount" | "numberOfSections" | "hasPriceBadge" | "hasSectionImages"
  >,
): InferredDataRequirement {
  const kind = inferRequirementKind(raw);
  const inferredCandidates =
    kind === "asset"
      ? pickBestAssetCandidate(`${raw.label} ${raw.fieldKey}`)
      : kind === "data_field"
        ? pickBestFieldCandidates(`${raw.label} ${raw.fieldKey}`)
        : [];
  const bindCandidates = uniqueStrings([
    raw.bindCandidate,
    ...(raw.bindCandidates ?? []),
    ...inferredCandidates,
  ]);
  const acceptsManualInput =
    raw.acceptsManualInput ??
    (kind === "manual_literal" ||
    normalizeToken(raw.notes).includes("co the nhap tay"));
  const normalizedKind = acceptsManualInput ? "manual_literal" : kind;
  const minRecords =
    raw.minRecords ??
    (normalizedKind === "structural"
      ? page.pageType === "service_directory"
        ? Math.max(2, page.numberOfSections || 2)
        : Math.max(1, page.estimatedItemCount || 0)
      : undefined);

  return makeRequirement({
    fieldKey: canonicalRequirementKey(normalizedKind, raw.label, raw.fieldKey, bindCandidates),
    label: raw.label,
    scope: raw.scope,
    required: normalizedKind === "manual_literal" ? false : raw.required,
    kind: normalizedKind,
    bindCandidate: bindCandidates[0],
    bindCandidates,
    examples: raw.examples,
    notes: raw.notes,
    acceptsManualInput: acceptsManualInput || undefined,
    minRecords,
    assetRoleHint: inferAssetRoleHint(raw, bindCandidates),
    confidence: raw.confidence,
  });
}

function normalizeRegion(raw: PageAnalysisToolResult["uiRegions"][number]): AnalyzedUiRegion {
  return {
    regionId: nanoid(),
    kind: raw.kind,
    label: raw.label,
    description: raw.description,
    estimatedItems: raw.estimatedItems,
  };
}

function buildBaseRequirements(
  page: Pick<
    AnalyzedPage,
    | "pageType"
    | "estimatedItemCount"
    | "numberOfSections"
    | "hasPriceBadge"
    | "hasSectionImages"
    | "hasBackgroundImage"
    | "hasCTA"
    | "hasSubtitle"
    | "suggestedName"
  >,
): InferredDataRequirement[] {
  const itemCount = Math.max(1, page.estimatedItemCount || 0);
  const sectionCount = Math.max(1, page.numberOfSections || 0);

  switch (page.pageType) {
    case "cover":
      return [
        makeRequirement({
          fieldKey: "asset.cover_background",
          label: "Ảnh nền cover",
          scope: "asset",
          required: true,
          kind: "asset",
          bindCandidates: ["asset.cover", "asset.byRole:space"],
          assetRoleHint: "cover",
          confidence: 0.9,
        }),
        makeRequirement({
          fieldKey: "manual.title",
          label: "Tiêu đề chính cover",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
        makeRequirement({
          fieldKey: "manual.subtitle",
          label: "Dòng mô tả ngắn / tagline",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
      ];
    case "itinerary":
    case "checklist":
      return [
        makeRequirement({
          fieldKey: "structural.item_list",
          label: "Danh sách điểm trong ngày",
          scope: "section",
          required: true,
          kind: "structural",
          minRecords: Math.max(3, itemCount),
          structuralHint: `Cần đủ khoảng ${Math.max(3, itemCount)} item khác nhau để lấp page.`,
        }),
        makeRequirement({
          fieldKey: "entity.name",
          label: "Tên địa điểm",
          scope: "item",
          required: true,
          kind: "data_field",
          bindCandidates: ["entity.name"],
          confidence: 0.95,
        }),
        makeRequirement({
          fieldKey: "entity.address",
          label: "Địa chỉ ngắn",
          scope: "item",
          required: true,
          kind: "data_field",
          bindCandidates: ["entity.address"],
          confidence: 0.9,
        }),
        makeRequirement({
          fieldKey: "entity.priceRange",
          label: "Chi phí / badge giá",
          scope: "item",
          required: page.hasPriceBadge,
          kind: "data_field",
          bindCandidates: ["entity.priceRange"],
          confidence: 0.8,
        }),
        makeRequirement({
          fieldKey: "asset.item_image",
          label: "Ảnh đại diện item",
          scope: "asset",
          required: true,
          kind: "asset",
          bindCandidates: [
            "asset.cover",
            "asset.byRole:food_closeup",
            "asset.byRole:facade",
            "asset.byRole:space",
          ],
          assetRoleHint: "cover",
          confidence: 0.85,
        }),
        makeRequirement({
          fieldKey: "entity.openingHours",
          label: "Giờ mở cửa",
          scope: "item",
          required: false,
          kind: "data_field",
          bindCandidates: ["entity.openingHours"],
        }),
        makeRequirement({
          fieldKey: "entity.phone",
          label: "Số điện thoại / hotline",
          scope: "item",
          required: false,
          kind: "data_field",
          bindCandidates: ["entity.phone"],
        }),
        makeRequirement({
          fieldKey: "manual.day_label",
          label: "Nhãn ngày / tiêu đề trang",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
        makeRequirement({
          fieldKey: "manual.budget",
          label: "Tổng chi phí dự kiến",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
      ];
    case "service_directory":
      return [
        makeRequirement({
          fieldKey: "structural.section_groups",
          label: "Nhiều nhóm dịch vụ trên cùng page",
          scope: "section",
          required: true,
          kind: "structural",
          minRecords: Math.max(2, sectionCount),
          structuralHint: `Cần khoảng ${Math.max(2, sectionCount)} nhóm / category để chia section.`,
        }),
        makeRequirement({
          fieldKey: "structural.item_list",
          label: "Danh sách item dịch vụ",
          scope: "section",
          required: true,
          kind: "structural",
          minRecords: Math.max(4, itemCount || sectionCount * 2),
          structuralHint: "Cần đủ record để lấp các nhóm dịch vụ.",
        }),
        makeRequirement({
          fieldKey: "entity.name",
          label: "Tên dịch vụ / đơn vị",
          scope: "item",
          required: true,
          kind: "data_field",
          bindCandidates: ["entity.name"],
          confidence: 0.95,
        }),
        makeRequirement({
          fieldKey: "entity.categoryMain",
          label: "Loại dịch vụ / nhóm chính",
          scope: "item",
          required: true,
          kind: "data_field",
          bindCandidates: ["entity.categoryMain"],
          confidence: 0.9,
        }),
        makeRequirement({
          fieldKey: "entity.phone",
          label: "Số điện thoại / hotline",
          scope: "item",
          required: true,
          kind: "data_field",
          bindCandidates: ["entity.phone"],
          confidence: 0.9,
        }),
        makeRequirement({
          fieldKey: "entity.priceRange",
          label: "Giá hoặc khoảng giá",
          scope: "item",
          required: page.hasPriceBadge,
          kind: "data_field",
          bindCandidates: ["entity.priceRange"],
        }),
        makeRequirement({
          fieldKey: "entity.address",
          label: "Địa chỉ",
          scope: "item",
          required: false,
          kind: "data_field",
          bindCandidates: ["entity.address"],
        }),
        makeRequirement({
          fieldKey: "entity.openingHours",
          label: "Giờ hoạt động",
          scope: "item",
          required: false,
          kind: "data_field",
          bindCandidates: ["entity.openingHours"],
        }),
        makeRequirement({
          fieldKey: "asset.section_image",
          label: "Ảnh section / ảnh dịch vụ",
          scope: "asset",
          required: page.hasSectionImages,
          kind: "asset",
          bindCandidates: ["asset.byRole:section_image", "asset.byRole:facade", "asset.cover"],
          assetRoleHint: "section_image",
        }),
        makeRequirement({
          fieldKey: "manual.title",
          label: "Tiêu đề trang",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
      ];
    case "board":
    case "mixed_board":
      return [
        makeRequirement({
          fieldKey: "structural.section_groups",
          label: "Nhiều block / section nội dung",
          scope: "section",
          required: true,
          kind: "structural",
          minRecords: Math.max(2, sectionCount),
          structuralHint: `Nên có tối thiểu ${Math.max(2, sectionCount)} cụm nội dung.`,
        }),
        makeRequirement({
          fieldKey: "entity.name",
          label: "Tên item / địa điểm",
          scope: "item",
          required: true,
          kind: "data_field",
          bindCandidates: ["entity.name"],
          confidence: 0.9,
        }),
        makeRequirement({
          fieldKey: "entity.address",
          label: "Địa chỉ / mô tả ngắn",
          scope: "item",
          required: false,
          kind: "data_field",
          bindCandidates: ["entity.address", "entity.metadata.description"],
        }),
        makeRequirement({
          fieldKey: "entity.priceRange",
          label: "Giá / ngân sách",
          scope: "item",
          required: page.hasPriceBadge,
          kind: "data_field",
          bindCandidates: ["entity.priceRange"],
        }),
        makeRequirement({
          fieldKey: "asset.item_image",
          label: "Ảnh minh hoạ nội dung",
          scope: "asset",
          required: page.hasSectionImages || page.hasBackgroundImage,
          kind: "asset",
          bindCandidates: ["asset.byRole:section_image", "asset.byRole:space", "asset.cover"],
          assetRoleHint: "section_image",
        }),
        makeRequirement({
          fieldKey: "manual.title",
          label: "Tiêu đề trang",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
      ];
    case "recap":
    case "closing":
    case "unknown":
    default:
      return [
        makeRequirement({
          fieldKey: "asset.cover_background",
          label: "Ảnh nền / ảnh minh hoạ chính",
          scope: "asset",
          required: page.hasBackgroundImage,
          kind: "asset",
          bindCandidates: ["asset.cover", "asset.byRole:space"],
          assetRoleHint: "cover",
        }),
        makeRequirement({
          fieldKey: "manual.title",
          label: "Tiêu đề chính",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
        makeRequirement({
          fieldKey: "manual.subtitle",
          label: page.hasCTA ? "CTA / subtitle" : "Subtitle / mô tả ngắn",
          scope: "page",
          required: false,
          kind: "manual_literal",
          acceptsManualInput: true,
          notes: "Có thể nhập tay",
        }),
      ];
  }
}

function mergeRequirements(
  page: Pick<
    AnalyzedPage,
    | "pageType"
    | "estimatedItemCount"
    | "numberOfSections"
    | "hasPriceBadge"
    | "hasSectionImages"
    | "hasBackgroundImage"
    | "hasCTA"
    | "hasSubtitle"
    | "suggestedName"
  >,
  rawRequirements: PageAnalysisToolResult["requiredFields"],
): InferredDataRequirement[] {
  const merged = new Map<string, InferredDataRequirement>();
  const upsert = (requirement: InferredDataRequirement) => {
    const existing = merged.get(requirement.fieldKey);
    if (!existing) {
      merged.set(requirement.fieldKey, requirement);
      return;
    }

    merged.set(requirement.fieldKey, {
      ...existing,
      label: existing.label.length >= requirement.label.length ? existing.label : requirement.label,
      required: existing.required || requirement.required,
      notes: uniqueStrings([existing.notes, requirement.notes]).join(" · ") || undefined,
      bindCandidates: uniqueStrings([
        ...(existing.bindCandidates ?? []),
        ...(requirement.bindCandidates ?? []),
        existing.bindCandidate,
        requirement.bindCandidate,
      ]),
      bindCandidate:
        existing.bindCandidate ??
        requirement.bindCandidate ??
        existing.bindCandidates?.[0] ??
        requirement.bindCandidates?.[0],
      acceptsManualInput: existing.acceptsManualInput || requirement.acceptsManualInput,
      minRecords: Math.max(existing.minRecords ?? 0, requirement.minRecords ?? 0) || undefined,
      confidence: Math.max(existing.confidence ?? 0, requirement.confidence ?? 0) || undefined,
      assetRoleHint: existing.assetRoleHint ?? requirement.assetRoleHint,
    });
  };

  buildBaseRequirements(page).forEach(upsert);
  rawRequirements.map((item) => normalizeRequirement(item, page)).forEach(upsert);

  return Array.from(merged.values()).sort((a, b) => {
    const kindOrder = REQUIREMENT_ORDER[a.kind ?? "data_field"] - REQUIREMENT_ORDER[b.kind ?? "data_field"];
    if (kindOrder !== 0) return kindOrder;
    if (a.required !== b.required) return a.required ? -1 : 1;
    return `${scopeLabel(a.scope)}:${a.label}`.localeCompare(`${scopeLabel(b.scope)}:${b.label}`, "vi");
  });
}

function normalizePageAnalysis(
  raw: PageAnalysisToolResult,
  pageIndex: number,
  suggestedName: string,
  layoutJson: string | undefined,
): Omit<AnalyzedPage, "compatibility"> {
  const draft = {
    pageIndex,
    pageRole: raw.pageRole,
    pageType: raw.pageType,
    suggestedName,
    summary: limitText(raw.summary, 320),
    layoutDensity: raw.layoutDensity,
    numberOfSections: raw.numberOfSections,
    estimatedItemCount: raw.estimatedItemCount,
    hasMainTitle: raw.hasMainTitle,
    hasSubtitle: raw.hasSubtitle,
    hasBackgroundImage: raw.hasBackgroundImage,
    hasPanel: raw.hasPanel,
    hasSectionImages: raw.hasSectionImages,
    hasListRepeater: raw.hasListRepeater,
    hasSlotRepeater: raw.hasSlotRepeater,
    hasPriceBadge: raw.hasPriceBadge,
    hasCTA: raw.hasCTA,
    confidenceScore: raw.confidenceScore,
    uiRegions: raw.uiRegions.map(normalizeRegion),
    layoutJson,
  };

  return {
    ...draft,
    requiredFields: mergeRequirements(draft, raw.requiredFields),
  };
}

function normalizePageAnalysisFromBlueprint(params: {
  dataBlueprint: DataBlueprint;
  visualBlueprint?: VisualBlueprint;
  pageIndex: number;
  suggestedName: string;
  layoutJson?: string;
}): Omit<AnalyzedPage, "compatibility"> {
  const { dataBlueprint, visualBlueprint, pageIndex, suggestedName, layoutJson } = params;
  const normalized = normalizePageAnalysis(
    {
      pageRole: dataBlueprint.pageRole,
      pageType: dataBlueprint.pageType,
      summary: dataBlueprint.summary,
      layoutDensity: dataBlueprint.layoutDensity,
      numberOfSections: dataBlueprint.numberOfSections,
      estimatedItemCount: dataBlueprint.estimatedItemCount,
      hasMainTitle: dataBlueprint.hasMainTitle,
      hasSubtitle: dataBlueprint.hasSubtitle,
      hasBackgroundImage: dataBlueprint.hasBackgroundImage,
      hasPanel: dataBlueprint.hasPanel,
      hasSectionImages: dataBlueprint.hasSectionImages,
      hasListRepeater: dataBlueprint.hasListRepeater,
      hasSlotRepeater: dataBlueprint.hasSlotRepeater,
      hasPriceBadge: dataBlueprint.hasPriceBadge,
      hasCTA: dataBlueprint.hasCTA,
      confidenceScore:
        dataBlueprint.structureConfidence ??
        dataBlueprint.bindingConfidence ??
        visualBlueprint?.confidence ??
        0.72,
      uiRegions: dataBlueprint.uiRegions,
      requiredFields: dataBlueprint.requiredFields,
    },
    pageIndex,
    suggestedName,
    layoutJson,
  );

  return {
    ...normalized,
    visualBlueprint,
    dataBlueprint,
    visualConfidence: visualBlueprint?.confidence,
    structureConfidence: dataBlueprint.structureConfidence,
    bindingConfidence: dataBlueprint.bindingConfidence,
  };
}

function sheetNamesFromEntities(entities: Entity[]): string[] {
  return Array.from(
    new Set(entities.map((entity) => entity.sheetName || "default").filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b, "vi"));
}

function hasTopLevelField(entities: Entity[], field: keyof Entity): boolean {
  return entities.some((entity) => hasValue(entity[field]));
}

function metadataKeys(entities: Entity[]): string[] {
  const set = new Set<string>();
  for (const entity of entities) {
    Object.keys(entity.metadata ?? {}).forEach((key) => {
      if (hasValue(entity.metadata?.[key])) set.add(key);
    });
  }
  return Array.from(set);
}

function buildSheetProfiles(entities: Entity[], assets: Asset[]): SheetProfile[] {
  return sheetNamesFromEntities(entities).map((sheetName) => {
    const sheetEntities = entities.filter((entity) => (entity.sheetName || "default") === sheetName);
    const entityIds = new Set(sheetEntities.map((entity) => entity.entityId));
    const sheetAssets = assets.filter((asset) => entityIds.has(asset.entityId));
    const metadata = metadataKeys(sheetEntities);
    const categories = sheetEntities
      .flatMap((entity) => [entity.categoryMain, entity.categorySub])
      .filter(Boolean)
      .map((value) => String(value));
    const categoryCounts = new Map<string, number>();
    for (const category of categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
    const topCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([value]) => value);
    const roleCounts: Record<string, number> = {};
    for (const asset of sheetAssets) {
      roleCounts[asset.role] = (roleCounts[asset.role] ?? 0) + 1;
    }

    const signalText = normalizeToken(
      [
        sheetName,
        ...categories,
        ...metadata,
        ...sheetEntities.map((entity) => entity.name),
      ].join(" "),
    );

    const semanticScores: Record<SheetSemanticProfile, number> = {
      food: 0,
      cafe: 0,
      service: 0,
      homestay: 0,
      checkin: 0,
      mixed: 0,
      other: 0,
    };

    if (hasAny(signalText, FOOD_HINTS)) semanticScores.food += 8;
    if (hasAny(signalText, CAFE_HINTS)) semanticScores.cafe += 10;
    if (hasAny(signalText, SERVICE_HINTS)) semanticScores.service += 10;
    if (hasAny(signalText, ["homestay", "khach san", "hotel", "villa", "luu tru"])) {
      semanticScores.homestay += 12;
      semanticScores.service += 2;
    }
    if (hasAny(signalText, CHECKIN_HINTS)) semanticScores.checkin += 10;
    if (topCategories.length > 2) semanticScores.mixed += 4;
    if (sheetEntities.length > 20) semanticScores.mixed += 2;
    if (sheetAssets.length > 0) semanticScores.mixed += 2;
    if (sheetEntities.some((entity) => entity.phone)) semanticScores.service += 2;
    if (sheetEntities.some((entity) => entity.openingHours)) semanticScores.service += 1;
    if (sheetEntities.some((entity) => entity.priceRange)) {
      semanticScores.food += 2;
      semanticScores.cafe += 1;
      semanticScores.service += 1;
    }

    const semantic = (Object.entries(semanticScores).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "other") as SheetSemanticProfile;

    return {
      sheetName,
      entities: sheetEntities,
      assets: sheetAssets,
      rowCount: sheetEntities.length,
      assetCount: sheetAssets.length,
      coverAssetCount: sheetAssets.filter((asset) => asset.isCover || asset.role === "cover").length,
      metadataKeys: metadata,
      metadataKeySet: new Set(metadata.map((key) => normalizeKey(key))),
      topCategories,
      uniqueCategories: Array.from(new Set(categories.map((value) => normalizeKey(value)))),
      semantic,
      flags: {
        hasPhone: hasTopLevelField(sheetEntities, "phone"),
        hasPrice: hasTopLevelField(sheetEntities, "priceRange"),
        hasHours: hasTopLevelField(sheetEntities, "openingHours"),
        hasAddress: hasTopLevelField(sheetEntities, "address"),
        hasAssets: sheetAssets.length > 0,
        hasPartners: sheetEntities.some((entity) => entity.partnerFlag),
      },
      roleCounts,
    };
  });
}

function describeSheetSemantic(profile: SheetProfile): string {
  switch (profile.semantic) {
    case "service":
      return "sheet thiên về dịch vụ / tiện ích";
    case "homestay":
      return "sheet thiên về homestay / lưu trú";
    case "cafe":
      return "sheet thiên về cafe";
    case "food":
      return "sheet thiên về ăn uống";
    case "checkin":
      return "sheet thiên về điểm check-in / cảnh";
    case "mixed":
      return "sheet mixed, phủ nhiều nhóm nội dung";
    case "other":
    default:
      return "sheet tổng hợp";
  }
}

function findFieldDescriptor(bindingPath: string) {
  return FIELD_CANDIDATES.find((item) => item.bindingPath === bindingPath);
}

function evaluateDataRequirement(
  requirement: InferredDataRequirement,
  profile: SheetProfile,
): { status: EvaluationStatus; notes: string[] } {
  const notes: string[] = [];
  const candidates = uniqueStrings([
    requirement.bindCandidate,
    ...(requirement.bindCandidates ?? []),
  ]).filter((candidate) => candidate.startsWith("entity."));
  const metadataSet = profile.metadataKeySet;

  for (const candidate of candidates) {
    const descriptor = findFieldDescriptor(candidate);
    if (!descriptor) {
      if (candidate.startsWith("entity.metadata.")) {
        const target = normalizeKey(candidate.slice("entity.metadata.".length));
        if (metadataSet.has(target)) return { status: "have", notes };
        if (Array.from(metadataSet).some((key) => key.includes(target) || target.includes(key))) {
          return { status: "mappable", notes: [`Có metadata gần nghĩa với "${target}".`] };
        }
      }
      continue;
    }

    if (descriptor.topField && hasTopLevelField(profile.entities, descriptor.topField)) {
      return { status: "have", notes };
    }

    const aliases = (descriptor.metadataAliases ?? descriptor.aliases).map(normalizeKey);
    const directAlias = aliases.find((alias) => metadataSet.has(alias));
    if (directAlias) {
      return {
        status: descriptor.topField ? "mappable" : "have",
        notes: descriptor.topField
          ? [`Có thể map từ metadata "${directAlias}".`]
          : [`Metadata "${directAlias}" đã có.`],
      };
    }

    const fuzzyAlias = aliases.find((alias) =>
      Array.from(metadataSet).some((key) => key.includes(alias) || alias.includes(key)),
    );
    if (fuzzyAlias) {
      notes.push(`Có cột metadata gần nghĩa với "${fuzzyAlias}".`);
    }
  }

  if (notes.length > 0) return { status: "mappable", notes };
  return { status: "missing", notes };
}

function evaluateAssetRequirement(
  requirement: InferredDataRequirement,
  profile: SheetProfile,
): { status: EvaluationStatus; notes: string[] } {
  const notes: string[] = [];
  if (profile.assetCount === 0) {
    return { status: "missing", notes };
  }

  const candidatePaths = uniqueStrings([
    requirement.bindCandidate,
    ...(requirement.bindCandidates ?? []),
  ]).filter((candidate) => candidate.startsWith("asset."));

  for (const candidate of candidatePaths) {
    if (candidate === "asset.cover") {
      if (profile.coverAssetCount > 0 || (profile.roleCounts.cover ?? 0) > 0) {
        return { status: "have", notes };
      }
      notes.push("Có ảnh nhưng chưa có asset cover rõ ràng.");
      continue;
    }

    const role = candidate.startsWith("asset.byRole:") ? candidate.slice("asset.byRole:".length) : undefined;
    if (role && (profile.roleCounts[role] ?? 0) > 0) {
      return { status: "have", notes };
    }
    if (role) {
      notes.push(`Có ảnh nhưng chưa gán role "${role}".`);
    }
  }

  if (profile.assetCount > 0) {
    return { status: "mappable", notes };
  }
  return { status: "missing", notes };
}

function evaluateStructuralRequirement(
  requirement: InferredDataRequirement,
  page: Omit<AnalyzedPage, "compatibility">,
  profile: SheetProfile,
): { status: EvaluationStatus; notes: string[]; scoreWeight: number } {
  const notes: string[] = [];
  const needRecords = Math.max(
    1,
    requirement.minRecords ??
      (requirement.fieldKey === "structural.item_list"
        ? Math.max(1, page.estimatedItemCount || 0)
        : Math.max(1, page.numberOfSections || 0)),
  );

  if (requirement.fieldKey === "structural.item_list") {
    if (profile.rowCount >= needRecords) {
      notes.push(`Có ${profile.rowCount} record, đủ để lấp khoảng ${needRecords} item.`);
      return { status: "have", notes, scoreWeight: 1 };
    }
    if (profile.rowCount > 0) {
      notes.push(`Chỉ có ${profile.rowCount}/${needRecords} record, có thể dựng bản tương đương.`);
      return { status: "mappable", notes, scoreWeight: 0.55 };
    }
    notes.push("Không có record để dựng danh sách lặp.");
    return { status: "missing", notes, scoreWeight: 0 };
  }

  if (requirement.fieldKey === "structural.section_groups") {
    const availableGroups = Math.max(profile.uniqueCategories.length, profile.topCategories.length);
    if (availableGroups >= needRecords) {
      notes.push(`Có khoảng ${availableGroups} nhóm / category, đủ chia section.`);
      return { status: "have", notes, scoreWeight: 1 };
    }
    if (profile.rowCount >= needRecords) {
      notes.push(
        `Đủ record nhưng mới có khoảng ${availableGroups} nhóm rõ ràng, cần đặt title section thủ công.`,
      );
      return { status: "mappable", notes, scoreWeight: 0.55 };
    }
    notes.push(`Thiếu cả số nhóm lẫn số record để dựng ${needRecords} section.`);
    return { status: "missing", notes, scoreWeight: 0 };
  }

  if (profile.rowCount >= needRecords) {
    notes.push(`Có ${profile.rowCount} record, đủ cho yêu cầu cấu trúc hiện tại.`);
    return { status: "have", notes, scoreWeight: 1 };
  }
  if (profile.rowCount > 0) {
    notes.push(`Có ${profile.rowCount}/${needRecords} record, cần nới layout hoặc giảm item.`);
    return { status: "mappable", notes, scoreWeight: 0.5 };
  }
  notes.push("Thiếu record để dựng cấu trúc page.");
  return { status: "missing", notes, scoreWeight: 0 };
}

function semanticBoostForPage(
  page: Omit<AnalyzedPage, "compatibility">,
  profile: SheetProfile,
): { score: number; reasons: string[] } {
  const reasons: string[] = [describeSheetSemantic(profile)];
  const serviceish =
    page.pageType === "service_directory" ||
    page.requiredFields.some(
      (requirement) =>
        requirement.bindCandidate === "entity.phone" ||
        requirement.bindCandidate === "entity.categoryMain",
    );

  switch (page.pageType) {
    case "service_directory":
      if (profile.semantic === "service") return { score: 12, reasons };
      if (profile.semantic === "homestay") return { score: 8, reasons };
      if (profile.semantic === "mixed") return { score: 5, reasons };
      return { score: -4, reasons };
    case "itinerary":
    case "checklist":
      if (profile.semantic === "food" || profile.semantic === "cafe") return { score: 9, reasons };
      if (profile.semantic === "checkin") return { score: 8, reasons };
      if (profile.semantic === "mixed") return { score: 6, reasons };
      if (serviceish && (profile.semantic === "service" || profile.semantic === "homestay")) {
        return { score: 6, reasons };
      }
      return { score: 2, reasons };
    case "cover":
      if (profile.semantic === "checkin") return { score: 10, reasons };
      if (profile.semantic === "mixed") return { score: 6, reasons };
      if (profile.semantic === "cafe" || profile.semantic === "homestay") {
        return { score: 5, reasons };
      }
      return { score: 2, reasons };
    case "board":
    case "mixed_board":
      if (serviceish && profile.semantic === "service") return { score: 10, reasons };
      if (serviceish && profile.semantic === "homestay") return { score: 7, reasons };
      if (profile.semantic === "food" || profile.semantic === "cafe") return { score: 7, reasons };
      if (profile.semantic === "mixed") return { score: 6, reasons };
      return { score: 3, reasons };
    case "recap":
    case "closing":
    case "unknown":
    default:
      if (profile.semantic === "mixed") return { score: 6, reasons };
      return { score: 3, reasons };
  }
}

function evaluateRequirement(
  requirement: InferredDataRequirement,
  page: Omit<AnalyzedPage, "compatibility">,
  profile: SheetProfile,
): RequirementEvaluation {
  const kind = requirement.kind ?? "data_field";
  const category = categoryFromRequirementKind(kind);

  if (kind === "manual_literal") {
    return {
      requirement,
      status: "mappable",
      notes: [requirement.notes || "Có thể nhập tay khi dựng draft hoặc chỉnh trong editor."],
      category,
      scoreWeight: 0.5,
    };
  }

  if (kind === "structural") {
    const result = evaluateStructuralRequirement(requirement, page, profile);
    return {
      requirement,
      status: result.status,
      notes: result.notes,
      category,
      scoreWeight: result.scoreWeight,
    };
  }

  if (kind === "asset") {
    const result = evaluateAssetRequirement(requirement, profile);
    return {
      requirement,
      status: result.status,
      notes: result.notes,
      category,
      scoreWeight: result.status === "have" ? 1 : result.status === "mappable" ? 0.6 : 0,
    };
  }

  const result = evaluateDataRequirement(requirement, profile);
  return {
    requirement,
    status: result.status,
    notes: result.notes,
    category,
    scoreWeight: result.status === "have" ? 1 : result.status === "mappable" ? 0.5 : 0,
  };
}

function detailReasonSummary(
  available: string[],
  mappable: string[],
  missingRequired: string[],
  semanticReasons: string[],
  structureNotes: string[],
  assetNotes: string[],
): { reasons: string[]; summary: string } {
  const positives = [
    ...semanticReasons,
    available.length > 0 ? `Có ${available.slice(0, 3).join(", ")}.` : "",
    structureNotes.find((note) => note.toLowerCase().includes("đủ")) ?? "",
  ].filter(Boolean);

  const negatives = [
    missingRequired.length > 0 ? `Thiếu ${missingRequired.slice(0, 2).join(", ")}.` : "",
    assetNotes[0] ?? "",
    mappable.length > 0 ? `Một số field còn ở mức có thể map: ${mappable.slice(0, 2).join(", ")}.` : "",
  ].filter(Boolean);

  const reasons = uniqueStrings([...positives.slice(0, 3), ...negatives.slice(0, 2)]);
  return {
    reasons,
    summary: uniqueStrings([positives[0], positives[1], negatives[0]]).join(" "),
  };
}

function buildSheetCompatibilityDetail(
  page: Omit<AnalyzedPage, "compatibility">,
  profile: SheetProfile,
): SheetEvaluation {
  const evaluations = page.requiredFields.map((requirement) =>
    evaluateRequirement(requirement, page, profile),
  );

  const coreRequired = evaluations.filter(
    (evaluation) =>
      (evaluation.requirement.kind === "data_field" || evaluation.requirement.kind === "asset") &&
      evaluation.requirement.required,
  );
  const coreAll = evaluations.filter(
    (evaluation) =>
      evaluation.requirement.kind === "data_field" || evaluation.requirement.kind === "asset",
  );
  const assetEvaluations = evaluations.filter((evaluation) => evaluation.requirement.kind === "asset");
  const structuralEvaluations = evaluations.filter(
    (evaluation) => evaluation.requirement.kind === "structural",
  );

  const availableFields = evaluations
    .filter((evaluation) => evaluation.status === "have" && evaluation.category === "field")
    .map((evaluation) => evaluation.requirement.label);
  const mappableFields = evaluations
    .filter((evaluation) => evaluation.status === "mappable" && evaluation.category === "field")
    .map((evaluation) => evaluation.requirement.label);
  const missingRequired = evaluations
    .filter((evaluation) => evaluation.status === "missing" && evaluation.requirement.required)
    .map((evaluation) => evaluation.requirement.label);
  const missingOptional = evaluations
    .filter((evaluation) => evaluation.status === "missing" && !evaluation.requirement.required)
    .map((evaluation) => evaluation.requirement.label);
  const structureNotes = structuralEvaluations.flatMap((evaluation) => evaluation.notes);
  const assetNotes = assetEvaluations.flatMap((evaluation) => evaluation.notes);

  const requiredHave = coreRequired.filter((evaluation) => evaluation.status === "have").length;
  const requiredScore =
    coreRequired.length === 0 ? 60 : (requiredHave / coreRequired.length) * 60;
  const mappableScore =
    coreAll.length === 0
      ? 15
      : (coreAll.filter((evaluation) => evaluation.status === "mappable").length / coreAll.length) * 15;
  const assetScore =
    assetEvaluations.length === 0
      ? 15
      : (assetEvaluations.reduce((sum, evaluation) => sum + evaluation.scoreWeight, 0) /
          assetEvaluations.length) *
        15;
  const structuralScore =
    structuralEvaluations.length === 0
      ? 10
      : (structuralEvaluations.reduce((sum, evaluation) => sum + evaluation.scoreWeight, 0) /
          structuralEvaluations.length) *
        10;
  const semantic = semanticBoostForPage(page, profile);
  const score = Math.max(
    0,
    Math.min(100, Math.round(requiredScore + mappableScore + assetScore + structuralScore + semantic.score)),
  );
  const label = labelFromScore(score);

  const assetCoverage = uniqueStrings([
    profile.assetCount > 0 ? `${profile.assetCount} asset khả dụng` : "",
    profile.coverAssetCount > 0 ? `${profile.coverAssetCount} asset cover` : "",
    profile.roleCounts.section_image ? `${profile.roleCounts.section_image} asset section_image` : "",
  ]);
  const sectionCoverage = uniqueStrings([
    page.estimatedItemCount > 0
      ? `Có khoảng ${Math.min(profile.rowCount, page.estimatedItemCount)}/${Math.max(
          1,
          page.estimatedItemCount,
        )} item có thể lấp`
      : "",
    page.numberOfSections > 1
      ? `Có khoảng ${Math.max(profile.uniqueCategories.length, profile.topCategories.length)}/${Math.max(
          1,
          page.numberOfSections,
        )} nhóm / category rõ ràng`
      : "",
  ]);
  const structuralCoverage = structureNotes;
  const detailSummary = detailReasonSummary(
    availableFields,
    mappableFields,
    missingRequired,
    semantic.reasons,
    structureNotes,
    assetNotes,
  );

  return {
    evaluations,
    detail: {
      sheetName: profile.sheetName,
      score,
      label,
      profileKind: profile.semantic,
      availableFields,
      mappableFields,
      missingRequired,
      missingOptional,
      assetCoverage,
      sectionCoverage,
      structuralCoverage,
      reasons: detailSummary.reasons,
      reasonSummary: detailSummary.summary,
      notes: uniqueStrings([...assetNotes, ...structureNotes]),
    },
  };
}

function gapLevelForEvaluation(
  evaluation: RequirementEvaluation,
): GapLevel {
  if (evaluation.status === "have") return "have";
  if (evaluation.status === "mappable") return "mappable";
  return evaluation.requirement.required ? "missing_required" : "missing_optional";
}

function gapMessageForEvaluation(evaluation: RequirementEvaluation): string {
  const note = evaluation.notes[0];
  if (evaluation.category === "manual") {
    return `${evaluation.requirement.label}: ${note || "có thể nhập tay."}`;
  }
  if (evaluation.category === "structure") {
    if (evaluation.status === "have") return `Cấu trúc đủ để dựng: ${evaluation.requirement.label}.`;
    if (evaluation.status === "mappable") return `Cấu trúc còn thiếu một phần: ${note || evaluation.requirement.label}.`;
    return `Thiếu cấu trúc bắt buộc: ${note || evaluation.requirement.label}.`;
  }
  if (evaluation.category === "asset") {
    if (evaluation.status === "have") return `${evaluation.requirement.label} đã có asset phù hợp.`;
    if (evaluation.status === "mappable") return `${evaluation.requirement.label}: ${note || "có ảnh nhưng chưa gán role đúng."}`;
    return `Thiếu asset bắt buộc: ${evaluation.requirement.label}.`;
  }
  if (evaluation.status === "have") return `${evaluation.requirement.label} đã có trong sheet phù hợp nhất.`;
  if (evaluation.status === "mappable") {
    return `${evaluation.requirement.label}: ${note || "có thể map / suy luận từ dữ liệu hiện có."}`;
  }
  return evaluation.requirement.required
    ? `Thiếu bắt buộc: ${evaluation.requirement.label}.`
    : `Thiếu nhưng có thể bỏ qua: ${evaluation.requirement.label}.`;
}

function emptyGroups(): Record<GapLevel, GapItem[]> {
  return {
    have: [],
    mappable: [],
    missing_required: [],
    missing_optional: [],
    risk: [],
  };
}

function analyzePageCompatibility(
  page: Omit<AnalyzedPage, "compatibility">,
  profiles: SheetProfile[],
): CompatibilityReport {
  const groups = emptyGroups();

  if (profiles.length === 0) {
    page.requiredFields.forEach((requirement) => {
      const category = categoryFromRequirementKind(requirement.kind ?? "data_field");
      const level: GapLevel =
        category === "manual"
          ? "mappable"
          : requirement.required
            ? "missing_required"
            : "missing_optional";
      groups[level].push({
        gapId: nanoid(),
        level,
        category,
        fieldKey: requirement.fieldKey,
        message:
          category === "manual"
            ? `${requirement.label}: có thể nhập tay khi chưa có sheet đối chiếu.`
            : `Chưa có dữ liệu đã import để đối chiếu ${requirement.label}.`,
        pageIndex: page.pageIndex,
      });
    });

    return {
      score: 0,
      label: "not_ready",
      sheets: [],
      groups,
      reasonSummary: "Chưa có sheet nào trong project để đối chiếu.",
    };
  }

  const evaluatedSheets = profiles
    .map((profile) => buildSheetCompatibilityDetail(page, profile))
    .sort((a, b) => b.detail.score - a.detail.score);
  const best = evaluatedSheets[0];

  best.evaluations.forEach((evaluation) => {
    const level = gapLevelForEvaluation(evaluation);
    groups[level].push({
      gapId: nanoid(),
      level,
      category: evaluation.category,
      fieldKey: evaluation.requirement.fieldKey,
      message: gapMessageForEvaluation(evaluation),
      pageIndex: page.pageIndex,
      sheetName: best.detail.sheetName,
    });
  });

  best.detail.notes.forEach((note) => {
    groups.risk.push({
      gapId: nanoid(),
      level: "risk",
      category: "risk",
      fieldKey: "risk",
      message: note,
      pageIndex: page.pageIndex,
      sheetName: best.detail.sheetName,
    });
  });

  const requiredMissingLabels = new Set(best.detail.missingRequired.map((value) => normalizeToken(value)));
  if (
    page.pageType === "service_directory" &&
    requiredMissingLabels.has(normalizeToken("Số điện thoại / hotline"))
  ) {
    groups.risk.push({
      gapId: nanoid(),
      level: "risk",
      category: "risk",
      fieldKey: "phone",
      message: "Thiếu phone/hotline nên page dịch vụ khó tái tạo sát mẫu.",
      pageIndex: page.pageIndex,
      sheetName: best.detail.sheetName,
    });
  }

  if (
    (page.pageType === "itinerary" || page.pageType === "board" || page.pageType === "mixed_board") &&
    requiredMissingLabels.has(normalizeToken("Chi phí / badge giá"))
  ) {
    groups.risk.push({
      gapId: nanoid(),
      level: "risk",
      category: "risk",
      fieldKey: "price",
      message: "Thiếu price nên page itinerary/board khó tái tạo sát mẫu.",
      pageIndex: page.pageIndex,
      sheetName: best.detail.sheetName,
    });
  }

  if (best.detail.assetCoverage.length === 0) {
    groups.risk.push({
      gapId: nanoid(),
      level: "risk",
      category: "risk",
      fieldKey: "asset",
      message: "Thiếu asset nên các block ảnh chỉ có thể tạo bản tương đương thấp.",
      pageIndex: page.pageIndex,
      sheetName: best.detail.sheetName,
    });
  }

  return {
    score: best.detail.score,
    label: best.detail.label,
    bestMatchSheet: best.detail.sheetName,
    sheets: evaluatedSheets.map((item) => item.detail),
    groups,
    reasonSummary: best.detail.reasonSummary,
  };
}

function analyzePackCompatibility(pages: AnalyzedPage[]): CompatibilityReport {
  const groups = emptyGroups();

  for (const page of pages) {
    (Object.keys(groups) as GapLevel[]).forEach((level) => {
      groups[level].push(...page.compatibility.groups[level]);
    });
  }

  const score =
    pages.length === 0
      ? 0
      : Math.round(pages.reduce((sum, page) => sum + page.compatibility.score, 0) / pages.length);
  const bestMatchSheet = Array.from(
    new Map(
      pages
        .map((page) => page.compatibility.bestMatchSheet)
        .filter(Boolean)
        .map((sheetName) => [sheetName, pages.filter((page) => page.compatibility.bestMatchSheet === sheetName).length]),
    ).entries(),
  ).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    score,
    label: labelFromScore(score),
    bestMatchSheet,
    sheets: [],
    groups,
    reasonSummary: bestMatchSheet
      ? `Sheet xuất hiện phù hợp nhiều nhất là "${bestMatchSheet}".`
      : "Mức độ tương thích là trung bình cộng của các page đã phân tích.",
  };
}

function structureSummaryFromPages(pages: AnalyzedPage[]): string[] {
  const counts = new Map<string, number>();
  for (const page of pages) {
    counts.set(page.pageType, (counts.get(page.pageType) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([pageType, count]) => `${count} ${pageType}`);
}

function buildUiBlueprint(pages: AnalyzedPage[]): string[] {
  return pages.map((page, index) => {
    const regions = page.uiRegions
      .slice(0, 4)
      .map((region) => region.label)
      .join(", ");
    return `Ảnh ${index + 1} là ${page.pageType}, gồm ${regions || "các block chính của page"}.`;
  });
}

function dedupeRequirements(requirements: InferredDataRequirement[]): InferredDataRequirement[] {
  const map = new Map<string, InferredDataRequirement>();
  for (const requirement of requirements) {
    const existing = map.get(requirement.fieldKey);
    if (!existing) {
      map.set(requirement.fieldKey, requirement);
      continue;
    }
    map.set(requirement.fieldKey, {
      ...existing,
      notes: uniqueStrings([existing.notes, requirement.notes]).join(" · ") || undefined,
      bindCandidates: uniqueStrings([
        ...(existing.bindCandidates ?? []),
        ...(requirement.bindCandidates ?? []),
        existing.bindCandidate,
        requirement.bindCandidate,
      ]),
      bindCandidate:
        existing.bindCandidate ??
        requirement.bindCandidate ??
        existing.bindCandidates?.[0] ??
        requirement.bindCandidates?.[0],
      required: existing.required || requirement.required,
      confidence: Math.max(existing.confidence ?? 0, requirement.confidence ?? 0) || undefined,
    });
  }
  return Array.from(map.values());
}

function buildDataBlueprintGroups(pages: AnalyzedPage[]) {
  const all = dedupeRequirements(pages.flatMap((page) => page.requiredFields));
  return {
    pageLevel: all.filter((item) => item.scope === "page" || item.scope === "pack"),
    sectionLevel: all.filter((item) => item.scope === "section"),
    itemLevel: all.filter((item) => item.scope === "item"),
    assetLevel: all.filter((item) => item.scope === "asset"),
  };
}

function readinessFromPage(page: AnalyzedPage): DraftReadiness {
  const visualConfidence = page.visualConfidence ?? 0.75;
  const structureConfidence = page.structureConfidence ?? page.confidenceScore ?? 0.75;
  const bindingConfidence = page.bindingConfidence ?? 0.75;
  const report = page.compatibility;

  if (
    report.score >= 75 &&
    report.groups.missing_required.length <= 1 &&
    visualConfidence >= 0.6 &&
    structureConfidence >= 0.6 &&
    bindingConfidence >= 0.55
  ) {
    return "ready";
  }
  if (report.score >= 45 && visualConfidence >= 0.45 && structureConfidence >= 0.45) {
    return "needs_data";
  }
  return "skeleton_only";
}

function ms(
  partial: Partial<Slot> & Pick<Slot, "kind" | "x" | "y" | "width" | "height">,
): Slot {
  return {
    slotId: nanoid(),
    rotation: 0,
    zIndex: 1,
    ...partial,
  } as Slot;
}

function createBaseTemplate(name: string, type: PageTemplate["type"]): PageTemplate {
  return {
    pageTemplateId: nanoid(),
    name,
    type,
    canvas: { width: 1080, height: 1350, background: "#ffffff" },
    slots: [],
    sections: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function defaultSheetFilter(sheetName: string | undefined): Array<{ field: string; op: "eq"; value: string }> {
  return sheetName ? [{ field: "sheetName", op: "eq", value: sheetName }] : [];
}

function autoBindSlot(
  pageTemplateId: string,
  slot: Slot,
  requirement: InferredDataRequirement | undefined,
  suggestedBindings: DraftTemplateSuggestion["suggestedBindings"],
  threshold = 0.72,
) {
  const bindingPath =
    requirement?.bindCandidate ??
    requirement?.bindCandidates?.[0];
  const confidence = requirement?.confidence ?? 0.85;
  if (!bindingPath || confidence < threshold) return;
  slot.bindingPath = bindingPath;
  suggestedBindings.push({
    pageTemplateId,
    slotId: slot.slotId,
    bindingPath,
    confidence,
  });
}

function findRequirement(
  page: AnalyzedPage,
  matcher: (requirement: InferredDataRequirement) => boolean,
): InferredDataRequirement | undefined {
  return page.requiredFields.find(matcher);
}

function slotPlaceholderText(slot: Slot): string {
  return normalizeToken(`${slot.name ?? ""} ${slot.staticText ?? ""}`);
}

function isImageLikeSlot(slot: Slot): boolean {
  if (slot.kind === "image") return true;
  if (slot.kind !== "shape") return false;
  return slot.shapeKind === "circle" || slot.shapeKind === "rectangle" || slot.shapeKind === "badge";
}

function coversMostCanvas(slot: Slot): boolean {
  return slot.x <= 48 && slot.y <= 48 && slot.width >= 980 && slot.height >= 1200;
}

function requirementForImageSlot(page: AnalyzedPage, slot: Slot): InferredDataRequirement | undefined {
  const text = slotPlaceholderText(slot);
  const isBackground = coversMostCanvas(slot) || text.includes("background") || text.includes("cover");

  if (isBackground) {
    return (
      findRequirement(
        page,
        (requirement) =>
          requirement.kind === "asset" &&
          (requirement.fieldKey === "asset.cover_background" ||
            requirement.fieldKey === "asset.cover" ||
            requirement.assetRoleHint === "cover"),
      ) ??
      findRequirement(page, (requirement) => requirement.kind === "asset")
    );
  }

  if (text.includes("section") || text.includes("nhom") || text.includes("service")) {
    return (
      findRequirement(
        page,
        (requirement) =>
          requirement.kind === "asset" &&
          (requirement.fieldKey === "asset.section_image" ||
            requirement.assetRoleHint === "section_image"),
      ) ??
      findRequirement(page, (requirement) => requirement.kind === "asset")
    );
  }

  return (
    findRequirement(
      page,
      (requirement) =>
        requirement.kind === "asset" &&
        (requirement.fieldKey === "asset.item_image" ||
          requirement.assetRoleHint === "cover" ||
          requirement.assetRoleHint === "facade" ||
          requirement.assetRoleHint === "space"),
    ) ??
    findRequirement(page, (requirement) => requirement.kind === "asset")
  );
}

function requirementForTextSlot(page: AnalyzedPage, slot: Slot): InferredDataRequirement | undefined {
  const text = slotPlaceholderText(slot);
  if (!text) return undefined;

  if (text.includes("{{title}}") || text.includes("{{tieu de}}") || text.includes("{{tiêu đề}}")) {
    return findRequirement(
      page,
      (requirement) =>
        requirement.kind === "manual_literal" &&
        (requirement.fieldKey.includes("title") || requirement.label.toLowerCase().includes("tiêu đề")),
    );
  }

  if (
    text.includes("{{eyebrow}}") ||
    text.includes("{{subtitle}}") ||
    text.includes("{{cta}}") ||
    text.includes("{{ngay}}") ||
    text.includes("{{ngày}}")
  ) {
    return findRequirement(page, (requirement) => requirement.kind === "manual_literal");
  }

  const tokens = uniqueStrings([
    text.includes("{{ten}}") || text.includes("{{tên}}") ? "entity.name" : "",
    text.includes("{{dia chi}}") || text.includes("{{địa chỉ}}") ? "entity.address" : "",
    text.includes("{{gia}}") || text.includes("{{giá}}") ? "entity.priceRange" : "",
    text.includes("{{phone}}") ||
    text.includes("{{sdt}}") ||
    text.includes("{{hotline}}") ||
    text.includes("{{số điện thoại}}")
      ? "entity.phone"
      : "",
  ]);

  if (tokens.length !== 1) return undefined;
  return (
    findRequirement(page, (requirement) => requirement.bindCandidate === tokens[0]) ??
    findRequirement(page, (requirement) => requirement.bindCandidates?.includes(tokens[0]) ?? false)
  );
}

function inferAutoBindingsForLayoutTemplate(
  page: AnalyzedPage,
  template: PageTemplate,
): DraftTemplateSuggestion["suggestedBindings"] {
  const suggestedBindings: DraftTemplateSuggestion["suggestedBindings"] = [];

  for (const slot of template.slots) {
    if (isImageLikeSlot(slot)) {
      const requirement = requirementForImageSlot(page, slot);
      autoBindSlot(template.pageTemplateId, slot, requirement, suggestedBindings, 0.6);
      continue;
    }

    if (slot.kind === "text") {
      const requirement = requirementForTextSlot(page, slot);
      autoBindSlot(template.pageTemplateId, slot, requirement, suggestedBindings, 0.78);
    }
  }

  return suggestedBindings;
}

function buildLayoutDrivenDraft(page: AnalyzedPage): {
  template: PageTemplate;
  warnings: string[];
  autoBindingCount: number;
} | null {
  if (!page.layoutJson) return null;

  try {
    const parsedBlueprint = parseLayoutBlueprintJson(page.layoutJson);
    const { template, quality } = aiLayoutToTemplateWithQuality(parsedBlueprint ?? JSON.parse(page.layoutJson), page.suggestedName);
    template.type = currentTemplateTypeFromAnalysis(page.pageType);
    template.validationRules = uniqueStrings([
      ...page.compatibility.groups.missing_required.map((gap) => gap.message),
      ...quality.warnings.filter((w) => w.includes("không hỗ trợ") || w.includes("đã bỏ") || w.includes("quá nhỏ")),
    ]);
    const suggestedBindings = inferAutoBindingsForLayoutTemplate(page, template);
    const visualConfidence = page.visualConfidence ?? parsedBlueprint?.visualBlueprint.confidence ?? 0;
    const draftWarnings = [
      ...page.compatibility.groups.risk.map((gap) => gap.message),
      ...(parsedBlueprint?.visualBlueprint.warnings ?? []),
      ...(parsedBlueprint?.dataBlueprint?.warnings ?? []),
    ];
    if (!parsedBlueprint?.dataBlueprint) {
      draftWarnings.push("Blueprint chưa có data pass đầy đủ, draft đang dựa nhiều vào visual blueprint.");
    }
    if (visualConfidence > 0 && visualConfidence < 0.6) {
      draftWarnings.push("Visual fidelity thấp, cần kiểm tra kỹ trước khi dùng làm template.");
    }

    return {
      template,
      warnings: uniqueStrings(draftWarnings),
      autoBindingCount: suggestedBindings.length,
    };
  } catch {
    return null;
  }
}

function buildCoverDraft(page: AnalyzedPage): {
  template: PageTemplate;
  warnings: string[];
  autoBindingCount: number;
} {
  const template = createBaseTemplate(page.suggestedName, "cover");
  template.canvas.background = "#0f172a";

  const suggestedBindings: DraftTemplateSuggestion["suggestedBindings"] = [];
  const bgReq = findRequirement(
    page,
    (requirement) =>
      requirement.kind === "asset" &&
      (requirement.fieldKey === "asset.cover_background" || requirement.assetRoleHint === "cover"),
  );

  const bg = ms({
    kind: "image",
    x: 0,
    y: 0,
    width: 1080,
    height: 1350,
    zIndex: 0,
    style: { fit: "cover", overlayColor: "rgba(15, 23, 42, 0.38)" },
  });
  autoBindSlot(template.pageTemplateId, bg, bgReq, suggestedBindings, 0.65);

  const eyebrow = ms({
    kind: "text",
    x: 80,
    y: 180,
    width: 920,
    height: 56,
    staticText: "Địa danh / chủ đề",
    style: {
      fontFamily: "Be Vietnam Pro",
      fontSize: 30,
      fontWeight: 700,
      color: "#fde68a",
      textAlign: "center",
      textTransform: "uppercase",
      letterSpacing: 4,
    },
  });

  const title = ms({
    kind: "text",
    x: 80,
    y: 320,
    width: 920,
    height: 260,
    staticText: "TIÊU ĐỀ COVER",
    style: {
      fontFamily: "Be Vietnam Pro",
      fontSize: 96,
      fontWeight: 900,
      color: "#ffffff",
      textAlign: "center",
      lineHeight: 1.04,
      textTransform: "uppercase",
    },
  });

  const subtitle = ms({
    kind: "text",
    x: 120,
    y: 1120,
    width: 840,
    height: 80,
    staticText: "Tagline / subtitle có thể chỉnh tay trong editor",
    style: {
      fontFamily: "Be Vietnam Pro",
      fontSize: 28,
      fontWeight: 500,
      color: "#f8fafc",
      textAlign: "center",
    },
  });

  template.slots.push(bg, eyebrow, title, subtitle);
  template.validationRules = page.compatibility.groups.missing_required.map((gap) => gap.message);

  return {
    template,
    warnings: page.compatibility.groups.risk.map((gap) => gap.message),
    autoBindingCount: suggestedBindings.length,
  };
}

function buildItineraryDraft(page: AnalyzedPage): {
  template: PageTemplate;
  warnings: string[];
  autoBindingCount: number;
} {
  const template = createBaseTemplate(page.suggestedName, "itinerary");
  template.canvas.background = "#fef3c7";
  const suggestedBindings: DraftTemplateSuggestion["suggestedBindings"] = [];
  const bestSheet = page.compatibility.bestMatchSheet;
  const sectionId = nanoid();

  const headerShape = ms({
    kind: "shape",
    shapeKind: "badge",
    x: 60,
    y: 60,
    width: 720,
    height: 104,
    zIndex: 1,
    style: { fill: "#dc2626", borderRadius: 9999 },
  });

  const headerText = ms({
    kind: "text",
    x: 60,
    y: 84,
    width: 720,
    height: 56,
    zIndex: 2,
    staticText: page.suggestedName.toUpperCase(),
    style: {
      fontFamily: "Be Vietnam Pro",
      fontSize: 44,
      fontWeight: 900,
      color: "#ffffff",
      textAlign: "center",
      textTransform: "uppercase",
    },
  });

  const note = ms({
    kind: "text",
    x: 820,
    y: 74,
    width: 200,
    height: 70,
    zIndex: 2,
    staticText: "Tổng chi phí",
    style: {
      fontFamily: "Be Vietnam Pro",
      fontSize: 24,
      fontWeight: 700,
      color: "#7c2d12",
      textAlign: "right",
    },
  });

  const sectionSlot = ms({
    kind: "section",
    sectionRefId: sectionId,
    x: 60,
    y: 210,
    width: 960,
    height: 1080,
    zIndex: 1,
  });

  const section: Section = {
    sectionId,
    title: page.suggestedName,
    maxItems: Math.max(3, Math.min(6, page.estimatedItemCount || 4)),
    minItems: Math.max(1, Math.min(3, page.estimatedItemCount || 3)),
    imageMode: "anchor_entity",
    listStyle: page.hasPriceBadge ? "number" : "dot",
    sortRule: "diversity",
    partnerMode: "balanced_partner",
    layoutMode: page.hasSectionImages ? "zigzag" : "stack",
    filterRules: defaultSheetFilter(bestSheet),
  };

  template.slots.push(headerShape, headerText, note, sectionSlot);
  template.sections.push(section);
  template.validationRules = page.compatibility.groups.missing_required.map((gap) => gap.message);

  const bgReq = findRequirement(
    page,
    (requirement) => requirement.kind === "asset" && requirement.fieldKey === "asset.item_image",
  );
  if (page.hasBackgroundImage && bgReq) {
    const background = ms({
      kind: "image",
      x: 0,
      y: 0,
      width: 1080,
      height: 1350,
      zIndex: 0,
      style: { fit: "cover", opacity: 0.12 },
    });
    autoBindSlot(template.pageTemplateId, background, bgReq, suggestedBindings, 0.65);
    template.slots.unshift(background);
  }

  return {
    template,
    warnings: page.compatibility.groups.risk.map((gap) => gap.message),
    autoBindingCount: suggestedBindings.length,
  };
}

function buildBoardDraft(
  page: AnalyzedPage,
  titles: string[],
): {
  template: PageTemplate;
  warnings: string[];
  autoBindingCount: number;
} {
  const template = createBaseTemplate(page.suggestedName, currentTemplateTypeFromAnalysis(page.pageType));
  template.canvas.background = "#fff7ed";
  const bestSheet = page.compatibility.bestMatchSheet;

  template.slots.push(
    ms({
      kind: "text",
      x: 60,
      y: 60,
      width: 960,
      height: 80,
      staticText: page.suggestedName,
      style: {
        fontFamily: "Be Vietnam Pro",
        fontSize: 56,
        fontWeight: 900,
        color: "#111827",
        textAlign: "center",
        textTransform: "uppercase",
      },
    }),
  );

  const sectionCount = Math.max(2, Math.min(3, page.numberOfSections || 2));
  const sectionHeight = sectionCount === 2 ? 470 : 340;

  for (let index = 0; index < sectionCount; index += 1) {
    const sectionId = nanoid();
    template.sections.push({
      sectionId,
      title: titles[index] || `Nhóm ${index + 1}`,
      maxItems: Math.max(2, Math.ceil((page.estimatedItemCount || sectionCount * 2) / sectionCount)),
      minItems: 1,
      imageMode: "anchor_entity",
      listStyle: "dot",
      sortRule: "diversity",
      partnerMode: "balanced_partner",
      layoutMode: page.hasSectionImages ? "stack" : "grid",
      filterRules: defaultSheetFilter(bestSheet),
    });

    template.slots.push(
      ms({
        kind: "section",
        sectionRefId: sectionId,
        x: 60,
        y: 170 + index * (sectionHeight + 40),
        width: 960,
        height: sectionHeight,
        zIndex: 1,
      }),
    );
  }

  template.validationRules = page.compatibility.groups.missing_required.map((gap) => gap.message);
  return {
    template,
    warnings: page.compatibility.groups.risk.map((gap) => gap.message),
    autoBindingCount: 0,
  };
}

function buildServiceDirectoryDraft(
  page: AnalyzedPage,
  titles: string[],
): {
  template: PageTemplate;
  warnings: string[];
  autoBindingCount: number;
} {
  const template = createBaseTemplate(page.suggestedName, "board");
  template.canvas.background = "#fffbeb";
  const suggestedBindings: DraftTemplateSuggestion["suggestedBindings"] = [];
  const bestSheet = page.compatibility.bestMatchSheet;

  template.slots.push(
    ms({
      kind: "text",
      x: 60,
      y: 56,
      width: 960,
      height: 76,
      staticText: page.suggestedName,
      style: {
        fontFamily: "Be Vietnam Pro",
        fontSize: 52,
        fontWeight: 900,
        color: "#111827",
        textAlign: "center",
      },
    }),
  );

  const backgroundReq = findRequirement(
    page,
    (requirement) => requirement.kind === "asset" && requirement.fieldKey === "asset.section_image",
  );
  if (page.hasBackgroundImage && backgroundReq) {
    const topVisual = ms({
      kind: "image",
      x: 60,
      y: 150,
      width: 960,
      height: 180,
      zIndex: 0,
      style: { fit: "cover", borderRadius: 28, opacity: 0.16 },
    });
    autoBindSlot(template.pageTemplateId, topVisual, backgroundReq, suggestedBindings, 0.65);
    template.slots.push(topVisual);
  }

  const sectionCount = Math.max(2, Math.min(3, page.numberOfSections || 3));
  for (let index = 0; index < sectionCount; index += 1) {
    const sectionId = nanoid();
    template.sections.push({
      sectionId,
      title: titles[index] || `Nhóm dịch vụ ${index + 1}`,
      maxItems: Math.max(2, Math.ceil((page.estimatedItemCount || sectionCount * 2) / sectionCount)),
      minItems: 1,
      imageMode: "anchor_entity",
      listStyle: "dot",
      sortRule: "diversity",
      partnerMode: "balanced_partner",
      layoutMode: "stack",
      filterRules: defaultSheetFilter(bestSheet),
      categoryQuery: titles[index] ? normalizeKey(titles[index]) : undefined,
    });
    template.slots.push(
      ms({
        kind: "section",
        sectionRefId: sectionId,
        x: 60,
        y: 360 + index * 300,
        width: 960,
        height: 260,
        zIndex: 1,
      }),
    );
  }

  template.validationRules = page.compatibility.groups.missing_required.map((gap) => gap.message);
  return {
    template,
    warnings: page.compatibility.groups.risk.map((gap) => gap.message),
    autoBindingCount: suggestedBindings.length,
  };
}

function buildFallbackDraft(page: AnalyzedPage): {
  template: PageTemplate;
  warnings: string[];
  autoBindingCount: number;
} {
  if (page.layoutJson) {
    try {
      const parsedBlueprint = parseLayoutBlueprintJson(page.layoutJson);
      const { template, quality } = aiLayoutToTemplateWithQuality(parsedBlueprint ?? JSON.parse(page.layoutJson), page.suggestedName);
      template.type = currentTemplateTypeFromAnalysis(page.pageType);
      template.validationRules = uniqueStrings([
        ...page.compatibility.groups.missing_required.map((gap) => gap.message),
        ...quality.warnings.filter((w) => w.includes("không hỗ trợ") || w.includes("đã bỏ") || w.includes("quá nhỏ")),
      ]);
      return {
        template,
        warnings: uniqueStrings([
          ...page.compatibility.groups.risk.map((gap) => gap.message),
          ...(parsedBlueprint?.visualBlueprint.warnings ?? []),
          ...(parsedBlueprint?.dataBlueprint?.warnings ?? []),
        ]),
        autoBindingCount: 0,
      };
    } catch {
      // Ignore and fall back to a simple mixed page below.
    }
  }

  const template = createBaseTemplate(page.suggestedName, currentTemplateTypeFromAnalysis(page.pageType));
  template.slots.push(
    ms({
      kind: "text",
      x: 80,
      y: 120,
      width: 920,
      height: 120,
      staticText: page.suggestedName,
      style: {
        fontFamily: "Be Vietnam Pro",
        fontSize: 64,
        fontWeight: 900,
        color: "#0f172a",
        textAlign: "center",
      },
    }),
    ms({
      kind: "text",
      x: 100,
      y: 300,
      width: 880,
      height: 220,
      staticText: "Draft khung từ kết quả phân tích. Hãy chỉnh tiếp trong editor.",
      style: {
        fontFamily: "Be Vietnam Pro",
        fontSize: 32,
        fontWeight: 500,
        color: "#475569",
        textAlign: "center",
      },
    }),
  );
  template.validationRules = page.compatibility.groups.missing_required.map((gap) => gap.message);
  return {
    template,
    warnings: page.compatibility.groups.risk.map((gap) => gap.message),
    autoBindingCount: 0,
  };
}

function collectTemplateBindings(template: PageTemplate): DraftTemplateSuggestion["suggestedBindings"] {
  return template.slots
    .filter((slot) => !!slot.bindingPath)
    .map((slot) => ({
      pageTemplateId: template.pageTemplateId,
      slotId: slot.slotId,
      bindingPath: slot.bindingPath!,
      confidence: 0.85,
    }));
}

function enhanceTemplateSections(
  template: PageTemplate,
  page: AnalyzedPage,
  topSheet?: SheetCompatibilityDetail,
): PageTemplate {
  if (template.sections.length === 0) return template;

  const fallbackTitles = sectionTitlesFromPage(page, topSheet);
  const sectionCount = template.sections.length;
  const perSectionTarget = Math.max(2, Math.ceil(Math.max(1, page.estimatedItemCount || 0) / sectionCount));

  return {
    ...template,
    sections: template.sections.map((section, index) => ({
      ...section,
      title: section.title?.trim() || fallbackTitles[index] || `Nhóm ${index + 1}`,
      maxItems: Math.max(section.maxItems || 0, perSectionTarget),
      minItems: Math.max(1, Math.min(section.minItems || 1, perSectionTarget)),
      imageMode: section.imageMode ?? "anchor_entity",
      sortRule: section.sortRule ?? "diversity",
      partnerMode: section.partnerMode ?? "balanced_partner",
      filterRules:
        section.filterRules && section.filterRules.length > 0
          ? section.filterRules
          : defaultSheetFilter(topSheet?.sheetName),
      layoutMode: section.layoutMode ?? "poster_list",
    })),
  };
}

function sectionTitlesFromPage(page: AnalyzedPage, topSheet?: SheetCompatibilityDetail): string[] {
  const sheetHints = topSheet?.availableFields ?? [];
  const preferred = topSheet?.profileKind;
  if (page.pageType === "service_directory") {
    if (preferred === "service") return ["Di chuyển", "Lưu trú", "Tiện ích khác"];
    if (preferred === "homestay") return ["Homestay", "Ăn uống gần đó", "Tiện ích"];
    return ["Nhóm 1", "Nhóm 2", "Nhóm 3"];
  }
  if (page.pageType === "board" || page.pageType === "mixed_board") {
    if (preferred === "food" || preferred === "cafe") return ["Món nên thử", "Địa điểm nổi bật", "Tips nhanh"];
    if (preferred === "checkin") return ["Điểm đến", "Góc chụp", "Lưu ý"];
    if (sheetHints.length > 0) return ["Nhóm chính", "Nhóm phụ", "Bổ sung"];
    return ["Section 1", "Section 2", "Section 3"];
  }
  return [];
}

function buildDraftSuggestion(
  analyzedPack: AnalyzedPack,
  packMeta: { name: string; goal?: string; tone?: string; cta?: string },
): DraftTemplateSuggestion {
  const pageDrafts: DraftPageSuggestion[] = [];
  const pageTemplates: PageTemplate[] = [];
  const warnings: string[] = [];

  for (const page of analyzedPack.pages) {
    const topSheet = page.compatibility.sheets[0];
    const titles = sectionTitlesFromPage(page, topSheet);
    const layoutDriven = buildLayoutDrivenDraft(page);
    const built =
      layoutDriven ??
      (page.pageType === "cover"
        ? buildCoverDraft(page)
        : page.pageType === "itinerary" || page.pageType === "checklist"
          ? buildItineraryDraft(page)
          : page.pageType === "service_directory"
            ? buildServiceDirectoryDraft(page, titles)
            : page.pageType === "board" || page.pageType === "mixed_board"
              ? buildBoardDraft(page, titles)
              : buildFallbackDraft(page));

    const enhancedTemplate = enhanceTemplateSections(built.template, page, topSheet);
    pageTemplates.push(enhancedTemplate);
    warnings.push(...built.warnings);
    const pageReadiness = readinessFromPage(page);
    pageDrafts.push({
      pageTemplateId: enhancedTemplate.pageTemplateId,
      pageIndex: page.pageIndex,
      pageName: page.suggestedName,
      pageType: page.pageType,
      readiness: pageReadiness,
      readinessLabel: draftReadinessText(pageReadiness),
      sectionCount: enhancedTemplate.sections.length,
      estimatedItemCount: page.estimatedItemCount,
      autoBindingCount: built.autoBindingCount,
      warnings: uniqueStrings([
        ...page.compatibility.groups.missing_required.map((gap) => gap.message),
        ...built.warnings,
      ]).slice(0, 5),
    });
  }

  const suggestedBindings = pageTemplates.flatMap(collectTemplateBindings);

  const overallReadiness = pageDrafts.some((page) => page.readiness === "skeleton_only")
    ? "skeleton_only"
    : pageDrafts.some((page) => page.readiness === "needs_data")
      ? "needs_data"
      : "ready";

  const packTemplate: PackTemplate = {
    packTemplateId: nanoid(),
    name: packMeta.name || analyzedPack.title || "Reverse Pack Draft",
    goal: packMeta.goal,
    tone: packMeta.tone,
    cta: packMeta.cta,
    orderedPages: pageTemplates.map((page) => page.pageTemplateId),
    requiredPages: pageTemplates.length > 0 ? [pageTemplates[0].pageTemplateId] : [],
    optionalPages: [],
    captionProfile: { mode: "save_post" },
    exportDefaults: { format: "png", scale: 2 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    packTemplate,
    pageTemplates,
    suggestedBindings,
    readiness: overallReadiness,
    readinessLabel: draftReadinessText(overallReadiness),
    pageDrafts,
    warnings: uniqueStrings(warnings),
  };
}

async function analyzeSinglePageImage(params: {
  imageDataUrl: string;
  pageIndex: number;
  roleHint: string;
  suggestedName: string;
  layoutJson?: string;
}): Promise<Omit<AnalyzedPage, "compatibility">> {
  const { imageDataUrl, pageIndex, roleHint, suggestedName, layoutJson } = params;
  const parsedBlueprint = parseLayoutBlueprintJson(layoutJson);
  if (parsedBlueprint?.dataBlueprint && parsedBlueprint.dataBlueprint.requiredFields.length > 0) {
    return normalizePageAnalysisFromBlueprint({
      dataBlueprint: parsedBlueprint.dataBlueprint,
      visualBlueprint: parsedBlueprint.visualBlueprint,
      pageIndex,
      suggestedName,
      layoutJson,
    });
  }
  const result = await callAi({
    useVisionModel: true,
    messages: [
      { role: "system", content: PAGE_ANALYSIS_SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Phân tích ảnh page này. Gợi ý role hiện tại: ${roleHint}. ` +
              `Tên page dự kiến: ${suggestedName}. ` +
              "Hãy mô tả ngắn gọn bằng tiếng Việt, phân biệt rõ field thật, asset requirement, manual text và structural requirement.",
          },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    tools: [PAGE_ANALYSIS_TOOL],
    tool_choice: { type: "function", function: { name: "analyze_page" } },
    temperature: 0.2,
  });

  if (!result.ok || !result.toolArgs) {
    return {
      pageIndex,
      pageRole: roleHint,
      pageType: typeFromRole(roleHint as ComboRole),
      suggestedName,
      summary: `Không phân tích sâu được ảnh ${pageIndex + 1}, đang dùng fallback theo role sơ bộ.`,
      layoutDensity: "medium",
      numberOfSections: 0,
      estimatedItemCount: 0,
      hasMainTitle: true,
      hasSubtitle: false,
      hasBackgroundImage: true,
      hasPanel: false,
      hasSectionImages: false,
      hasListRepeater: false,
      hasSlotRepeater: false,
      hasPriceBadge: false,
      hasCTA: false,
      confidenceScore: 0.35,
      uiRegions: [],
      requiredFields: mergeRequirements(
        {
          pageType: typeFromRole(roleHint as ComboRole),
          estimatedItemCount: 0,
          numberOfSections: 0,
          hasPriceBadge: false,
          hasSectionImages: false,
          hasBackgroundImage: true,
          hasCTA: false,
          hasSubtitle: false,
          suggestedName,
        },
        [],
      ),
      layoutJson,
      visualBlueprint: parsedBlueprint?.visualBlueprint,
      dataBlueprint: parsedBlueprint?.dataBlueprint,
      visualConfidence: parsedBlueprint?.visualBlueprint.confidence,
      structureConfidence: parsedBlueprint?.dataBlueprint?.structureConfidence,
      bindingConfidence: parsedBlueprint?.dataBlueprint?.bindingConfidence,
    };
  }

  return {
    ...normalizePageAnalysis(
      result.toolArgs as PageAnalysisToolResult,
      pageIndex,
      suggestedName,
      layoutJson,
    ),
    visualBlueprint: parsedBlueprint?.visualBlueprint,
    dataBlueprint: parsedBlueprint?.dataBlueprint,
    visualConfidence: parsedBlueprint?.visualBlueprint.confidence,
    structureConfidence: parsedBlueprint?.dataBlueprint?.structureConfidence,
    bindingConfidence: parsedBlueprint?.dataBlueprint?.bindingConfidence,
  };
}

export async function runReversePackAnalysis(input: {
  images: UploadedAnalysisImage[];
  mode: AnalysisMode;
  entities: Entity[];
  assets: Asset[];
  onProgress?: (step: string) => void;
}): Promise<{ pack: AnalyzedPack; draft?: DraftTemplateSuggestion }> {
  const { images, mode, entities, assets, onProgress } = input;
  const profiles = buildSheetProfiles(entities, assets);

  onProgress?.("Phân loại bộ ảnh...");
  const comboResult = await aiGenerateComboFromImages({
    images: images.map((image) => ({ dataUrl: image.dataUrl })),
    preferVisibleLines: true,
    onProgress: (step) => onProgress?.(step),
  });

  if (!comboResult.ok) {
    throw new Error(comboResult.error);
  }

  onProgress?.("Phân tích từng page...");
  const analyzedPagesRaw = await Promise.all(
    comboResult.pages.map((page, index) =>
      analyzeSinglePageImage({
        imageDataUrl: images[page.index]?.dataUrl ?? images[index].dataUrl,
        pageIndex: index,
        roleHint: page.role,
        suggestedName: page.suggestedName,
        layoutJson: page.layoutJson,
      }),
    ),
  );

  onProgress?.("Đối chiếu với toàn bộ sheet đã import...");
  const analyzedPages: AnalyzedPage[] = analyzedPagesRaw.map((page) => ({
    ...page,
    compatibility: analyzePageCompatibility(page, profiles),
  }));

  const dataBlueprintGroups = buildDataBlueprintGroups(analyzedPages);
  const analyzedPack: AnalyzedPack = {
    title: comboResult.packMeta.name || images[0]?.name || "Phân tích bộ ảnh",
    mode,
    imageCount: images.length,
    summary: `Phát hiện bộ gồm ${analyzedPages.length} ảnh với cấu trúc ${structureSummaryFromPages(analyzedPages).join(", ")}.`,
    predictedPurpose: comboResult.packMeta.goal,
    predictedGoal: comboResult.packMeta.goal,
    predictedTone: comboResult.packMeta.tone,
    predictedCta: comboResult.packMeta.cta,
    structureSummary: structureSummaryFromPages(analyzedPages),
    pages: analyzedPages,
    compatibility: analyzePackCompatibility(analyzedPages),
    warnings: comboResult.warnings,
    uiBlueprint: buildUiBlueprint(analyzedPages),
    dataBlueprint: dedupeRequirements(analyzedPages.flatMap((page) => page.requiredFields)),
    dataBlueprintGroups,
  };

  const draft =
    mode === "deep_draft" || mode === "draft_only"
      ? buildDraftSuggestion(analyzedPack, comboResult.packMeta)
      : undefined;

  return { pack: analyzedPack, draft };
}

export function buildAnalysisSummaryText(pack: AnalyzedPack): string {
  const lines: string[] = [];
  lines.push(`# Phân tích bộ ảnh: ${pack.title}`);
  lines.push(`Tổng số ảnh: ${pack.imageCount}`);
  lines.push(`Tóm tắt: ${pack.summary}`);
  lines.push(
    `Mức độ tương thích: ${compatibilityLabelText(pack.compatibility.label)} (${pack.compatibility.score}/100)`,
  );
  if (pack.compatibility.reasonSummary) {
    lines.push(`Ghi chú: ${pack.compatibility.reasonSummary}`);
  }
  lines.push("");
  lines.push("## Pack blueprint");
  pack.structureSummary.forEach((line) => lines.push(`- ${line}`));
  lines.push("");
  lines.push("## UI Blueprint");
  pack.uiBlueprint.forEach((line) => lines.push(`- ${line}`));
  lines.push("");
  lines.push("## Page-by-page");
  pack.pages.forEach((page) => {
    lines.push(
      `- Ảnh ${page.pageIndex + 1}: ${page.pageType} · ${page.suggestedName} · ${page.summary}`,
    );
    lines.push(
      `  Sheet phù hợp nhất: ${page.compatibility.bestMatchSheet ?? "chưa xác định"} · ${compatibilityLabelText(page.compatibility.label)} (${page.compatibility.score}/100)`,
    );
    if (page.compatibility.reasonSummary) {
      lines.push(`  Vì sao: ${page.compatibility.reasonSummary}`);
    }
  });
  return lines.join("\n");
}
