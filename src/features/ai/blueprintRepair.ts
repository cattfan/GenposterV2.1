// Blueprint validator & repair: chuẩn hóa CombinedLayoutBlueprint trước khi chuyển thành PageTemplate.
// Mục tiêu: clamp tọa độ, unique name, normalize role/kind/style, repair binding path,
// tính quality summary để UI và draft dùng được.

import type {
  BlueprintBlock,
  BlueprintBlockRole,
  CombinedLayoutBlueprint,
  DataBlueprint,
  DataBlueprintBindingHint,
  VisualBlueprint,
} from "@/models";
import { AI_POSTER_FONT_FAMILIES } from "@/features/editor/fonts";

// ── Hằng số ──

const VALID_BLOCK_KINDS = new Set(["text", "image", "shape"]);
const VALID_ROLES = new Set<BlueprintBlockRole>([
  "background", "title", "subtitle", "eyebrow", "list_line", "list_group",
  "section_title", "image_holder", "shape_label", "badge", "body_text",
  "cta", "decor", "other",
]);
const VALID_SHAPE_KINDS = new Set(["rectangle", "circle", "badge", "line", "divider"]);

/** Binding path được renderer hỗ trợ (dùng để repair) */
const SUPPORTED_TEXT_BINDINGS = new Set([
  "entity.name", "entity.address", "entity.phone", "entity.priceRange",
  "entity.style", "entity.openingHours", "entity.categoryMain", "entity.categorySub",
  "entity.signatureDish", "entity.metadata.signatureDish", "entity.metadata.description",
]);
const SUPPORTED_IMAGE_BINDINGS = new Set([
  "asset.random", "asset.random_global", "asset.cover",
  "asset.byRole:cover", "asset.byRole:facade", "asset.byRole:food_closeup",
  "asset.byRole:space", "asset.byRole:portrait", "asset.byRole:square_thumb",
  "asset.byRole:section_image",
]);

// ── Helper ──

function normalizeToken(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9{}]+/g, " ")
    .trim();
}

