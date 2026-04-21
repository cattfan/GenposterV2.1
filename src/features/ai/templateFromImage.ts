// Convert AI layout JSON → PageTemplate.
// AI trả slots với x/y/w/h là tỉ lệ 0..1 + placeholder text. Ta scale lên 1080x1350.

import { nanoid } from "nanoid";
import type { PageTemplate, Section, Slot } from "@/models";

interface AiSlot {
  name?: string;
  kind: "text" | "image" | "shape";
  shapeKind?: "rectangle" | "circle" | "badge" | "line" | "divider";
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  rotation?: number;
  placeholder?: string;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    color?: string;
    fill?: string;
    borderRadius?: number;
    textAlign?: "left" | "center" | "right";
    textTransform?: "none" | "uppercase" | "lowercase";
    lineHeight?: number;
    letterSpacing?: number;
    opacity?: number;
    overlayColor?: string;
    textShadow?: string;
    textStrokeColor?: string;
    textStrokeWidth?: number;
    padding?: number;
    fit?: "cover" | "contain" | "stretch";
    shadowColor?: string;
    shadowBlur?: number;
    shadowX?: number;
    shadowY?: number;
  };
}

interface AiLayout {
  canvas?: { bgColor?: string };
  slots: AiSlot[];
}

function normalizeToken(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9{}]+/g, " ")
    .trim();
}

function extractGroupIndex(source: string | undefined, prefix: string): number | null {
  const normalized = normalizeToken(source).replace(/\s+/g, "_");
  const match = normalized.match(new RegExp(`${prefix}_(\\d+)`));
  return match ? Number(match[1]) : null;
}

export function aiLayoutToTemplate(layout: AiLayout, name = "AI Template"): PageTemplate {
  const W = 1080;
  const H = 1350;
  const sectionsByIndex = new Map<number, Section>();
  const ensureSection = (groupIndex: number): Section => {
    const existing = sectionsByIndex.get(groupIndex);
    if (existing) return existing;
    const created: Section = {
      sectionId: nanoid(),
      title: "",
      maxItems: 4,
      minItems: 1,
      imageMode: "anchor_entity",
      listStyle: "dot",
      sortRule: "diversity",
      partnerMode: "balanced_partner",
      layoutMode: "poster_list",
    };
    sectionsByIndex.set(groupIndex, created);
    return created;
  };

  const slots: Slot[] = layout.slots
    .filter((s) => s && typeof s.x === "number")
    .map((s, idx) => {
      const x = Math.max(0, Math.min(1, s.x)) * W;
      const y = Math.max(0, Math.min(1, s.y)) * H;
      const width = Math.max(0.01, Math.min(1, s.w)) * W;
      const height = Math.max(0.01, Math.min(1, s.h)) * H;
      const fullCanvasImage =
        s.kind === "image" &&
        s.x <= 0.03 &&
        s.y <= 0.03 &&
        s.w >= 0.94 &&
        s.h >= 0.94;
      const sourceText = `${s.name ?? ""} ${s.placeholder ?? ""}`;
      const listGroupIndex = extractGroupIndex(sourceText, "items_group");
      const sectionTitleIndex = extractGroupIndex(sourceText, "section_title");
      const heroImageIndex = extractGroupIndex(sourceText, "hero_image");
      const anyGroupIndex = listGroupIndex ?? sectionTitleIndex ?? heroImageIndex;
      const base: Slot = {
        slotId: nanoid(),
        name: s.name,
        kind: s.kind,
        x,
        y,
        width,
        height,
        rotation: s.rotation ?? 0,
        zIndex: typeof s.z === "number" ? Math.round(s.z) : fullCanvasImage ? 0 : idx + 1,
      };
      if (anyGroupIndex != null) {
        base.groupId = `group_${anyGroupIndex}`;
        base.sectionRefId = ensureSection(anyGroupIndex).sectionId;
      }
      if (s.kind === "text") {
        if (listGroupIndex != null) {
          return {
            ...base,
            kind: "section",
            staticText: s.placeholder ?? `{{items_group_${listGroupIndex}}}`,
            style: {
              fontFamily: s.style?.fontFamily ?? "Be Vietnam Pro",
              fontSize: s.style?.fontSize ?? 28,
              fontWeight: s.style?.fontWeight ?? 600,
              color: s.style?.color ?? "#ffffff",
              textAlign: s.style?.textAlign ?? "left",
              textTransform: s.style?.textTransform ?? "none",
              lineHeight: s.style?.lineHeight ?? 1.4,
              letterSpacing: s.style?.letterSpacing,
              opacity: s.style?.opacity,
              textShadow: s.style?.textShadow,
              textStrokeColor: s.style?.textStrokeColor,
              textStrokeWidth: s.style?.textStrokeWidth,
              padding: s.style?.padding,
              background: "transparent",
            },
          };
        }
        base.staticText = s.placeholder ?? "{{text}}";
        base.style = {
          fontFamily: s.style?.fontFamily ?? "Be Vietnam Pro",
          fontSize: s.style?.fontSize ?? 32,
          fontWeight: s.style?.fontWeight ?? 600,
          color: s.style?.color ?? "#0f172a",
          textAlign: s.style?.textAlign ?? "left",
          textTransform: s.style?.textTransform ?? "none",
          lineHeight: s.style?.lineHeight,
          letterSpacing: s.style?.letterSpacing,
          opacity: s.style?.opacity,
          textShadow: s.style?.textShadow,
          textStrokeColor: s.style?.textStrokeColor,
          textStrokeWidth: s.style?.textStrokeWidth,
          padding: s.style?.padding,
        };
      } else if (s.kind === "shape") {
        base.shapeKind = s.shapeKind ?? "rectangle";
        base.style = {
          fill: s.style?.fill ?? "#e5e7eb",
          borderRadius: s.style?.borderRadius,
          opacity: s.style?.opacity,
          padding: s.style?.padding,
          shadowColor: s.style?.shadowColor,
          shadowBlur: s.style?.shadowBlur,
          shadowX: s.style?.shadowX,
          shadowY: s.style?.shadowY,
        };
      } else if (s.kind === "image") {
        base.style = {
          fit: s.style?.fit ?? "cover",
          borderRadius: s.style?.borderRadius,
          opacity: s.style?.opacity,
          overlayColor: s.style?.overlayColor,
          shadowColor: s.style?.shadowColor,
          shadowBlur: s.style?.shadowBlur,
          shadowX: s.style?.shadowX,
          shadowY: s.style?.shadowY,
        };
      }

      return base;
    });

  return {
    pageTemplateId: nanoid(),
    name,
    type: "mixed",
    canvas: { width: W, height: H, background: layout.canvas?.bgColor ?? "#ffffff" },
    slots,
    sections: Array.from(sectionsByIndex.values()),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
