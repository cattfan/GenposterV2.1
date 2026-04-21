import { nanoid } from "nanoid";
import type {
  AnalyzedPageType,
  BlueprintBlock,
  CombinedLayoutBlueprint,
  DataBlueprint,
  DataBlueprintBindingHint,
  PageTemplate,
  Section,
  Slot,
  VisualBlueprint,
} from "@/models";
import { SAFE_MARGIN_X, SAFE_MARGIN_Y, clampWithinSafeZone } from "@/lib/safeZone";
import { asCombinedLayoutBlueprint } from "./blueprint";

function templateTypeFromPageType(pageType: AnalyzedPageType | undefined): PageTemplate["type"] {
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
    default:
      return "mixed";
  }
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

function guessBindingPath(value: string | undefined): Slot["bindingPath"] {
  const normalized = normalizeToken(value).replace(/\s+/g, "_");
  if (/^name_\d+$/.test(normalized)) return "entity.name";
  if (/^address_\d+$/.test(normalized)) return "entity.address";
  if (/^phone_\d+$/.test(normalized)) return "entity.phone";
  if (/^price_\d+$/.test(normalized)) return "entity.priceRange";
  if (/^(openinghours|hours)_\d+$/.test(normalized)) return "entity.openingHours";
  if (/^(category|categorymain)_\d+$/.test(normalized)) return "entity.categoryMain";
  if (/^(categorysub|subcategory)_\d+$/.test(normalized)) return "entity.categorySub";
  if (/^hero_image_\d+$/.test(normalized) || /^image_\d+$/.test(normalized)) return "asset.random";
  if (normalized.includes("title")) return undefined;
  return undefined;
}

function isSemanticPlaceholder(value: string | undefined): boolean {
  const text = String(value ?? "").trim();
  return /^\{\{[a-z0-9_]+\}\}$/i.test(text);
}

function placeholderFromBinding(
  bindingPath: Slot["bindingPath"] | undefined,
  index: number | undefined,
): string | undefined {
  const lineIndex = typeof index === "number" && Number.isFinite(index) ? index : 1;
  switch (bindingPath) {
    case "entity.name":
      return `{{name_${lineIndex}}}`;
    case "entity.address":
      return `{{address_${lineIndex}}}`;
    case "entity.phone":
      return `{{phone_${lineIndex}}}`;
    case "entity.priceRange":
      return `{{price_${lineIndex}}}`;
    case "entity.openingHours":
      return `{{hours_${lineIndex}}}`;
    case "entity.categoryMain":
      return `{{category_${lineIndex}}}`;
    case "entity.categorySub":
      return `{{subcategory_${lineIndex}}}`;
    case "entity.metadata.signatureDish":
      return `{{signature_dish_${lineIndex}}}`;
    case "entity.metadata.description":
      return `{{description_${lineIndex}}}`;
    case "asset.random":
      return `{{hero_image_${lineIndex}}}`;
    default:
      return undefined;
  }
}

function isFullCanvasBackground(block: BlueprintBlock) {
  return (
    block.role === "background" ||
    (block.kind === "image" &&
      block.x <= 0.03 &&
      block.y <= 0.03 &&
      block.w >= 0.94 &&
      block.h >= 0.94)
  );
}

function shiftClusterWithinSafeZone(
  blocks: BlueprintBlock[],
  canvasWidth: number,
  canvasHeight: number,
): BlueprintBlock[] {
  if (blocks.length === 0) return blocks;

  const safeLeft = canvasWidth * SAFE_MARGIN_X;
  const safeTop = canvasHeight * SAFE_MARGIN_Y;
  const safeRight = canvasWidth * (1 - SAFE_MARGIN_X);
  const safeBottom = canvasHeight * (1 - SAFE_MARGIN_Y);

  const minX = Math.min(...blocks.map((block) => block.x * canvasWidth));
  const minY = Math.min(...blocks.map((block) => block.y * canvasHeight));
  const maxX = Math.max(...blocks.map((block) => (block.x + block.w) * canvasWidth));
  const maxY = Math.max(...blocks.map((block) => (block.y + block.h) * canvasHeight));

  let dx = 0;
  let dy = 0;

  if (minX < safeLeft) dx = safeLeft - minX;
  else if (maxX > safeRight) dx = safeRight - maxX;

  if (minY < safeTop) dy = safeTop - minY;
  else if (maxY > safeBottom) dy = safeBottom - maxY;

  if (dx === 0 && dy === 0) return blocks;

  return blocks.map((block) => ({
    ...block,
    x: (block.x * canvasWidth + dx) / canvasWidth,
    y: (block.y * canvasHeight + dy) / canvasHeight,
  }));
}

