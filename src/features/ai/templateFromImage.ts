import { nanoid } from "nanoid";
import type {
  AnalyzedPageType,
  BlueprintBlock,
  BlueprintFieldPart,
  CombinedLayoutBlueprint,
  DataBlueprint,
  DataBlueprintBindingHint,
  PageTemplate,
  Section,
  Slot,
  VisualBlueprint,
} from "@/models";
import { normalizeEntityTextPath } from "@/engines/binding/dataBinding";
import { SAFE_MARGIN_X, SAFE_MARGIN_Y, clampWithinSafeZone } from "@/lib/safeZone";
import { asCombinedLayoutBlueprint } from "./blueprint";
import {
  repairCombinedLayoutBlueprint,
  repairSingleBindingPath,
  type BlueprintQualitySummary,
} from "./blueprintRepair";

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
  if (/^(name|ten)_(address|dia_chi)_\d*$/.test(normalized)) {
    return undefined;
  }
  const base = normalized.replace(/_\d+$/g, "");
  const alias = COMPOSITE_FIELD_ALIASES[base];
  if (alias) return alias.bindingPath;
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
  if (bindingPath?.startsWith("entity.compose:")) {
    return composePlaceholderFromBinding(bindingPath, lineIndex);
  }
  if (
    bindingPath?.startsWith("entity.metadata.") &&
    bindingPath !== "entity.metadata.signatureDish" &&
    bindingPath !== "entity.metadata.description"
  ) {
    const key = bindingPath.slice("entity.metadata.".length);
    return `{{${safeSlotName(key, "metadata")}_${lineIndex}}}`;
  }
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

function composePlaceholderFromBinding(bindingPath: string, lineIndex: number): string {
  const fieldLabels: Record<string, string> = {
    name: "Tên mục",
    ten: "Tên mục",
    address: "Địa chỉ",
    dia_chi: "Địa chỉ",
    phone: "Số điện thoại",
    sdt: "Số điện thoại",
    price: "Giá",
    priceRange: "Giá",
    hours: "Giờ mở cửa",
    openingHours: "Giờ mở cửa",
    category: "Danh mục",
    categoryMain: "Danh mục",
    categorySub: "Nhóm phụ",
  };
  const encoded = bindingPath.slice("entity.compose:".length);
  let decoded = encoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    decoded = encoded;
  }
  const raw = decoded.split(";")[0] ?? "";
  const labels = raw
    .replace(/^fields=/i, "")
    .split(/[,+|]/)
    .map((field) => stripBindingFieldPrefix(field.trim()))
    .map((field) => fieldLabels[field] ?? field.replace(/_/g, " "))
    .filter(Boolean)
    .slice(0, 3);
  return labels.length ? labels.join(" - ") : `{{item_${lineIndex}}}`;
}

interface CompositeFieldPart {
  key: string;
  label: string;
  bindingPath: Slot["bindingPath"];
  weight: number;
}

const COMPOSITE_FIELD_ALIASES: Record<string, CompositeFieldPart> = {
  name: { key: "name", label: "Tên quán", bindingPath: "entity.name", weight: 1.35 },
  ten: { key: "name", label: "Tên quán", bindingPath: "entity.name", weight: 1.35 },
  title: { key: "name", label: "Tên quán", bindingPath: "entity.name", weight: 1.35 },
  ten_quan: { key: "name", label: "Tên quán", bindingPath: "entity.name", weight: 1.35 },
  tieu_de: { key: "name", label: "Tiêu đề", bindingPath: "entity.name", weight: 1.25 },
  hoat_dong: { key: "name", label: "Hoạt động", bindingPath: "entity.name", weight: 1.35 },
  dia_diem: { key: "name", label: "Địa điểm", bindingPath: "entity.name", weight: 1.35 },
  address: { key: "address", label: "Địa chỉ", bindingPath: "entity.address", weight: 1.45 },
  dia_chi: { key: "address", label: "Địa chỉ", bindingPath: "entity.address", weight: 1.45 },
  phone: { key: "phone", label: "SĐT", bindingPath: "entity.phone", weight: 0.9 },
  sdt: { key: "phone", label: "SĐT", bindingPath: "entity.phone", weight: 0.9 },
  hotline: { key: "phone", label: "SĐT", bindingPath: "entity.phone", weight: 0.9 },
  price: { key: "price", label: "Giá", bindingPath: "entity.priceRange", weight: 0.8 },
  gia: { key: "price", label: "Giá", bindingPath: "entity.priceRange", weight: 0.8 },
  gia_ve_tham_khao_vnd_ve: {
    key: "price",
    label: "Giá",
    bindingPath: "entity.priceRange",
    weight: 0.8,
  },
  pricerange: { key: "price", label: "Giá", bindingPath: "entity.priceRange", weight: 0.8 },
  hours: { key: "hours", label: "Giờ mở cửa", bindingPath: "entity.openingHours", weight: 1 },
  gio_mo_cua: {
    key: "hours",
    label: "Giờ mở cửa",
    bindingPath: "entity.openingHours",
    weight: 1,
  },
  khung_gio: {
    key: "hours",
    label: "Khung giờ",
    bindingPath: "entity.openingHours",
    weight: 1,
  },
  openinghours: {
    key: "hours",
    label: "Giờ mở cửa",
    bindingPath: "entity.openingHours",
    weight: 1,
  },
  category: { key: "category", label: "Nhóm", bindingPath: "entity.categoryMain", weight: 0.95 },
  mo_hinh: { key: "category", label: "Mô hình", bindingPath: "entity.categoryMain", weight: 0.95 },
  loai_dich_vu: {
    key: "category",
    label: "Loại dịch vụ",
    bindingPath: "entity.categoryMain",
    weight: 1.05,
  },
  danh_muc: {
    key: "category",
    label: "Danh mục",
    bindingPath: "entity.categoryMain",
    weight: 0.95,
  },
  categorymain: {
    key: "category",
    label: "Nhóm",
    bindingPath: "entity.categoryMain",
    weight: 0.95,
  },
  style: { key: "style", label: "Phong cách", bindingPath: "entity.style", weight: 1 },
  phong_cach: { key: "style", label: "Phong cách", bindingPath: "entity.categorySub", weight: 1 },
  categorysub: { key: "style", label: "Phong cách", bindingPath: "entity.categorySub", weight: 1 },
  subcategory: { key: "style", label: "Phong cách", bindingPath: "entity.categorySub", weight: 1 },
  signaturedish: {
    key: "signature_dish",
    label: "Món nổi bật",
    bindingPath: "entity.metadata.signatureDish",
    weight: 1.2,
  },
  mon_an_noi_bat: {
    key: "signature_dish",
    label: "Món nổi bật",
    bindingPath: "entity.metadata.signatureDish",
    weight: 1.2,
  },
  noi_bat: {
    key: "signature_dish",
    label: "Điểm nổi bật",
    bindingPath: "entity.metadata.signatureDish",
    weight: 1.2,
  },
  description: {
    key: "description",
    label: "Mô tả",
    bindingPath: "entity.metadata.description",
    weight: 1.4,
  },
  giai_thich: {
    key: "description",
    label: "Giải thích",
    bindingPath: "entity.metadata.description",
    weight: 1.4,
  },
};

