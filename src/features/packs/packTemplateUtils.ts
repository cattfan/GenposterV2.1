import { nanoid } from "nanoid";
import type { CanvasSize, PackTemplate, PageTemplate, PageType } from "@/models";
import { db } from "@/storage/db";
import { formatTemplateDisplayName } from "@/lib/templateNames";

export const DEFAULT_PACK_NAME = "Bộ khuôn mặc định";

/**
 * Built-in canvas presets covering the most common social + print formats.
 * Dimensions use the platform's recommended upload size so exports look sharp
 * without extra scaling.
 */
export const CANVAS_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  group: "social" | "story" | "print" | "other";
  width: number;
  height: number;
  defaultPageType?: PageType;
}> = [
  { id: "ig-post-square", label: "Instagram / Facebook vuông (1080×1080)", group: "social", width: 1080, height: 1080 },
  { id: "ig-post-portrait", label: "Instagram dọc 4:5 (1080×1350)", group: "social", width: 1080, height: 1350 },
  { id: "fb-post", label: "Facebook post (1200×900)", group: "social", width: 1200, height: 900 },
  { id: "fb-cover", label: "Facebook cover (1702×630)", group: "social", width: 1702, height: 630 },
  { id: "ig-story", label: "Instagram / TikTok story 9:16 (1080×1920)", group: "story", width: 1080, height: 1920 },
  { id: "yt-thumbnail", label: "YouTube thumbnail (1280×720)", group: "social", width: 1280, height: 720 },
  { id: "linkedin-post", label: "LinkedIn post (1200×1200)", group: "social", width: 1200, height: 1200 },
  { id: "pinterest-pin", label: "Pinterest pin (1000×1500)", group: "social", width: 1000, height: 1500 },
  { id: "print-a4-portrait", label: "A4 dọc (2480×3508 @ 300dpi)", group: "print", width: 2480, height: 3508 },
  { id: "print-a4-landscape", label: "A4 ngang (3508×2480 @ 300dpi)", group: "print", width: 3508, height: 2480 },
  { id: "print-a5-portrait", label: "A5 dọc (1748×2480 @ 300dpi)", group: "print", width: 1748, height: 2480 },
  { id: "business-card", label: "Card visit (1050×600 @ 300dpi)", group: "print", width: 1050, height: 600 },
] as const;

export function getCanvasPresetById(id: string) {
  return CANVAS_PRESETS.find((preset) => preset.id === id);
}