function normalizeVisualBlocks(
  visualBlueprint: VisualBlueprint,
  canvasWidth: number,
  canvasHeight: number,
): BlueprintBlock[] {
  const byCluster = new Map<string, BlueprintBlock[]>();
  const standalone: BlueprintBlock[] = [];

  for (const block of visualBlueprint.blocks ?? []) {
    if (block.clusterId && !isFullCanvasBackground(block)) {
      const bucket = byCluster.get(block.clusterId) ?? [];
      bucket.push(block);
      byCluster.set(block.clusterId, bucket);
    } else {
      standalone.push(block);
    }
  }

  const shiftedClusters = Array.from(byCluster.values()).flatMap((cluster) =>
    shiftClusterWithinSafeZone(cluster, canvasWidth, canvasHeight),
  );

  const normalizedStandalone = standalone.map((block) => {
    if (isFullCanvasBackground(block)) return block;
    const box = clampWithinSafeZone({
      x: block.x * canvasWidth,
      y: block.y * canvasHeight,
      width: block.w * canvasWidth,
      height: block.h * canvasHeight,
      canvasWidth,
      canvasHeight,
    });
    return {
      ...block,
      x: box.x / canvasWidth,
      y: box.y / canvasHeight,
      w: box.width / canvasWidth,
      h: box.height / canvasHeight,
    };
  });

  return [...normalizedStandalone, ...shiftedClusters].sort(
    (a, b) => (a.z ?? 0) - (b.z ?? 0) || a.name.localeCompare(b.name),
  );
}

function bindingHintForBlock(
  dataBlueprint: DataBlueprint | undefined,
  block: BlueprintBlock,
): DataBlueprintBindingHint | undefined {
  return dataBlueprint?.bindings?.find((item) => item.blockName === block.name);
}

function hasLineBlocksInCluster(visualBlueprint: VisualBlueprint, clusterId: string) {
  return visualBlueprint.blocks.some(
    (block) => block.clusterId === clusterId && block.role === "list_line",
  );
}

function buildSections(
  visualBlueprint: VisualBlueprint,
  dataBlueprint: DataBlueprint | undefined,
): Map<string, Section> {
  const sections = new Map<string, Section>();
  const hintedClusters = new Set<string>();

  for (const hint of dataBlueprint?.sections ?? []) {
    hintedClusters.add(hint.clusterId);
    const repeatedCount = Math.max(
      1,
      hint.repeatedItemCount ??
        visualBlueprint.blocks.filter(
          (block) => block.clusterId === hint.clusterId && block.role === "list_line",
        ).length ??
        4,
    );
    sections.set(hint.clusterId, {
      sectionId: nanoid(),
      title: hint.title?.trim() || `Nhóm ${sections.size + 1}`,
      maxItems: Math.max(1, repeatedCount),
      minItems: Math.max(1, Math.min(3, repeatedCount)),
      imageMode: "anchor_entity",
      listStyle: "dot",
      sortRule: "diversity",
      partnerMode: "balanced_partner",
      layoutMode: "poster_list",
    });
  }

  const discoveredClusters = new Set(
    visualBlueprint.blocks
      .filter(
        (block) =>
          !!block.clusterId &&
          (block.role === "section_title" ||
            block.role === "list_group" ||
            block.role === "image_holder"),
      )
      .map((block) => block.clusterId!) as string[],
  );

  for (const clusterId of discoveredClusters) {
    if (sections.has(clusterId)) continue;
    const titleBlock = visualBlueprint.blocks.find(
      (block) => block.clusterId === clusterId && block.role === "section_title",
    );
    const repeatedCount = Math.max(
      1,
      visualBlueprint.blocks.filter(
        (block) => block.clusterId === clusterId && block.role === "list_line",
      ).length,
    );
    sections.set(clusterId, {
      sectionId: nanoid(),
      title: titleBlock?.placeholder?.trim() || `Nhóm ${sections.size + 1}`,
      maxItems: Math.max(1, repeatedCount),
      minItems: Math.max(1, Math.min(3, repeatedCount)),
      imageMode: "anchor_entity",
      listStyle: "dot",
      sortRule: "diversity",
      partnerMode: "balanced_partner",
      layoutMode: hasLineBlocksInCluster(visualBlueprint, clusterId) ? "poster_list" : "stack",
    });
  }

  return sections;
}