function normalizeCompositeFieldKey(value: string): string {
  return normalizeToken(value)
    .replace(/^entity\s+/, "")
    .replace(/^metadata\s+/, "metadata_")
    .replace(/\s+/g, "_")
    .replace(/^metadata_/, "");
}

function stripBindingFieldPrefix(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("entity.metadata.")) return trimmed.slice("entity.metadata.".length);
  if (trimmed.startsWith("entity.")) return trimmed.slice("entity.".length);
  if (trimmed.startsWith("metadata.")) return trimmed.slice("metadata.".length);
  return trimmed;
}

function readableFieldLabel(value: string): string {
  const text = stripBindingFieldPrefix(value).replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "Dữ liệu";
  return text.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}

function compositeFieldPartFromRaw(value: string): CompositeFieldPart | undefined {
  const alias = COMPOSITE_FIELD_ALIASES[normalizeCompositeFieldKey(value)];
  if (alias) return alias;

  const rawKey = stripBindingFieldPrefix(value);
  if (!rawKey) return undefined;
  const bindingPath = normalizeEntityTextPath(value);
  if (!bindingPath.startsWith("entity.")) return undefined;

  return {
    key: safeSlotName(rawKey, "metadata"),
    label: readableFieldLabel(rawKey),
    bindingPath,
    weight: rawKey.length > 18 ? 1.25 : 1,
  };
}

function parseCompositeBinding(
  bindingPath: Slot["bindingPath"] | undefined,
): { fields: CompositeFieldPart[]; separator: string } | null {
  if (!bindingPath?.startsWith("entity.compose:")) return null;
  const encoded = bindingPath.slice("entity.compose:".length);
  let decoded = encoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    decoded = encoded;
  }

  const [fieldSpecRaw, ...optionParts] = decoded
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const fieldSpec = String(fieldSpecRaw ?? "").replace(/^fields=/i, "");
  const fields = fieldSpec
    .split(/[,+|]/)
    .map((field) => compositeFieldPartFromRaw(field))
    .filter((field): field is CompositeFieldPart => !!field);
  if (fields.length < 2) return null;

  const options = new Map<string, string>();
  for (const option of optionParts) {
    const [key, ...valueParts] = option.split("=");
    const value = valueParts.join("=").trim();
    if (key && value) options.set(key.trim().toLowerCase(), value);
  }

  return { fields, separator: options.get("separator") ?? options.get("sep") ?? "-" };
}

interface ResolvedFieldPart {
  kind: "field" | "literal";
  text?: string;
  bindingPath?: Slot["bindingPath"];
  label?: string;
  weight: number;
  xRatio?: number;
  widthRatio?: number;
}

function safeSlotName(base: string | undefined, fallback: string): string {
  return (
    normalizeToken(base)
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]+/g, "")
      .slice(0, 34) || fallback
  );
}

function bindingPathFromFieldPart(part: BlueprintFieldPart): Slot["bindingPath"] | undefined {
  const raw = part.bindingPath?.trim() || part.fieldKey?.trim() || part.label?.trim();
  if (!raw) return undefined;

  const composite = parseCompositeBinding(raw);
  if (composite) return undefined;

  const alias = compositeFieldPartFromRaw(raw);
  const normalized = alias?.bindingPath ?? normalizeEntityTextPath(raw);
  if (normalized.startsWith("entity.compose:") || normalized.startsWith("entity.list:")) {
    return undefined;
  }
  return repairSingleBindingPath(normalized, "text");
}