function makeUniqueBlockName(name: string, index: number, seen: Map<string, number>): string {
  const safeBase =
    normalizeToken(name)
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]+/g, "")
      .slice(0, 42) || `block_${index + 1}`;
  const current = seen.get(safeBase) ?? 0;
  seen.set(safeBase, current + 1);
  return current === 0 ? safeBase : `${safeBase}_${current + 1}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function isSupportedBindingPath(path: string | undefined, kind: "text" | "image" | "shape"): boolean {
  if (!path) return false;
  if (path.startsWith("entity.list:")) return kind === "text";
  if (path.startsWith("entity.metadata.")) return kind === "text";
  if (SUPPORTED_TEXT_BINDINGS.has(path)) return kind === "text" || kind === "shape";
  if (SUPPORTED_IMAGE_BINDINGS.has(path)) return kind === "image" || kind === "shape";
  if (path.startsWith("asset.byRole:")) return kind === "image" || kind === "shape";
  return false;
}

function repairBindingPath(
  path: string | undefined,
  kind: "text" | "image" | "shape",
): { path: string | undefined; repaired: boolean; warning?: string } {
  if (!path) return { path: undefined, repaired: false };
  if (isSupportedBindingPath(path, kind)) return { path, repaired: false };

  // Thử sửa các path phổ biến AI hay trả sai
  const normalized = normalizeToken(path).replace(/\s+/g, ".");
  const mapping: Record<string, string> = {
    "entity.title": "entity.name",
    "entity.ten": "entity.name",
    "entity.dia_chi": "entity.address",
    "entity.gia": "entity.priceRange",
    "entity.gia_ca": "entity.priceRange",
    "entity.sdt": "entity.phone",
    "entity.so_dien_thoai": "entity.phone",
    "entity.hotline": "entity.phone",
    "entity.gio_mo_cua": "entity.openingHours",
    "entity.mo_hinh": "entity.categoryMain",
    "entity.phong_cach": "entity.categorySub",
    "entity.mon_an_noi_bat": "entity.metadata.signatureDish",
    "asset.hero_image": "asset.cover",
    "asset.background": "asset.cover",
    "asset.item_image": "asset.random",
    "asset.section_image": "asset.byRole:section_image",
    "asset.cover_image": "asset.cover",
  };
  const mapped = mapping[normalized];
  if (mapped && isSupportedBindingPath(mapped, kind)) {
    return { path: mapped, repaired: true, warning: `Binding "${path}" → "${mapped}" (auto-repair)` };
  }

  // asset.byRole:* — kiểm tra role hợp lệ
  if (path.startsWith("asset.byRole:")) {
    const role = path.slice("asset.byRole:".length);
    if (!SUPPORTED_IMAGE_BINDINGS.has(`asset.byRole:${role}`)) {
      return { path: "asset.random", repaired: true, warning: `asset.byRole:${role} không hỗ trợ → asset.random` };
    }
  }

  // Path không hỗ trợ → bỏ binding, giữ placeholder
  return { path: undefined, repaired: true, warning: `Binding "${path}" không hỗ trợ, đã bỏ.` };
}

function repairStyle(
  style: BlueprintBlock["style"] | undefined,
  allowedFontFamilies: string[],
): BlueprintBlock["style"] {
  if (!style) return style;
  const s = { ...style };

  // Font family: chỉ giữ nếu trong danh sách cho phép hoặc undefined
  if (s.fontFamily && allowedFontFamilies.length > 0) {
    const match = allowedFontFamilies.find(
      (f) => f.toLowerCase() === s.fontFamily!.toLowerCase(),
    );
    s.fontFamily = match ?? allowedFontFamilies[0];
  }

  // Font size: clamp 8..200
  if (s.fontSize != null) {
    s.fontSize = Math.max(8, Math.min(200, Math.round(s.fontSize)));
  }

  // Opacity: clamp 0..1
  if (s.opacity != null) {
    s.opacity = Math.max(0, Math.min(1, s.opacity));
  }

  // Border radius: clamp 0..9999
  if (s.borderRadius != null) {
    s.borderRadius = Math.max(0, Math.min(9999, Math.round(s.borderRadius)));
  }

  return s;
}

// ── Repair block ──

function repairBlock(
  block: BlueprintBlock,
  index: number,
  seen: Map<string, number>,
  allowedFontFamilies: string[],
): { block: BlueprintBlock; warnings: string[] } {
  const warnings: string[] = [];

  // Kind bắt buộc hợp lệ
  let kind: "text" | "image" | "shape" = "text";
  if (VALID_BLOCK_KINDS.has(block.kind)) {
    kind = block.kind;
  } else {
    warnings.push(`Block "${block.name}" kind="${block.kind}" không hợp lệ → text.`);
  }

  // Role bắt buộc hợp lệ
  let role = block.role ?? "other";
  if (!VALID_ROLES.has(role)) {
    warnings.push(`Block "${block.name}" role="${role}" không hợp lệ → other.`);
    role = "other";
  }

  // Tọa độ clamp 0..1
  const x = clamp01(block.x);
  const y = clamp01(block.y);
  const w = clamp01(block.w);
  const h = clamp01(block.h);
  if (x !== block.x || y !== block.y) {
    warnings.push(`Block "${block.name}" x/y ngoài [0,1], đã clamp.`);
  }
  if (w < 0.01 || h < 0.01) {
    warnings.push(`Block "${block.name}" w/h quá nhỏ (${w}×${h}), có thể bị ẩn.`);
  }

  // Unique name
  const name = makeUniqueBlockName(block.name || block.placeholder || `block_${index + 1}`, index, seen);

  // ShapeKind
  let shapeKind = block.shapeKind;
  if (kind === "shape" && shapeKind && !VALID_SHAPE_KINDS.has(shapeKind)) {
    warnings.push(`Block "${name}" shapeKind="${shapeKind}" không hợp lệ → rectangle.`);
    shapeKind = "rectangle";
  }

  // Style repair
  const style = repairStyle(block.style, allowedFontFamilies);

  // Placeholder: bỏ văn xuôi quá dài (>120 ký tự, không có {{}})
  let placeholder = block.placeholder;
  if (placeholder && placeholder.length > 120 && !/\{\{/.test(placeholder)) {
    placeholder = placeholder.slice(0, 80) + "...";
    warnings.push(`Block "${name}" placeholder quá dài, đã cắt.`);
  }

  return {
    block: {
      ...block,
      name,
      kind,
      role,
      x,
      y,
      w,
      h,
      shapeKind,
      style,
      placeholder,
    },
    warnings,
  };
}

// ── Repair data blueprint binding hints ──

function repairBindingHints(
  hints: DataBlueprintBindingHint[] | undefined,
  blockNameKindMap: Map<string, "text" | "image" | "shape">,
): { hints: DataBlueprintBindingHint[]; warnings: string[] } {
  if (!hints || hints.length === 0) return { hints: [], warnings: [] };

  const warnings: string[] = [];
  const repaired: DataBlueprintBindingHint[] = [];
  const seenBlockNames = new Set<string>();

  for (const hint of hints) {
    // Bỏ hint trỏ đến block không tồn tại
    if (!blockNameKindMap.has(hint.blockName)) {
      warnings.push(`Binding hint "${hint.blockName}" không khớp block nào, đã bỏ.`);
      continue;
    }

    // Trùng blockName → giữ cái confidence cao hơn
    if (seenBlockNames.has(hint.blockName)) {
      const existing = repaired.find((h) => h.blockName === hint.blockName);
      if (existing && (hint.confidence ?? 0) > (existing.confidence ?? 0)) {
        const idx = repaired.indexOf(existing);
        repaired[idx] = hint;
      }
      continue;
    }
    seenBlockNames.add(hint.blockName);

    // Repair binding path trong hint — tra kind từ block tương ứng
    const blockKind = blockNameKindMap.get(hint.blockName) ?? "text";
    const kind = hint.manualLiteral ? "text" : blockKind;
    const { path, warning } = repairBindingPath(hint.bindingPath, kind);
    if (warning) warnings.push(warning);

    repaired.push({
      ...hint,
      bindingPath: path,
    });
  }

  return { hints: repaired, warnings };
}

// ── Quality Summary ──

export interface BlueprintQualitySummary {
  totalBlocks: number;
  textBlocks: number;
  imageBlocks: number;
  shapeBlocks: number;
  listLineBlocks: number;
  sectionCount: number;
  estimatedItemCount: number;
  bindingCoverage: number; // 0..1 — % block có binding hợp lệ
  hasMainTitle: boolean;
  hasBackgroundImage: boolean;
  hasListRepeater: boolean;
  hasCTA: boolean;
  hasSectionImages: boolean;
  warnings: string[];
  repairCount: number;
  confidence: number; // 0..1 overall
}

function computeQuality(
  visualBlueprint: VisualBlueprint,
  dataBlueprint: DataBlueprint | undefined,
  repairWarnings: string[],
  repairCount: number,
): BlueprintQualitySummary {
  const blocks = visualBlueprint.blocks ?? [];
  const bindings = dataBlueprint?.bindings ?? [];
  const blockNamesWithBinding = new Set(bindings.filter((b) => b.bindingPath).map((b) => b.blockName));

  const totalBlocks = blocks.length;
  const textBlocks = blocks.filter((b) => b.kind === "text").length;
  const imageBlocks = blocks.filter((b) => b.kind === "image").length;
  const shapeBlocks = blocks.filter((b) => b.kind === "shape").length;
  const listLineBlocks = blocks.filter((b) => b.role === "list_line").length;
  const sectionCount = dataBlueprint?.numberOfSections ?? new Set(blocks.map((b) => b.clusterId).filter(Boolean)).size;
  const estimatedItemCount = dataBlueprint?.estimatedItemCount ?? listLineBlocks;
  const hasMainTitle = dataBlueprint?.hasMainTitle ?? blocks.some((b) => b.role === "title");
  const hasBackgroundImage = dataBlueprint?.hasBackgroundImage ?? blocks.some((b) => b.role === "background");
  const hasListRepeater = dataBlueprint?.hasListRepeater ?? blocks.some((b) => b.role === "list_line" || b.role === "list_group");
  const hasCTA = dataBlueprint?.hasCTA ?? blocks.some((b) => b.role === "cta");
  const hasSectionImages = dataBlueprint?.hasSectionImages ?? blocks.filter((b) => b.role === "image_holder").length >= 2;

  // Binding coverage: % block có binding (từ data hoặc guess)
  const boundBlocks = blocks.filter((b) => blockNamesWithBinding.has(b.name)).length;
  const bindingCoverage = totalBlocks > 0 ? boundBlocks / totalBlocks : 0;

  // Confidence tổng hợp
  const visualConf = visualBlueprint.confidence ?? 0.7;
  const dataConf = dataBlueprint?.bindingConfidence ?? 0.5;
  const structureConf = dataBlueprint?.structureConfidence ?? 0.6;
  const confidence = Math.min(1, (visualConf * 0.35 + dataConf * 0.35 + structureConf * 0.3));

  return {
    totalBlocks,
    textBlocks,
    imageBlocks,
    shapeBlocks,
    listLineBlocks,
    sectionCount,
    estimatedItemCount,
    bindingCoverage,
    hasMainTitle,
    hasBackgroundImage,
    hasListRepeater,
    hasCTA,
    hasSectionImages,
    warnings: repairWarnings,
    repairCount,
    confidence,
  };
}

// ── Main: repair full blueprint ──

export interface RepairResult {
  blueprint: CombinedLayoutBlueprint;
  quality: BlueprintQualitySummary;
}

export function repairCombinedLayoutBlueprint(
  input: CombinedLayoutBlueprint,
  allowedFontFamilies: string[] = AI_POSTER_FONT_FAMILIES,
): RepairResult {
  const allWarnings: string[] = [];
  let repairCount = 0;

  // ── Repair visual blocks ──
  const seen = new Map<string, number>();
  const repairedBlocks: BlueprintBlock[] = [];
  for (let i = 0; i < (input.visualBlueprint.blocks ?? []).length; i += 1) {
    const block = input.visualBlueprint.blocks[i];
    const { block: repaired, warnings } = repairBlock(block, i, seen, allowedFontFamilies);
    repairedBlocks.push(repaired);
    allWarnings.push(...warnings);
    repairCount += warnings.length;
  }

  const visualBlueprint: VisualBlueprint = {
    ...input.visualBlueprint,
    blocks: repairedBlocks,
    warnings: [...(input.visualBlueprint.warnings ?? []), ...allWarnings],
  };

  // ── Repair data blueprint ──
  let dataBlueprint: DataBlueprint | undefined = input.dataBlueprint;
  if (dataBlueprint) {
    const blockNameMap = new Map(repairedBlocks.map((b) => [b.name, b.kind]));
    const { hints, warnings: bindWarnings } = repairBindingHints(dataBlueprint.bindings, blockNameMap);
    allWarnings.push(...bindWarnings);
    repairCount += bindWarnings.length;

    // Đồng bộ numberOfSections/estimatedItemCount với visual thực tế
    const visualSectionCount = new Set(repairedBlocks.map((b) => b.clusterId).filter(Boolean)).size;
    const visualItemCount = repairedBlocks.filter((b) => b.role === "list_line").length;
    if (dataBlueprint.numberOfSections !== visualSectionCount && visualSectionCount > 0) {
      allWarnings.push(`dataBlueprint.numberOfSections (${dataBlueprint.numberOfSections}) ≠ visual clusters (${visualSectionCount}), đã sửa.`);
      repairCount += 1;
    }
    if (dataBlueprint.estimatedItemCount !== visualItemCount && visualItemCount > 0) {
      allWarnings.push(`dataBlueprint.estimatedItemCount (${dataBlueprint.estimatedItemCount}) ≠ visual list_lines (${visualItemCount}), đã sửa.`);
      repairCount += 1;
    }

    dataBlueprint = {
      ...dataBlueprint,
      bindings: hints,
      numberOfSections: visualSectionCount || dataBlueprint.numberOfSections,
      estimatedItemCount: visualItemCount || dataBlueprint.estimatedItemCount,
      warnings: [...(dataBlueprint.warnings ?? []), ...bindWarnings],
    };
  }

  const blueprint: CombinedLayoutBlueprint = {
    version: 2,
    visualBlueprint,
    dataBlueprint,
  };

  const quality = computeQuality(visualBlueprint, dataBlueprint, allWarnings, repairCount);

  return { blueprint, quality };
}

// ── Public helper: repair binding path đơn lẻ (dùng ở templateFromImage) ──

export function repairSingleBindingPath(
  path: string | undefined,
  kind: "text" | "image" | "shape",
): string | undefined {
  return repairBindingPath(path, kind).path;
}

export { isSupportedBindingPath, SUPPORTED_TEXT_BINDINGS, SUPPORTED_IMAGE_BINDINGS };
