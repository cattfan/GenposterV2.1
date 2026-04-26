// Convert AI combo result → PageTemplates + PackTemplate, sắp xếp + ghi DB.

import { nanoid } from "nanoid";
import { db } from "@/storage/db";
import type { PackTemplate, PageTemplate, Section } from "@/models";
import { aiLayoutToTemplateWithQuality } from "./templateFromImage";

interface ComboServerPage {
  index: number;
  role: "cover" | "utilities" | "day" | "outro" | "other";
  dayNumber?: number;
  suggestedName: string;
  layoutJson: string;
}

interface ComboServerResult {
  pages: ComboServerPage[];
  packMeta: { name: string; goal?: string; tone?: string; cta?: string };
}

const ROLE_ORDER: Record<ComboServerPage["role"], number> = {
  cover: 0,
  utilities: 1,
  day: 2,
  outro: 3,
  other: 4,
};

export interface BuiltCombo {
  pack: PackTemplate;
  pages: PageTemplate[];
}

/**
 * Build pack + pages từ AI combo result (chưa ghi DB).
 */
export function buildComboFromAiResult(
  result: ComboServerResult,
  packNameOverride?: string,
): BuiltCombo {
  // Sắp xếp: cover → utilities → day asc → outro → other
  const sorted = [...result.pages].sort((a, b) => {
    const ro = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (ro !== 0) return ro;
    if (a.role === "day" && b.role === "day") {
      return (a.dayNumber ?? 999) - (b.dayNumber ?? 999);
    }
    return a.index - b.index;
  });

  const pages: PageTemplate[] = sorted.map((p) => {
    let layout: unknown;
    try {
      layout = JSON.parse(p.layoutJson);
    } catch {
      layout = { slots: [] };
    }
    const { template: tpl, quality } = aiLayoutToTemplateWithQuality(
      layout,
      p.suggestedName,
    );
    // Gộp quality warnings vào validationRules nếu có
    if (quality.warnings.length > 0) {
      tpl.validationRules = [...(tpl.validationRules ?? []), ...quality.warnings.filter((w) => w.includes("không hỗ trợ") || w.includes("đã bỏ") || w.includes("quá nhỏ") || w.includes("quá dài"))];
    }
    // Set type theo role
    if (p.role === "cover") tpl.type = "cover";
    else if (p.role === "day") tpl.type = "itinerary";
    else if (p.role === "utilities") tpl.type = "board";
    else tpl.type = "mixed";

    // Day page: thêm 1 section ẩn với filterRules day=N + zigzag
    if (p.role === "day" && p.dayNumber != null) {
      const section: Section = {
        sectionId: nanoid(),
        title: `Ngày ${p.dayNumber}`,
        maxItems: 6,
        minItems: 1,
        imageMode: "anchor_entity",
        partnerMode: "balanced_partner",
        filterRules: [{ field: "day", op: "eq", value: p.dayNumber }],
        layoutMode: "zigzag",
      };
      tpl.sections = [section];
    }

    return tpl;
  });

  const pack: PackTemplate = {
    packTemplateId: nanoid(),
    name: packNameOverride?.trim() || result.packMeta.name || "Combo AI",
    goal: result.packMeta.goal,
    tone: result.packMeta.tone,
    cta: result.packMeta.cta,
    orderedPages: pages.map((p) => p.pageTemplateId),
    requiredPages: [],
    optionalPages: [],
    captionProfile: { mode: "save_post" },
    exportDefaults: { format: "png", scale: 2 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { pack, pages };
}

/**
 * Ghi pack + pages vào DB trong 1 transaction.
 */
export async function persistCombo(combo: BuiltCombo): Promise<string> {
  await db.transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
    for (const p of combo.pages) {
      await db.pageTemplates.put(p);
    }
    await db.packTemplates.put(combo.pack);
  });
  return combo.pack.packTemplateId;
}