function normalizeBlueprintFieldPart(part: BlueprintFieldPart): ResolvedFieldPart | null {
  if (part.kind === "literal") {
    const text = part.text ?? part.label ?? "";
    if (!text.trim()) return null;
    return {
      kind: "literal",
      text,
      label: text,
      weight: Math.max(0.18, Math.min(0.8, text.trim().length * 0.12)),
      xRatio: part.xRatio,
      widthRatio: part.widthRatio,
    };
  }

  const bindingPath = bindingPathFromFieldPart(part);
  if (!bindingPath) return null;
  const key = stripBindingFieldPrefix(bindingPath).replace(/^metadata\./, "");
  const alias = compositeFieldPartFromRaw(key);
  return {
    kind: "field",
    bindingPath,
    label: part.label || part.text || alias?.label || readableFieldLabel(key),
    weight: alias?.weight ?? (key.length > 18 ? 1.25 : 1),
    xRatio: part.xRatio,
    widthRatio: part.widthRatio,
  };
}

function partsFromCompositeBinding(bindingPath: Slot["bindingPath"]): ResolvedFieldPart[] {
  const composite = parseCompositeBinding(bindingPath);
  if (!composite) return [];
  const separator = composite.separator.trim() || "-";
  return composite.fields.flatMap((field, index) => {
    const parts: ResolvedFieldPart[] = [
      {
        kind: "field",
        bindingPath: field.bindingPath,
        label: field.label,
        weight: field.weight,
      },
    ];
    if (index < composite.fields.length - 1) {
      parts.push({ kind: "literal", text: separator, label: separator, weight: 0.24 });
    }
    return parts;
  });
}

function fieldPartsFromToken(value: string | undefined): ResolvedFieldPart[] {
  const normalized = normalizeToken(value)
    .replace(/\s+/g, "_")
    .replace(/^{{|}}$/g, "");
  const base = normalized.replace(/_\d+$/g, "");
  const separator = {
    kind: "literal",
    text: "-",
    label: "-",
    weight: 0.24,
  } satisfies ResolvedFieldPart;

  if (/^(name|ten)_(address|dia_chi)$/.test(base) || base === "name_address") {
    return [
      { kind: "field", bindingPath: "entity.name", label: "Ten", weight: 1.35 },
      separator,
      { kind: "field", bindingPath: "entity.address", label: "Dia chi", weight: 1.45 },
    ];
  }

  if (/^(name|ten)_(phone|sdt|hotline)$/.test(base) || base === "name_phone") {
    return [
      { kind: "field", bindingPath: "entity.name", label: "Ten", weight: 1.35 },
      separator,
      { kind: "field", bindingPath: "entity.phone", label: "SDT", weight: 0.9 },
    ];
  }

  if (/(category|mo_hinh|loai_dich_vu).*(name|ten).*(address|dia_chi).*(phone|sdt)/.test(base)) {
    return [
      { kind: "field", bindingPath: "entity.categoryMain", label: "Loai", weight: 1 },
      separator,
      { kind: "field", bindingPath: "entity.name", label: "Ten", weight: 1.35 },
      separator,
      { kind: "field", bindingPath: "entity.address", label: "Dia chi", weight: 1.45 },
      separator,
      { kind: "literal", text: "SDT:", label: "SDT:", weight: 0.42 },
      { kind: "field", bindingPath: "entity.phone", label: "SDT", weight: 0.9 },
    ];
  }

  return [];
}

function fieldPartsFromTextSample(value: string | undefined): ResolvedFieldPart[] {
  const text = String(value ?? "").trim();
  if (!text || !/[-–—]/.test(text)) return [];
  const chunks = text
    .split(/\s+[-–—]\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length < 2 || chunks.length > 6) return [];
  if (chunks.some((chunk) => chunk.length > 70)) return [];

  const separator = {
    kind: "literal",
    text: "-",
    label: "-",
    weight: 0.24,
  } satisfies ResolvedFieldPart;
  const hasPhone = /\b(?:sdt|sdien thoai|phone|hotline|0\d{8,})\b/i.test(normalizeToken(text));
  const fieldBindings =
    chunks.length >= 4 || hasPhone
      ? ["entity.categoryMain", "entity.name", "entity.address", "entity.phone"]
      : ["entity.name", "entity.address", "entity.phone"];

  return chunks.flatMap((_, index) => {
    const bindingPath = fieldBindings[Math.min(index, fieldBindings.length - 1)];
    const parts: ResolvedFieldPart[] = [
      {
        kind: "field",
        bindingPath,
        label: readableFieldLabel(bindingPath),
        weight:
          bindingPath === "entity.address" ? 1.45 : bindingPath === "entity.name" ? 1.35 : 0.95,
      },
    ];
    if (index < chunks.length - 1) parts.push(separator);
    return parts;
  });
}

function slotFieldParts(slot: Slot): ResolvedFieldPart[] {
  const explicit = (slot.fieldParts ?? [])
    .map(normalizeBlueprintFieldPart)
    .filter((part): part is ResolvedFieldPart => !!part);
  if (explicit.length > 0) return explicit;

  const compositeParts = partsFromCompositeBinding(slot.bindingPath);
  if (compositeParts.length > 0) return compositeParts;

  const tokenParts = fieldPartsFromToken(slot.name ?? slot.staticText);
  if (tokenParts.length > 0) return tokenParts;

  const textParts = fieldPartsFromTextSample(slot.staticText);
  if (textParts.length > 0) return textParts;

  return [];
}

