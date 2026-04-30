import type {
  BlueprintBlock,
  BlueprintBlockRole,
  CombinedLayoutBlueprint,
  DataBlueprint,
  Slot,
  VisualBlueprint,
} from "@/models";

interface LegacyAiSlot {
  name?: string;
  kind?: "text" | "image" | "shape";
  shapeKind?: "rectangle" | "circle" | "badge" | "line" | "divider";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
  rotation?: number;
  placeholder?: string;
  style?: BlueprintBlock["style"];
}

interface LegacyAiLayout {
  canvas?: { bgColor?: string };
  slots?: LegacyAiSlot[];
}

function normalizeToken(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9{}]+/g, " ")
    .trim();
}

function makeUniqueBlockName(name: string, index: number, seen: Map<string, number>) {
  const safeBase =
    normalizeToken(name)
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]+/g, "")
      .slice(0, 42) || `block_${index + 1}`;
  const current = seen.get(safeBase) ?? 0;
  seen.set(safeBase, current + 1);
  return current === 0 ? safeBase : `${safeBase}_${current + 1}`;
}

function detectLineIndex(source: string | undefined): number | null {
  const normalized = normalizeToken(source).replace(/\s+/g, "_");
  const match = normalized.match(
    /(name|ten|ten_quan|title|address|dia_chi|phone|sdt|hotline|price|gia|openinghours|opening_hours|hours|gio_mo_cua|category|categorymain|category_main|mo_hinh|categorysub|category_sub|subcategory|phong_cach|style|signaturedish|signature_dish|mon_an_noi_bat|mon_noi_bat|description|desc|mo_ta|hero_image|image)_(\d+)/,
  );
  return match ? Number(match[2]) : null;
}

function detectClusterId(source: string | undefined): string | undefined {
  const normalized = normalizeToken(source).replace(/\s+/g, "_");
  const match = normalized.match(/(section_title|items_group|hero_image|cluster|group)_(\d+)/);
  return match ? `cluster_${match[2]}` : undefined;
}

function guessBindingPathFromPlaceholder(source: string | undefined): string | undefined {
  const normalized = normalizeToken(source).replace(/\s+/g, "_");
  if (/^(name|ten|ten_quan|title)_\d+$/.test(normalized)) return "entity.name";
  if (/^(address|dia_chi)_\d+$/.test(normalized)) return "entity.address";
  if (/^(phone|sdt|hotline)_\d+$/.test(normalized)) return "entity.phone";
  if (/^(price|gia)_\d+$/.test(normalized)) return "entity.priceRange";
  if (/^(openinghours|opening_hours|hours|gio_mo_cua)_\d+$/.test(normalized))
    return "entity.openingHours";
  if (/^(category|categorymain|category_main|mo_hinh)_\d+$/.test(normalized))
    return "entity.categoryMain";
  if (/^(categorysub|category_sub|subcategory|phong_cach|style)_\d+$/.test(normalized))
    return "entity.categorySub";
  if (/^(signaturedish|signature_dish|mon_an_noi_bat|mon_noi_bat)_\d+$/.test(normalized))
    return "entity.metadata.signatureDish";
  if (/^(description|desc|mo_ta)_\d+$/.test(normalized)) return "entity.metadata.description";
  if (/^hero_image_\d+$/.test(normalized) || /^image_\d+$/.test(normalized)) return "asset.random";
  return undefined;
}

function guessLegacyRole(slot: LegacyAiSlot, index: number): BlueprintBlockRole {
  const source = `${slot.name ?? ""} ${slot.placeholder ?? ""}`;
  const normalized = normalizeToken(source).replace(/\s+/g, "_");
  const fontSize = slot.style?.fontSize ?? 0;
  const isFullCanvasImage =
    slot.kind === "image" &&
    (slot.x ?? 0) <= 0.03 &&
    (slot.y ?? 0) <= 0.03 &&
    (slot.w ?? 0) >= 0.94 &&
    (slot.h ?? 0) >= 0.94;

  if (isFullCanvasImage) return "background";
  if (/cta|call_to_action|dat_lich|book_now/.test(normalized)) return "cta";
  if (/eyebrow|tagline|dia_danh|dia_diem_nho/.test(normalized)) return "eyebrow";
  if (/subtitle|sub_title|mo_ta_ngan/.test(normalized)) return "subtitle";
  if (/section_title_\d+/.test(normalized)) return "section_title";
  if (/items_group_\d+/.test(normalized)) return "list_group";
  if (detectLineIndex(source) != null) return "list_line";
  if (slot.kind === "image") return "image_holder";
  if (slot.kind === "shape" && /badge|price|label/.test(normalized)) return "badge";
  if (slot.kind === "shape") return "decor";
  if (slot.kind === "text" && (fontSize >= 58 || /title|tieu_de|hero/.test(normalized))) {
    return "title";
  }
  if (slot.kind === "text") return index <= 1 ? "title" : "body_text";
  return "other";
}