function placeholderForBlock(block: BlueprintBlock): string {
  const bindingGuess = guessBindingPath(block.placeholder ?? block.name);
  const semanticFromBinding = placeholderFromBinding(bindingGuess, block.lineIndex);
  if (isSemanticPlaceholder(block.placeholder)) return block.placeholder!.trim();
  if (semanticFromBinding) return semanticFromBinding;
  switch (block.role) {
    case "title":
      return "{{title}}";
    case "subtitle":
      return "{{subtitle}}";
    case "eyebrow":
      return "{{eyebrow}}";
    case "cta":
      return "{{cta}}";
    case "section_title":
      return `{{section_title_${block.clusterId?.replace(/[^0-9]+/g, "") || "1"}}}`;
    case "list_group":
      return `{{items_group_${block.clusterId?.replace(/[^0-9]+/g, "") || "1"}}}`;
    default:
      return "{{text}}";
  }
}

function slotStyleFromBlock(block: BlueprintBlock): Slot["style"] {
  return {
    ...block.style,
  };
}

function createSlotFromBlock(
  block: BlueprintBlock,
  dataBlueprint: DataBlueprint | undefined,
  sections: Map<string, Section>,
  visualBlueprint: VisualBlueprint,
  canvasWidth: number,
  canvasHeight: number,
): Slot | null {
  const bindingHint = bindingHintForBlock(dataBlueprint, block);
  const clusterSection = block.clusterId ? sections.get(block.clusterId) : undefined;
  const explicitBinding = bindingHint?.bindingPath ?? guessBindingPath(block.placeholder ?? block.name);
  const x = Math.max(0, Math.min(1, block.x)) * canvasWidth;
  const y = Math.max(0, Math.min(1, block.y)) * canvasHeight;
  const width = Math.max(0.01, Math.min(1, block.w)) * canvasWidth;
  const height = Math.max(0.01, Math.min(1, block.h)) * canvasHeight;

  if (
    block.role === "list_group" &&
    block.clusterId &&
    hasLineBlocksInCluster(visualBlueprint, block.clusterId)
  ) {
    return null;
  }

  const base: Slot = {
    slotId: nanoid(),
    name: block.name,
    kind: block.kind,
    x,
    y,
    width,
    height,
    rotation: block.rotation ?? 0,
    zIndex: typeof block.z === "number" ? Math.round(block.z) : 1,
    style: slotStyleFromBlock(block),
  };

  if (block.kind === "shape") {
    base.shapeKind = block.shapeKind ?? "rectangle";
  }

  if (clusterSection && block.role !== "list_line") {
    base.groupId = block.clusterId;
    base.sectionRefId = clusterSection.sectionId;
  }

  if (block.role === "list_group" && clusterSection) {
    return {
      ...base,
      kind: "section",
      sectionRefId: clusterSection.sectionId,
      staticText:
        block.role === "section_title"
          ? placeholderForBlock(block)
          : "",
    };
  }

  if (block.kind === "image") {
    return {
      ...base,
      bindingPath: bindingHint?.manualLiteral ? undefined : explicitBinding,
    };
  }

  if (block.kind === "shape") {
    const staticShapeText =
      block.role === "shape_label" || block.role === "badge" ? placeholderForBlock(block) : "";
    return {
      ...base,
      staticText: staticShapeText,
      bindingPath:
        bindingHint && !bindingHint.manualLiteral && staticShapeText
          ? explicitBinding
          : undefined,
    };
  }

  return {
      ...base,
      staticText:
        isSemanticPlaceholder(block.placeholder)
          ? block.placeholder!.trim()
          : placeholderFromBinding(explicitBinding, block.lineIndex) ?? placeholderForBlock(block),
      bindingPath: bindingHint?.manualLiteral ? undefined : explicitBinding,
    };
  }

export function aiLayoutToTemplate(layout: unknown, name = "AI Template"): PageTemplate {
  const blueprint = asCombinedLayoutBlueprint(layout);
  if (!blueprint) {
    throw new Error("Invalid layout blueprint");
  }

  const canvasWidth = 1080;
  const canvasHeight = 1350;
  const visualBlueprint = {
    ...blueprint.visualBlueprint,
    blocks: normalizeVisualBlocks(blueprint.visualBlueprint, canvasWidth, canvasHeight),
  };
  const sections = buildSections(visualBlueprint, blueprint.dataBlueprint);

  const slots = visualBlueprint.blocks
    .map((block) =>
      createSlotFromBlock(
        block,
        blueprint.dataBlueprint,
        sections,
        visualBlueprint,
        canvasWidth,
        canvasHeight,
      ),
    )
    .filter((slot): slot is Slot => !!slot);

  return {
    pageTemplateId: nanoid(),
    name,
    type: templateTypeFromPageType(blueprint.dataBlueprint?.pageType),
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      background: visualBlueprint.canvas?.bgColor ?? "#ffffff",
    },
    slots,
    sections: Array.from(sections.values()),
    validationRules: blueprint.dataBlueprint?.warnings ?? visualBlueprint.warnings,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export type { CombinedLayoutBlueprint };