function splitFieldPartSlots(slots: Slot[]): Slot[] {
  const output: Slot[] = [];

  for (const slot of slots) {
    const parts = slotFieldParts(slot);
    const canSplit = slot.kind === "text" || (slot.kind === "shape" && !!slot.staticText?.trim());
    if (parts.length < 2 || !canSplit) {
      const { fieldParts: _fieldParts, ...cleanSlot } = slot;
      if (
        cleanSlot.bindingPath?.startsWith("entity.compose:") ||
        cleanSlot.bindingPath?.startsWith("entity.list:")
      ) {
        cleanSlot.bindingPath = undefined;
      }
      output.push(cleanSlot);
      continue;
    }

    const explicitRatioParts = parts.filter(
      (part) => typeof part.xRatio === "number" && typeof part.widthRatio === "number",
    );
    const baseName = safeSlotName(slot.name, "composite");
    const lineSuffix = baseName.match(/_(\d+)$/)?.[1] ?? "1";
    const fontSize = Number(slot.style?.fontSize ?? 24);
    const minLiteralWidth = Math.max(16, fontSize * 0.7);
    const minFieldWidth = Math.max(44, fontSize * 2.4);

    if (explicitRatioParts.length === parts.length) {
      for (const [partIndex, part] of parts.entries()) {
        const width = Math.max(
          part.kind === "literal" ? minLiteralWidth : minFieldWidth,
          slot.width * Math.max(0.02, Math.min(1, part.widthRatio ?? 0.1)),
        );
        output.push({
          ...slot,
          fieldParts: undefined,
          slotId: nanoid(),
          kind: "text",
          shapeKind: undefined,
          name:
            part.kind === "literal"
              ? `${baseName}_literal_${partIndex + 1}_${lineSuffix}`
              : `${baseName}_${safeSlotName(part.bindingPath, "field")}_${partIndex + 1}`,
          x: slot.x + slot.width * Math.max(0, Math.min(1, part.xRatio ?? 0)),
          width,
          staticText: part.kind === "literal" ? part.text : (part.label ?? "Field"),
          bindingPath: part.kind === "field" ? part.bindingPath : undefined,
          style: {
            ...(slot.style ?? {}),
            textAlign: part.kind === "literal" ? "center" : slot.style?.textAlign,
          },
        });
      }
      continue;
    }

    const literalWidth = Math.min(48, Math.max(minLiteralWidth, slot.width * 0.04));
    const literalCount = parts.filter((part) => part.kind === "literal").length;
    const contentWidth = Math.max(1, slot.width - literalWidth * literalCount);
    const fieldWeight = parts
      .filter((part) => part.kind === "field")
      .reduce((sum, part) => sum + part.weight, 0);
    let cursorX = slot.x;

    parts.forEach((part, partIndex) => {
      const isLiteral = part.kind === "literal";
      const remainingWidth = Math.max(1, slot.x + slot.width - cursorX);
      const width = isLiteral
        ? Math.min(literalWidth, remainingWidth)
        : Math.min(
            remainingWidth,
            Math.max(minFieldWidth, (contentWidth * part.weight) / Math.max(1, fieldWeight)),
          );
      output.push({
        ...slot,
        fieldParts: undefined,
        slotId: nanoid(),
        kind: "text",
        shapeKind: undefined,
        name: isLiteral
          ? `${baseName}_literal_${partIndex + 1}_${lineSuffix}`
          : `${baseName}_${safeSlotName(part.bindingPath, "field")}_${partIndex + 1}`,
        x: cursorX,
        width,
        staticText: isLiteral ? part.text : (part.label ?? "Field"),
        bindingPath: isLiteral ? undefined : part.bindingPath,
        style: {
          ...(slot.style ?? {}),
          textAlign: isLiteral ? "center" : slot.style?.textAlign,
        },
      });
      cursorX += width;
    });
  }

  return output;
}