function convertLegacyLayout(input: LegacyAiLayout): CombinedLayoutBlueprint {
  const seen = new Map<string, number>();
  const blocks: BlueprintBlock[] = (input.slots ?? [])
    .filter(
      (slot) =>
        slot &&
        typeof slot.kind === "string" &&
        typeof slot.x === "number" &&
        typeof slot.y === "number" &&
        typeof slot.w === "number" &&
        typeof slot.h === "number",
    )
    .map((slot, index) => {
      const source = `${slot.name ?? ""} ${slot.placeholder ?? ""}`;
      const blockName = makeUniqueBlockName(
        slot.name || slot.placeholder || `block_${index + 1}`,
        index,
        seen,
      );
      return {
        name: blockName,
        role: guessLegacyRole(slot, index),
        kind: slot.kind!,
        importance: index < 3 ? "high" : "medium",
        clusterId: detectClusterId(source),
        lineIndex: detectLineIndex(source) ?? undefined,
        shapeKind: slot.shapeKind,
        x: slot.x!,
        y: slot.y!,
        w: slot.w!,
        h: slot.h!,
        z: slot.z,
        rotation: slot.rotation,
        placeholder: slot.placeholder,
        style: slot.style,
      };
    });

  const bindings = blocks
    .map((block) => ({
      blockName: block.name,
      bindingPath: guessBindingPathFromPlaceholder(block.placeholder ?? block.name),
      clusterId: block.clusterId,
      lineIndex: block.lineIndex,
      confidence: 0.72,
    }))
    .filter((binding) => !!binding.bindingPath);

  const dataBlueprint: DataBlueprint = {
    pageRole: "other",
    pageType: "unknown",
    summary: "Blueprint legacy được suy luận từ layout JSON cũ.",
    layoutDensity: blocks.length >= 18 ? "high" : blocks.length >= 9 ? "medium" : "low",
    numberOfSections: Math.max(
      0,
      new Set(blocks.map((block) => block.clusterId).filter(Boolean)).size,
    ),
    estimatedItemCount: Math.max(0, blocks.filter((block) => block.role === "list_line").length),
    hasMainTitle: blocks.some((block) => block.role === "title"),
    hasSubtitle: blocks.some((block) => block.role === "subtitle"),
    hasBackgroundImage: blocks.some((block) => block.role === "background"),
    hasPanel: blocks.some((block) => block.kind === "shape" && block.role !== "decor"),
    hasSectionImages: blocks.filter((block) => block.role === "image_holder").length >= 2,
    hasListRepeater: blocks.some(
      (block) => block.role === "list_group" || block.role === "list_line",
    ),
    hasSlotRepeater: blocks.filter((block) => block.role === "list_line").length >= 6,
    hasPriceBadge: blocks.some((block) => block.role === "badge"),
    hasCTA: blocks.some((block) => block.role === "cta"),
    uiRegions: [],
    requiredFields: [],
    bindings,
    sections: Array.from(
      new Set(blocks.map((block) => block.clusterId).filter(Boolean) as string[]),
    ).map((clusterId) => ({
      clusterId,
      repeatedItemCount: blocks.filter(
        (block) => block.clusterId === clusterId && block.role === "list_line",
      ).length,
      confidence: 0.62,
    })),
    structureConfidence: 0.62,
    bindingConfidence: bindings.length > 0 ? 0.7 : 0.45,
    warnings: ["Layout legacy được convert sang blueprint mới."],
  };

  return {
    version: 2,
    visualBlueprint: {
      canvas: input.canvas,
      blocks,
      confidence: 0.68,
      warnings: ["Converted from legacy layout JSON."],
    },
    dataBlueprint,
  };
}

function sanitizeVisualBlueprint(visualBlueprint: VisualBlueprint): VisualBlueprint {
  const seen = new Map<string, number>();
  const blocks = (visualBlueprint.blocks ?? [])
    .filter(
      (block) =>
        block &&
        typeof block.kind === "string" &&
        typeof block.x === "number" &&
        typeof block.y === "number" &&
        typeof block.w === "number" &&
        typeof block.h === "number",
    )
    .map((block, index) => ({
      ...block,
      name: makeUniqueBlockName(
        block.name || block.placeholder || `block_${index + 1}`,
        index,
        seen,
      ),
      role: block.role ?? "other",
    }));

  return {
    ...visualBlueprint,
    blocks,
  };
}

export function asCombinedLayoutBlueprint(input: unknown): CombinedLayoutBlueprint | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<CombinedLayoutBlueprint> & LegacyAiLayout;
  if (
    candidate.version === 2 &&
    candidate.visualBlueprint &&
    Array.isArray(candidate.visualBlueprint.blocks)
  ) {
    return {
      version: 2,
      visualBlueprint: sanitizeVisualBlueprint(candidate.visualBlueprint),
      dataBlueprint: candidate.dataBlueprint,
    };
  }
  if (Array.isArray(candidate.slots)) {
    return convertLegacyLayout(candidate);
  }
  return null;
}

export function parseLayoutBlueprintJson(layoutJson?: string): CombinedLayoutBlueprint | null {
  if (!layoutJson) return null;
  try {
    return asCombinedLayoutBlueprint(JSON.parse(layoutJson));
  } catch {
    return null;
  }
}

export function serializeCombinedLayoutBlueprint(blueprint: CombinedLayoutBlueprint): string {
  return JSON.stringify(blueprint);
}
