import type { GenerationJob, PackTemplate, PageTemplate, Slot, SlotStyle } from "@/models";
import { FONTS } from "@/features/editor/fonts";
import { clonePageTemplate } from "@/features/generate/templateState";

const FONT_BY_FAMILY = new Map(FONTS.map((font) => [font.family.toLowerCase(), font]));

const ARTISTIC_FONT_SEQUENCE = [
  "Mali",
  "Baloo 2",
  "Bricolage Grotesque",
  "Fraunces",
  "Yeseva One",
  "Philosopher",
  "Pacifico",
  "Caveat",
  "Dancing Script",
  "MuseoModerno",
  "Anybody",
  "Unbounded",
  "Alumni Sans",
  "Chakra Petch",
  "Playfair Display",
  "Cormorant Garamond",
  "Prata",
  "Archivo Black",
  "Anton",
  "Space Grotesk",
];

const READABLE_FONT_SEQUENCE = [
  "Nunito Sans",
  "Quicksand",
  "Signika",
  "Lexend",
  "Sora",
  "Urbanist",
  "Manrope",
  "Plus Jakarta Sans",
  "DM Sans",
  "Outfit",
  "Lora",
  "Bitter",
  "Be Vietnam Pro",
];

function getVietnameseFont(family?: string) {
  if (!family) return undefined;
  const font = FONT_BY_FAMILY.get(family.trim().toLowerCase());
  return font?.vietnamese ? font : undefined;
}