export function createPackTemplate(
  input: { name?: string; orderedPages?: string[] } = {},
): PackTemplate {
  const now = Date.now();
  return {
    packTemplateId: nanoid(),
    name: input.name?.trim() || "Bộ khuôn mới",
    orderedPages: Array.from(new Set(input.orderedPages ?? [])),
    requiredPages: [],
    optionalPages: [],
    captionProfile: { mode: "save_post" },
    exportDefaults: { format: "png", scale: 2 },
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankPageTemplate(
  input: { name?: string; type?: PageType; canvas?: Partial<CanvasSize>; presetId?: string } = {},
): PageTemplate {
  const now = Date.now();
  const preset = input.presetId ? getCanvasPresetById(input.presetId) : undefined;
  const canvas: CanvasSize = {
    width: input.canvas?.width ?? preset?.width ?? 1080,
    height: input.canvas?.height ?? preset?.height ?? 1350,
    background: input.canvas?.background ?? "#ffffff",
    backgroundImage: input.canvas?.backgroundImage,
  };
  return {
    pageTemplateId: nanoid(),
    name: input.name?.trim() || "Trang mới",
    type: input.type ?? preset?.defaultPageType ?? "cover",
    canvas,
    slots: [],
    sections: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicatePageTemplate(template: PageTemplate, name?: string): PageTemplate {
  const copy = JSON.parse(JSON.stringify(template)) as PageTemplate;
  const pageTemplateId = nanoid();
  const slotIdMap = new Map(copy.slots.map((slot) => [slot.slotId, nanoid()]));
  const sectionIdMap = new Map(copy.sections.map((section) => [section.sectionId, nanoid()]));
  const dataGroupIdMap = new Map(
    Array.from(new Set(copy.slots.map((slot) => slot.dataGroupId).filter(Boolean))).map((id) => [
      id as string,
      nanoid(),
    ]),
  );

  return {
    ...copy,
    pageTemplateId,
    name: name?.trim() || `${formatTemplateDisplayName(copy.name, "Trang")} - bản sao`,
    slots: copy.slots.map((slot) => ({
      ...slot,
      slotId: slotIdMap.get(slot.slotId) ?? nanoid(),
      pageId: slot.pageId ? pageTemplateId : undefined,
      sectionId: slot.sectionId ? (sectionIdMap.get(slot.sectionId) ?? slot.sectionId) : undefined,
      sectionRefId: slot.sectionRefId
        ? (sectionIdMap.get(slot.sectionRefId) ?? slot.sectionRefId)
        : undefined,
      dataGroupId: slot.dataGroupId
        ? (dataGroupIdMap.get(slot.dataGroupId) ?? slot.dataGroupId)
        : undefined,
      groupId: slot.groupId ? (slotIdMap.get(slot.groupId) ?? slot.groupId) : undefined,
    })),
    sections: copy.sections.map((section) => ({
      ...section,
      sectionId: sectionIdMap.get(section.sectionId) ?? nanoid(),
      imageSlotId: section.imageSlotId
        ? (slotIdMap.get(section.imageSlotId) ?? section.imageSlotId)
        : undefined,
    })),
    cardGroups: copy.cardGroups?.map((group) => ({
      ...group,
      groupId: slotIdMap.get(group.groupId) ?? group.groupId,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function appendPageToPack(pack: PackTemplate, pageTemplateId: string): PackTemplate {
  if (pack.orderedPages.includes(pageTemplateId)) return pack;
  return {
    ...pack,
    orderedPages: [...pack.orderedPages, pageTemplateId],
    updatedAt: Date.now(),
  };
}

export function removePageFromPackAt(pack: PackTemplate, index: number): PackTemplate {
  return {
    ...pack,
    orderedPages: pack.orderedPages.filter((_, itemIndex) => itemIndex !== index),
    requiredPages: pack.requiredPages.filter((id) => id !== pack.orderedPages[index]),
    optionalPages: pack.optionalPages.filter((id) => id !== pack.orderedPages[index]),
    updatedAt: Date.now(),
  };
}

export function getReferencedPageIds(packs: PackTemplate[]): Set<string> {
  return new Set(packs.flatMap((pack) => pack.orderedPages));
}

export async function ensureOrphanTemplatesInDefaultPack(): Promise<{
  packId?: string;
  added: number;
}> {
  const [templates, packs] = await Promise.all([
    db.pageTemplates.toArray(),
    db.packTemplates.toArray(),
  ]);
  const referenced = getReferencedPageIds(packs);
  const orphanTemplates = templates
    .filter((template) => !referenced.has(template.pageTemplateId))
    .sort((a, b) => a.updatedAt - b.updatedAt || a.name.localeCompare(b.name));

  if (orphanTemplates.length === 0) return { added: 0 };

  const defaultPack =
    packs.find((pack) => pack.name === DEFAULT_PACK_NAME) ??
    createPackTemplate({ name: DEFAULT_PACK_NAME });
  const nextPack = {
    ...defaultPack,
    orderedPages: Array.from(
      new Set([
        ...defaultPack.orderedPages,
        ...orphanTemplates.map((template) => template.pageTemplateId),
      ]),
    ),
    updatedAt: Date.now(),
  };

  await db.packTemplates.put(nextPack);
  return { packId: nextPack.packTemplateId, added: orphanTemplates.length };
}