function semanticPlaceholderLabel(value: string | undefined): string | undefined {
  const token = String(value ?? "")
    .trim()
    .match(/^\{\{([a-z0-9_]+)\}\}$/i)?.[1];
  if (!token) return undefined;
  const base = token.replace(/_\d+$/g, "");
  switch (base) {
    case "title":
      return "Tiêu đề";
    case "subtitle":
      return "Mô tả ngắn";
    case "eyebrow":
      return "Nhãn nhỏ";
    case "cta":
      return "CTA";
    case "section_title":
      return "Tiêu đề nhóm";
    case "items_group":
      return "Nhóm nội dung";
    case "name":
      return "Tên mục";
    case "address":
      return "Địa chỉ";
    case "name_address":
      return "Tên mục - Địa chỉ";
    case "phone":
      return "Số điện thoại";
    case "price":
      return "Giá";
    case "hours":
      return "Giờ mở cửa";
    case "category":
      return "Danh mục";
    case "subcategory":
      return "Nhóm phụ";
    case "signature_dish":
      return "Món nổi bật";
    case "description":
      return "Mô tả";
    case "text":
      return "Text mới";
    default:
      if (base.startsWith("title")) return "Tiêu đề";
      if (base.startsWith("item")) return "Mục";
      if (base.includes("image")) return "Ảnh";
      return token
        .replace(/_\d+$/g, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function readableStaticText(value: string | undefined): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return semanticPlaceholderLabel(text) ?? text;
}

function textFallbackForBlock(
  block: BlueprintBlock,
  bindingPath: Slot["bindingPath"] | undefined,
): string {
  if (block.placeholder && !isSemanticPlaceholder(block.placeholder)) {
    return block.placeholder.trim();
  }
  const semantic =
    placeholderFromBinding(bindingPath, block.lineIndex) ?? placeholderForBlock(block);
  return readableStaticText(semantic) ?? "Text mới";
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
  if (!dataBlueprint?.bindings) return undefined;
  // Ưu tiên hint có blockName khớp chính xác
  const exact = dataBlueprint.bindings.find((item) => item.blockName === block.name);
  if (exact) return exact;
  // Semantic block names like name_1/address_1/phone_1 should win before row fallback.
  if (guessBindingPath(block.placeholder ?? block.name)) return undefined;
  // Fallback: hint có clusterId + lineIndex khớp (cho list_line blocks)
  if (block.clusterId && block.lineIndex != null) {
    return dataBlueprint.bindings.find(
      (item) => item.clusterId === block.clusterId && item.lineIndex === block.lineIndex,
    );
  }
  return undefined;
}

function hasLineBlocksInCluster(visualBlueprint: VisualBlueprint, clusterId: string) {
  return visualBlueprint.blocks.some(
    (block) => block.clusterId === clusterId && block.role === "list_line",
  );
}

function buildSections(
  visualBlueprint: VisualBlueprint,
  dataBlueprint: DataBlueprint | undefined,
  _layer3Frame?: import("@/models").TemplateFrameSpec,
): Map<string, Section> {
  const sections = new Map<string, Section>();

  // 1) Dùng dataBlueprint.sections làm nguồn chính
  for (const hint of dataBlueprint?.sections ?? []) {
    const visualLineCount = visualBlueprint.blocks.filter(
      (block) => block.clusterId === hint.clusterId && block.role === "list_line",
    ).length;
    const repeatedCount = Math.max(1, hint.repeatedItemCount ?? (visualLineCount || 4));
    const hasLines = hasLineBlocksInCluster(visualBlueprint, hint.clusterId);
    sections.set(hint.clusterId, {
      sectionId: nanoid(),
      title: hint.title?.trim() || `Nhóm ${sections.size + 1}`,
      maxItems: Math.max(1, repeatedCount),
      minItems: Math.max(1, Math.min(3, repeatedCount)),
      imageMode: hint.imageRepresentsCluster ? "anchor_entity" : "section_mood",
      listStyle: "dot",
      sortRule: "diversity",
      partnerMode: "balanced_partner",
      layoutMode: hasLines ? "poster_list" : "stack",
    });
  }

  // 2) Phát hiện cluster từ visual chưa có section → tạo bổ sung
  const discoveredClusters = new Set(
    visualBlueprint.blocks
      .filter(
        (block) =>
          !!block.clusterId &&
          (block.role === "section_title" ||
            block.role === "list_group" ||
            block.role === "list_line" ||
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

function stripFrameStyleFromText(style: Slot["style"] | undefined): Slot["style"] | undefined {
  if (!style) return undefined;
  const next: Slot["style"] = { ...style };
  delete next.background;
  delete next.fill;
  delete next.stroke;
  delete next.strokeWidth;
  delete next.borderColor;
  delete next.borderWidth;
  delete next.borderStyle;
  delete next.overlayColor;
  delete next.shadowColor;
  delete next.shadowBlur;
  delete next.shadowX;
  delete next.shadowY;
  return next;
}

function slotStyleFromBlock(block: BlueprintBlock): Slot["style"] {
  const style = {
    ...block.style,
  };
  return block.kind === "text" ? stripFrameStyleFromText(style) : style;
}

function createSlotFromBlock(
  block: BlueprintBlock,
  dataBlueprint: DataBlueprint | undefined,
  sections: Map<string, Section>,
  visualBlueprint: VisualBlueprint,
  canvasWidth: number,
  canvasHeight: number,
  layer3Frame?: import("@/models").TemplateFrameSpec,
): Slot | null {
  const bindingHint = bindingHintForBlock(dataBlueprint, block);
  const sourceRole = bindingHint?.sourceRole ?? block.sourceRole;
  const fieldParts =
    bindingHint?.fieldParts && bindingHint.fieldParts.length > 0
      ? bindingHint.fieldParts
      : block.fieldParts && block.fieldParts.length > 0
        ? block.fieldParts
        : undefined;
  const clusterSection = block.clusterId ? sections.get(block.clusterId) : undefined;
  // Ưu tiên bindingPath từ dataBlueprint hint, repair nếu cần; fallback guess từ placeholder
  let explicitBinding: string | undefined;
  if (bindingHint?.bindingPath && sourceRole !== "literal") {
    explicitBinding = repairSingleBindingPath(bindingHint.bindingPath, block.kind);
  }
  if (!explicitBinding) {
    explicitBinding = guessBindingPath(block.placeholder ?? block.name);
  }

  // === Layer 3 preference (high visual fidelity) ===
  let finalX = Math.max(0, Math.min(1, block.x)) * canvasWidth;
  let finalY = Math.max(0, Math.min(1, block.y)) * canvasHeight;
  let finalW = Math.max(0.01, Math.min(1, block.w)) * canvasWidth;
  let finalH = Math.max(0.01, Math.min(1, block.h)) * canvasHeight;

  if (layer3Frame?.synthesis?.blockFidelity) {
    const decision = layer3Frame.synthesis.blockFidelity.find((d) => d.blockName === block.name);
    if (decision?.exactRect) {
      const r = decision.exactRect;
      finalX = r.x * canvasWidth;
      finalY = r.y * canvasHeight;
      finalW = r.w * canvasWidth;
      finalH = r.h * canvasHeight;
    }
    if (decision?.preferredBinding) {
      explicitBinding = decision.preferredBinding;
    }
    // textRunParts will be used later when building fieldParts / staticText
  }

  const x = finalX;
  const y = finalY;
  const width = finalW;
  const height = finalH;

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
    fieldParts,
  };

  if (block.kind === "shape") {
    base.shapeKind = block.shapeKind ?? "rectangle";
  }

  if (clusterSection) {
    base.groupId = block.clusterId;
    if (block.role !== "list_line") {
      base.sectionRefId = clusterSection.sectionId;
    }
  }

  if (block.role === "list_group" && clusterSection) {
    return {
      ...base,
      kind: "section",
      sectionRefId: clusterSection.sectionId,
      staticText: "",
    };
  }
  if (block.role === "section_title" && clusterSection) {
    return {
      ...base,
      kind: "section",
      sectionRefId: clusterSection.sectionId,
      staticText: textFallbackForBlock(block, explicitBinding),
    };
  }

  if (block.kind === "image") {
    return {
      ...base,
      bindingPath:
        bindingHint?.manualLiteral || sourceRole === "literal" ? undefined : explicitBinding,
    };
  }

  if (block.kind === "shape") {
    const staticShapeText =
      block.role === "shape_label" || block.role === "badge"
        ? block.placeholder && !isSemanticPlaceholder(block.placeholder)
          ? block.placeholder.trim()
          : ""
        : "";
    return {
      ...base,
      staticText: staticShapeText,
      bindingPath:
        bindingHint && !bindingHint.manualLiteral && sourceRole !== "literal" && staticShapeText
          ? explicitBinding
          : undefined,
    };
  }

  return {
    ...base,
    staticText: textFallbackForBlock(block, explicitBinding),
    bindingPath:
      bindingHint?.manualLiteral || sourceRole === "literal" || fieldParts
        ? undefined
        : explicitBinding,
  };
}

function normalizeGeneratedSlot(slot: Slot, canvasWidth: number, canvasHeight: number): Slot {
  const next: Slot = {
    ...slot,
    style: slot.style ? { ...slot.style } : undefined,
  };

  if (next.staticText) {
    next.staticText = readableStaticText(next.staticText) ?? next.staticText;
  }

  if (next.kind === "text" || (next.kind === "shape" && next.staticText?.trim())) {
    if (next.kind === "text") {
      next.style = stripFrameStyleFromText(next.style);
    }
    const fontSize = Number(next.style?.fontSize ?? 24);
    const lineHeight = Math.max(1.15, Math.min(2.4, Number(next.style?.lineHeight ?? 1.2)));
    const padding = Number(next.style?.padding ?? 0);
    const stroke = Number(next.style?.textStrokeWidth ?? 0);
    const verticalGuard = Math.max(4, fontSize * 0.3, stroke * 2 + 4);
    const minHeight = Math.ceil(fontSize * lineHeight + padding * 2 + verticalGuard);
    const minWidth = Math.min(canvasWidth * 0.7, Math.max(96, fontSize * 4));
    next.style = {
      ...(next.style ?? {}),
      lineHeight,
      maxLines: next.bindingPath ? (next.style?.maxLines ?? 1) : next.style?.maxLines,
    };
    if (next.bindingPath) {
      next.overflowRule = next.overflowRule ?? "shrink";
    }
    next.width = Math.max(next.width, minWidth);
    next.height = Math.max(next.height, minHeight);
  }

  next.width = Math.min(next.width, canvasWidth);
  next.height = Math.min(next.height, canvasHeight);
  next.x = Math.max(0, Math.min(next.x, canvasWidth - next.width));
  next.y = Math.max(0, Math.min(next.y, canvasHeight - next.height));
  return next;
}

function horizontalOverlapRatio(a: Slot, b: Slot): number {
  const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  return overlap / Math.max(1, Math.min(a.width, b.width));
}

function verticalOverlap(a: Slot, b: Slot): number {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function isReadableTextSlot(slot: Slot) {
  return slot.kind === "text" || (slot.kind === "shape" && !!slot.staticText?.trim());
}

function isShortLiteralSlot(slot: Slot) {
  return !slot.bindingPath && String(slot.staticText ?? "").trim().length <= 5;
}

function slotRect(slot: Slot) {
  return {
    left: slot.x,
    top: slot.y,
    right: slot.x + slot.width,
    bottom: slot.y + slot.height,
  };
}

function rowBoundingBox(slots: Slot[]) {
  const rects = slots.map(slotRect);
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

function overlapArea(a: Slot, b: Slot) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

function rowKey(slot: Slot) {
  const group = slot.groupId ?? "page";
  const yBucket = Math.round(slot.y / 12);
  return `${group}:${yBucket}`;
}

function collectTextRows(slots: Slot[]): number[][] {
  const buckets = new Map<string, number[]>();
  slots.forEach((slot, index) => {
    if (!isReadableTextSlot(slot)) return;
    const key = rowKey(slot);
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });
  return Array.from(buckets.values()).map((indexes) =>
    indexes.sort((a, b) => slots[a].x - slots[b].x || slots[a].y - slots[b].y),
  );
}

function solveInlineRows(slots: Slot[], canvasWidth: number) {
  const rows = collectTextRows(slots);
  for (const indexes of rows) {
    if (indexes.length < 2) continue;
    const minGap = 4;
    let cursor = Math.min(...indexes.map((index) => slots[index].x));

    for (const index of indexes) {
      const slot = slots[index];
      slot.x = Math.max(slot.x, cursor);
      cursor = slot.x + slot.width + minGap;
    }

    const rowSlots = indexes.map((index) => slots[index]);
    let box = rowBoundingBox(rowSlots);
    const rightLimit = canvasWidth - 12;
    if (box.right <= rightLimit) continue;

    const overflow = box.right - rightLimit;
    const shrinkable = indexes
      .map((index) => slots[index])
      .filter((slot) => !isShortLiteralSlot(slot));
    const totalShrinkable = shrinkable.reduce((sum, slot) => sum + slot.width, 0);
    const targetShrink = Math.min(overflow, Math.max(0, totalShrinkable * 0.35));
    if (targetShrink > 0 && totalShrinkable > 0) {
      for (const slot of shrinkable) {
        const fontSize = Number(slot.style?.fontSize ?? 24);
        const minWidth = Math.max(42, fontSize * 2.1);
        const share = targetShrink * (slot.width / totalShrinkable);
        slot.width = Math.max(minWidth, slot.width - share);
      }
    }

    cursor = Math.min(...indexes.map((index) => slots[index].x));
    for (const index of indexes) {
      const slot = slots[index];
      slot.x = cursor;
      cursor = slot.x + slot.width + minGap;
    }

    box = rowBoundingBox(indexes.map((index) => slots[index]));
    if (box.right > rightLimit) {
      const shift = Math.min(box.left - 12, box.right - rightLimit);
      for (const index of indexes) {
        slots[index].x -= Math.max(0, shift);
      }
    }
  }
}

function shiftRow(slots: Slot[], indexes: number[], dy: number, canvasHeight: number) {
  if (dy <= 0) return;
  const rowSlots = indexes.map((index) => slots[index]);
  const box = rowBoundingBox(rowSlots);
  const safeDy = Math.min(dy, Math.max(0, canvasHeight - 8 - box.bottom));
  for (const index of indexes) {
    slots[index].y += safeDy;
  }
}

function solveVerticalRows(slots: Slot[], canvasHeight: number) {
  const rows = collectTextRows(slots)
    .filter((indexes) => indexes.length > 0)
    .sort(
      (a, b) =>
        rowBoundingBox(a.map((index) => slots[index])).top -
        rowBoundingBox(b.map((index) => slots[index])).top,
    );

  const placed: number[][] = [];
  for (const row of rows) {
    for (const previous of placed) {
      const currentBox = rowBoundingBox(row.map((index) => slots[index]));
      const previousBox = rowBoundingBox(previous.map((index) => slots[index]));
      const horizontalOverlap = Math.max(
        0,
        Math.min(currentBox.right, previousBox.right) - Math.max(currentBox.left, previousBox.left),
      );
      const minWidth = Math.max(
        1,
        Math.min(currentBox.right - currentBox.left, previousBox.right - previousBox.left),
      );
      if (horizontalOverlap / minWidth < 0.18) continue;
      if (currentBox.top >= previousBox.bottom + 6) continue;
      const fontSize = Math.max(...row.map((index) => Number(slots[index].style?.fontSize ?? 24)));
      shiftRow(
        slots,
        row,
        previousBox.bottom + Math.max(6, fontSize * 0.16) - currentBox.top,
        canvasHeight,
      );
    }
    placed.push(row);
  }
}

function solveTextImageCollisions(slots: Slot[], canvasWidth: number, canvasHeight: number) {
  const imageSlots = slots.filter(
    (slot) =>
      slot.kind === "image" &&
      !isBackgroundImageSlot(slot, canvasWidth, canvasHeight) &&
      slot.width * slot.height < canvasWidth * canvasHeight * 0.25,
  );
  const textSlots = slots.filter((slot) => isReadableTextSlot(slot));

  for (const text of textSlots) {
    for (const image of imageSlots) {
      const ratio = overlapArea(text, image) / Math.max(1, text.width * text.height);
      if (ratio < 0.28) continue;
      const leftCandidate = image.x - text.width - 10;
      const rightCandidate = image.x + image.width + 10;
      if (leftCandidate >= 8) {
        text.x = leftCandidate;
      } else if (rightCandidate + text.width <= canvasWidth - 8) {
        text.x = rightCandidate;
      } else if (image.y + image.height + 10 + text.height <= canvasHeight - 8) {
        text.y = image.y + image.height + 10;
      }
    }
  }
}

function cleanupGeneratedSlots(slots: Slot[], canvasWidth: number, canvasHeight: number): Slot[] {
  const next = slots.map((slot) => normalizeGeneratedSlot(slot, canvasWidth, canvasHeight));
  solveInlineRows(next, canvasWidth);
  solveVerticalRows(next, canvasHeight);
  solveTextImageCollisions(next, canvasWidth, canvasHeight);

  const textIndexes = next
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => isReadableTextSlot(slot))
    .sort((a, b) => a.slot.y - b.slot.y || a.slot.x - b.slot.x)
    .map(({ index }) => index);

  const placed: number[] = [];
  for (const index of textIndexes) {
    const current = next[index];
    for (const previousIndex of placed) {
      const previous = next[previousIndex];
      if (horizontalOverlapRatio(current, previous) < 0.2) continue;
      if (verticalOverlap(current, previous) <= 0) continue;
      const fontSize = Number(current.style?.fontSize ?? 24);
      const candidateY = previous.y + previous.height + Math.max(6, fontSize * 0.16);
      if (candidateY > current.y && candidateY + current.height <= canvasHeight - 8) {
        current.y = candidateY;
      }
    }
    placed.push(index);
  }

  return next.map((slot) => normalizeGeneratedSlot(slot, canvasWidth, canvasHeight));
}

export interface AiLayoutToTemplateResult {
  template: PageTemplate;
  quality: BlueprintQualitySummary;
}

interface AiLayoutToTemplateOptions {
  sourceImageDataUrl?: string;
  /** Output from Layer 3 (Template Frame Synthesis) — preferred for high visual fidelity. */
  layer3Frame?: import("@/models").TemplateFrameSpec;
}

function isVeryDarkColor(value: string | undefined): boolean {
  const text = String(value ?? "").trim();
  const match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return false;
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((char) => char + char)
          .join("")
      : match[1];
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return r * 0.2126 + g * 0.7152 + b * 0.0722 < 42;
}

function polishCanvasBackground(value: string | undefined): string {
  if (!value) return "#ffffff";
  if (!isVeryDarkColor(value)) return value;
  return `linear-gradient(180deg, ${value} 0%, #121826 100%)`;
}

function isBackgroundImageSlot(slot: Slot, canvasWidth: number, canvasHeight: number): boolean {
  if (slot.kind !== "image") return false;
  const name = normalizeToken(slot.name);
  const coversCanvas =
    slot.x <= canvasWidth * 0.05 &&
    slot.y <= canvasHeight * 0.05 &&
    slot.width >= canvasWidth * 0.84 &&
    slot.height >= canvasHeight * 0.84;
  return coversCanvas || name.includes("background") || name.includes("bg");
}

function attachMoodBackgroundFallback(template: PageTemplate) {
  let backgroundSlot = template.slots.find((slot) =>
    isBackgroundImageSlot(slot, template.canvas.width, template.canvas.height),
  );

  if (!backgroundSlot) {
    backgroundSlot = {
      slotId: nanoid(),
      name: "mood_background",
      kind: "image",
      x: 0,
      y: 0,
      width: template.canvas.width,
      height: template.canvas.height,
      rotation: 0,
      zIndex: -10,
      bindingPath: "asset.cover",
      isUploadedBackground: true,
      style: {
        fit: "cover",
      },
    };
    template.slots.unshift(backgroundSlot);
  } else {
    backgroundSlot.name = backgroundSlot.name || "mood_background";
    backgroundSlot.x = 0;
    backgroundSlot.y = 0;
    backgroundSlot.width = template.canvas.width;
    backgroundSlot.height = template.canvas.height;
    backgroundSlot.staticImage = undefined;
    backgroundSlot.bindingPath = "asset.cover";
    backgroundSlot.zIndex = -10;
    backgroundSlot.isUploadedBackground = true;
    backgroundSlot.style = {
      ...(backgroundSlot.style ?? {}),
      fit: "cover",
      overlayColor: undefined,
    };
  }

  const overlaySlot = template.slots.find((slot) => slot.name === "mood_background_overlay");
  if (overlaySlot) {
    overlaySlot.kind = "shape";
    overlaySlot.shapeKind = "rectangle";
    overlaySlot.x = 0;
    overlaySlot.y = 0;
    overlaySlot.width = template.canvas.width;
    overlaySlot.height = template.canvas.height;
    overlaySlot.zIndex = -9;
    overlaySlot.style = { ...(overlaySlot.style ?? {}), fill: "#000000", opacity: 0.42 };
  } else {
    template.slots.unshift({
      slotId: nanoid(),
      name: "mood_background_overlay",
      kind: "shape",
      shapeKind: "rectangle",
      x: 0,
      y: 0,
      width: template.canvas.width,
      height: template.canvas.height,
      rotation: 0,
      zIndex: -9,
      style: {
        fill: "#000000",
        opacity: 0.42,
      },
    });
  }
}

export function aiLayoutToTemplate(layout: unknown, name = "AI Template"): PageTemplate {
  return aiLayoutToTemplateWithQuality(layout, name).template;
}

export function aiLayoutToTemplateWithQuality(
  layout: unknown,
  name = "AI Template",
  options: AiLayoutToTemplateOptions = {},
): AiLayoutToTemplateResult {
  void options;

  const rawBlueprint = asCombinedLayoutBlueprint(layout);
  if (!rawBlueprint) {
    throw new Error("Invalid layout blueprint");
  }

  // Repair blueprint trước khi xử lý
  const { blueprint, quality } = repairCombinedLayoutBlueprint(rawBlueprint);

  const canvasWidth = 1080;
  const canvasHeight = 1350;
  const visualBlueprint = {
    ...blueprint.visualBlueprint,
    blocks: normalizeVisualBlocks(blueprint.visualBlueprint, canvasWidth, canvasHeight),
  };
  // Prefer Layer 3 frame when provided (from options or temporary attachment on layout)
  const layer3Frame = options.layer3Frame ?? (layout as any)?.layer3Frame; // TODO (Phase 2): replace cast once CombinedLayoutBlueprint has optional layer3Frame field

  const sections = buildSections(visualBlueprint, blueprint.dataBlueprint, layer3Frame);

  const rawSlots = visualBlueprint.blocks
    .map((block) =>
      createSlotFromBlock(
        block,
        blueprint.dataBlueprint,
        sections,
        visualBlueprint,
        canvasWidth,
        canvasHeight,
        layer3Frame,
      ),
    )
    .filter((slot): slot is Slot => !!slot);

  const slots = cleanupGeneratedSlots(splitFieldPartSlots(rawSlots), canvasWidth, canvasHeight);

  // Gộp warnings từ repair + AI warnings vào validationRules
  const allWarnings = [
    ...(blueprint.dataBlueprint?.warnings ?? []),
    ...(visualBlueprint.warnings ?? []),
    ...quality.warnings.filter(
      (w) => w.includes("không hỗ trợ") || w.includes("đã bỏ") || w.includes("quá nhỏ"),
    ),
  ];
  if (quality.bindingCoverage < 0.3) {
    allWarnings.push("Binding coverage thấp (<30%), template cần gán binding thủ công.");
  }

  const template: PageTemplate = {
    pageTemplateId: nanoid(),
    name,
    type: templateTypeFromPageType(blueprint.dataBlueprint?.pageType),
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      background: polishCanvasBackground(visualBlueprint.canvas?.bgColor),
    },
    slots,
    sections: Array.from(sections.values()),
    validationRules: allWarnings.length > 0 ? allWarnings : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  attachMoodBackgroundFallback(template);

  return { template, quality };
}

export type { CombinedLayoutBlueprint };