function uniqueVietnameseFamilies(families: string[]): string[] {
  const seen = new Set<string>();
  return families.filter((family) => {
    const font = getVietnameseFont(family);
    const key = family.trim().toLowerCase();
    if (!font || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const GENERATED_ARTISTIC_FONT_FAMILIES = uniqueVietnameseFamilies(ARTISTIC_FONT_SEQUENCE);
const GENERATED_READABLE_FONT_FAMILIES = uniqueVietnameseFamilies(READABLE_FONT_SEQUENCE);

export const GENERATED_FONT_VARIANT_FAMILIES = uniqueVietnameseFamilies([
  ...ARTISTIC_FONT_SEQUENCE,
  ...READABLE_FONT_SEQUENCE,
  "Nunito",
  "Poppins",
  "Montserrat",
  "Anybody",
  "MuseoModerno",
  "Oswald",
]);

function sameFont(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function shouldVarySlotFont(slot: Slot): boolean {
  if (slot.kind === "text" || slot.kind === "section") return true;
  if (slot.kind === "shape") {
    return !!slot.staticText?.trim() || !!slot.bindingPath?.trim().startsWith("entity.");
  }
  return false;
}

function slotTextSignature(slot: Slot): string {
  const fieldPartsText =
    slot.fieldParts
      ?.map((part) =>
        [part.text, part.label, part.fieldKey, part.bindingPath].filter(Boolean).join(" "),
      )
      .join(" ") ?? "";
  return [slot.name, slot.staticText, slot.bindingPath, fieldPartsText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isBoundToData(slot: Slot): boolean {
  return (
    !!slot.bindingPath?.trim().startsWith("entity.") ||
    slot.fieldParts?.some((part) => part.kind === "field" && !!part.bindingPath) === true
  );
}

function isListOrBodySlot(slot: Slot): boolean {
  const signature = slotTextSignature(slot);
  const staticText = slot.staticText ?? "";
  const fontSize = slot.style?.fontSize ?? 0;
  if (slot.bindingPath?.includes("entity.list")) return true;
  if (staticText.split(/\r?\n/).length > 1) return true;
  if (slot.repeaterCount || slot.repeaterItemHeight) return true;
  if (fontSize > 0 && fontSize <= 30 && isBoundToData(slot)) return true;
  return /\b(item|list|row|body|address|phone|price|metadata|dia|địa|sdt|giá|gia|ten_quan|tên quán)\b/.test(
    signature,
  );
}

function isTitleSlot(slot: Slot): boolean {
  const signature = slotTextSignature(slot);
  const fontSize = slot.style?.fontSize ?? 0;
  if (fontSize >= 36) return true;
  if (slot.kind === "section" && fontSize >= 28) return true;
  if (slot.y <= 260 && fontSize >= 30) return true;
  return /\b(title|headline|heading|hero|cover|subtitle|eyebrow|pov|section|tiêu đề|tieu de|chủ đề|chu de)\b/.test(
    signature,
  );
}

function getSlotFontIntent(slot: Slot): "artistic" | "readable" {
  if (isTitleSlot(slot)) return "artistic";
  if (isListOrBodySlot(slot)) return "readable";
  return isBoundToData(slot) ? "readable" : "artistic";
}

function pickFromPalette(palette: string[], bundleIndex: number, currentFont?: string): string {
  const fallback = getVietnameseFont(currentFont)?.family ?? "Be Vietnam Pro";
  if (palette.length === 0) return fallback;
  const start = Math.max(0, bundleIndex - 2);

  for (let offset = 0; offset < palette.length; offset += 1) {
    const candidate = palette[(start + offset) % palette.length];
    if (!sameFont(candidate, currentFont)) return candidate;
  }

  return palette[start % palette.length];
}

function nearestFontWeight(weights: number[], target: number): number {
  return weights.reduce((best, weight) =>
    Math.abs(weight - target) < Math.abs(best - target) ? weight : best,
  );
}

function normalizeFontWeight(
  fontFamily: string,
  style: SlotStyle | undefined,
  intent: "artistic" | "readable",
): number | string | undefined {
  const font = getVietnameseFont(fontFamily);
  if (!font?.weights.length) return style?.fontWeight;

  const current =
    typeof style?.fontWeight === "number" ? style.fontWeight : Number(style?.fontWeight ?? NaN);
  const fallbackTarget = intent === "readable" ? 600 : font.category === "Script" ? 600 : 800;
  const rawTarget = Number.isFinite(current) ? current : fallbackTarget;
  const target = font.category === "Script" ? Math.min(rawTarget, 700) : rawTarget;
  return nearestFontWeight(font.weights, target);
}

function withMinimumLineHeight(style: SlotStyle | undefined, minimum: number): number {
  const lineHeight = style?.lineHeight;
  if (typeof lineHeight !== "number" || !Number.isFinite(lineHeight)) return minimum;
  return Math.max(lineHeight, minimum);
}

function normalizeStyleForGeneratedFont(
  style: SlotStyle | undefined,
  fontFamily: string,
  intent: "artistic" | "readable",
): SlotStyle {
  const font = getVietnameseFont(fontFamily);
  const isScript = font?.category === "Script";
  return {
    ...(style ?? {}),
    fontFamily,
    fontWeight: normalizeFontWeight(fontFamily, style, intent),
    lineHeight: withMinimumLineHeight(style, intent === "readable" ? 1.18 : isScript ? 1.14 : 1.08),
    letterSpacing: isScript ? 0 : style?.letterSpacing,
  };
}

function pickGeneratedFontVariantForSlot(slot: Slot, bundleIndex: number): string {
  const intent = getSlotFontIntent(slot);
  const palette =
    intent === "artistic" ? GENERATED_ARTISTIC_FONT_FAMILIES : GENERATED_READABLE_FONT_FAMILIES;
  return pickFromPalette(palette, bundleIndex, slot.style?.fontFamily);
}

export function pickGeneratedFontVariant(bundleIndex: number, currentFont?: string): string {
  return pickFromPalette(GENERATED_ARTISTIC_FONT_FAMILIES, bundleIndex, currentFont);
}

export function applyFontVariantToTemplate(
  template: PageTemplate,
  bundleIndex: number,
): PageTemplate {
  if (bundleIndex <= 1) return clonePageTemplate(template);

  const next = clonePageTemplate(template);
  next.slots = next.slots.map((slot) => {
    if (!shouldVarySlotFont(slot)) return slot;
    const fontFamily = pickGeneratedFontVariantForSlot(slot, bundleIndex);
    const intent = getSlotFontIntent(slot);
    return {
      ...slot,
      style: normalizeStyleForGeneratedFont(slot.style, fontFamily, intent),
    };
  });
  next.updatedAt = Date.now();
  return next;
}

export function applyFontVariationToGeneratedJob(
  job: GenerationJob,
  pack: PackTemplate,
  pageTemplates: PageTemplate[],
): GenerationJob {
  const bundleSize = Math.max(1, pack.orderedPages.length);
  const templateMap = new Map(pageTemplates.map((template) => [template.pageTemplateId, template]));

  return {
    ...job,
    pages: job.pages.map((page, index) => {
      const bundleIndex = Math.floor(index / bundleSize) + 1;
      if (bundleIndex <= 1) return page;
      const source = page.workingTemplate ?? templateMap.get(page.pageTemplateId);
      if (!source) return page;
      return {
        ...page,
        workingTemplate: applyFontVariantToTemplate(source, bundleIndex),
      };
    }),
  };
}
