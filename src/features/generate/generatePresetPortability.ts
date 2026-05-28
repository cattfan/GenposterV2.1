import { nanoid } from "nanoid";
import type {
  FontAsset,
  GenPosterPortableBundleV1,
  GenerateBindingPreset,
  PackTemplate,
  PageTemplate,
  PortableFontAsset,
  Slot,
} from "@/models";
import { formatImportedTemplateName } from "@/lib/templateNames";
import { db, saveBlob } from "@/storage/db";
import { FONTS } from "@/features/editor/fonts";
import { resolveImageSrc, makeIdbSrc } from "@/storage/imageSrc";

export function safePortableFileName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "genposter";
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function readPortableBundleFile(file: File): Promise<GenPosterPortableBundleV1> {
  const raw = JSON.parse(await file.text()) as Partial<GenPosterPortableBundleV1>;
  if (raw.app !== "genposter" || raw.version !== 1) {
    throw new Error("File không đúng định dạng GenPoster.");
  }
  return raw as GenPosterPortableBundleV1;
}

const GOOGLE_FONT_FAMILIES = new Set(FONTS.map((font) => font.family));

/** Quét tất cả fontFamily xuất hiện trong slots + textRuns của 1 page. */
function collectFontFamiliesFromSlots(slots: Slot[]): Set<string> {
  const families = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) families.add(value.trim());
  };
  for (const slot of slots) {
    push(slot.style?.fontFamily);
    if (Array.isArray(slot.textRuns)) {
      for (const run of slot.textRuns) {
        push(run.style?.fontFamily);
      }
    }
  }
  return families;
}

function collectFontFamiliesFromPages(pages: PageTemplate[]): Set<string> {
  const families = new Set<string>();
  for (const page of pages) {
    for (const family of collectFontFamiliesFromSlots(page.slots)) {
      families.add(family);
    }
  }
  return families;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  const base64 = typeof btoa !== "undefined"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
  const mime = blob.type || "font/woff2";
  return `data:${mime};base64,${base64}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Font dataUrl không hợp lệ");
  const mime = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const payload = match[3] ?? "";
  if (isBase64) {
    const binary = typeof atob !== "undefined"
      ? atob(payload)
      : Buffer.from(payload, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/**
 * Tải các font upload custom được dùng trong `pages` (loại các font có sẵn ở
 * Google catalogue) và embed dạng base64 vào bundle. Cross-machine sẽ tự
 * restore về `db.fontAssets` khi import.
 */
async function collectPortableFontAssets(pages: PageTemplate[]): Promise<PortableFontAsset[]> {
  if (pages.length === 0) return [];
  const families = collectFontFamiliesFromPages(pages);
  const customFamilies = Array.from(families).filter(
    (family) => !GOOGLE_FONT_FAMILIES.has(family),
  );
  if (customFamilies.length === 0) return [];

  const allFontAssets = (await db.fontAssets.toArray()) as FontAsset[];
  const byFamily = new Map<string, FontAsset>();
  for (const fontAsset of allFontAssets) {
    if (!byFamily.has(fontAsset.family)) byFamily.set(fontAsset.family, fontAsset);
  }

  const portable: PortableFontAsset[] = [];
  for (const family of customFamilies) {
    const fontAsset = byFamily.get(family);
    if (!fontAsset) continue;
    const url = resolveImageSrc(fontAsset.sourceValue ?? null);
    if (!url) continue;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      portable.push({
        fontAssetId: fontAsset.fontAssetId,
        family: fontAsset.family,
        weight: fontAsset.weight,
        style: fontAsset.style,
        format: fontAsset.format,
        dataUrl,
        createdAt: fontAsset.createdAt,
        updatedAt: fontAsset.updatedAt,
      });
    } catch {
      // skip font không fetch được — sẽ thành missingFont khi import
    }
  }
  return portable;
}

/** Restore font upload custom: nếu chưa có family trong db → upload blob + put record. */
async function restorePortableFontAssets(
  fontAssets: PortableFontAsset[] | undefined,
): Promise<number> {
  if (!fontAssets || fontAssets.length === 0) return 0;
  const existing = (await db.fontAssets.toArray()) as FontAsset[];
  const existingFamilies = new Set(existing.map((fontAsset) => fontAsset.family));

  let added = 0;
  for (const portable of fontAssets) {
    if (existingFamilies.has(portable.family)) continue;
    try {
      const blob = dataUrlToBlob(portable.dataUrl);
      const blobKey = await saveBlob(blob);
      const record: FontAsset = {
        fontAssetId: nanoid(),
        family: portable.family,
        weight: portable.weight,
        style: portable.style,
        format: portable.format,
        blobKey,
        sourceValue: makeIdbSrc(blobKey),
        createdAt: portable.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await db.fontAssets.put(record);
      existingFamilies.add(record.family);
      added += 1;
    } catch {
      // skip font hỏng dataUrl
    }
  }
  return added;
}

export async function buildPackTemplateBundle(
  pack: PackTemplate,
  pages: PageTemplate[],
): Promise<GenPosterPortableBundleV1> {
  const fontAssets = await collectPortableFontAssets(pages);
  return {
    app: "genposter",
    kind: "pack-template",
    version: 1,
    exportedAt: Date.now(),
    packTemplates: [pack],
    pageTemplates: pages,
    fontAssets: fontAssets.length > 0 ? fontAssets : undefined,
  };
}

export async function buildGeneratePresetBundle(
  preset: GenerateBindingPreset,
  pack?: PackTemplate,
  pages: PageTemplate[] = [],
): Promise<GenPosterPortableBundleV1> {
  const fontAssets = await collectPortableFontAssets(pages);
  return {
    app: "genposter",
    kind: "generate-preset",
    version: 1,
    exportedAt: Date.now(),
    packTemplates: pack ? [pack] : [],
    pageTemplates: pages,
    generatePresets: [preset],
    fontAssets: fontAssets.length > 0 ? fontAssets : undefined,
  };
}

function pickImportId(originalId: string, existingIds: Set<string>, usedIds: Set<string>) {
  const nextId = existingIds.has(originalId) || usedIds.has(originalId) ? nanoid() : originalId;
  usedIds.add(nextId);
  return nextId;
}

function clonePageForImport(
  page: PageTemplate,
  pageIdMap: Map<string, string>,
  existingIds: Set<string>,
  usedIds: Set<string>,
): PageTemplate {
  const nextId = pickImportId(page.pageTemplateId, existingIds, usedIds);
  pageIdMap.set(page.pageTemplateId, nextId);
  const copied = structuredClone(page);
  const now = Date.now();
  return {
    ...copied,
    pageTemplateId: nextId,
    name: nextId === page.pageTemplateId ? copied.name : formatImportedTemplateName(copied.name, "Trang"),
    slots: copied.slots.map((slot) => ({
      ...slot,
      pageId: slot.pageId === page.pageTemplateId ? nextId : slot.pageId,
    })),
    createdAt: nextId === page.pageTemplateId ? copied.createdAt : now,
    updatedAt: now,
  };
}

function clonePackForImport(
  pack: PackTemplate,
  pageIdMap: Map<string, string>,
  packIdMap: Map<string, string>,
  existingIds: Set<string>,
  usedIds: Set<string>,
): PackTemplate {
  const nextId = pickImportId(pack.packTemplateId, existingIds, usedIds);
  packIdMap.set(pack.packTemplateId, nextId);
  const now = Date.now();
  const remapPageIds = (ids: string[]) => ids.map((id) => pageIdMap.get(id) ?? id);
  return {
    ...structuredClone(pack),
    packTemplateId: nextId,
    name: nextId === pack.packTemplateId ? pack.name : formatImportedTemplateName(pack.name, "Bộ khuôn"),
    orderedPages: remapPageIds(pack.orderedPages),
    requiredPages: remapPageIds(pack.requiredPages),
    optionalPages: remapPageIds(pack.optionalPages),
    createdAt: nextId === pack.packTemplateId ? pack.createdAt : now,
    updatedAt: now,
  };
}

function clonePresetForImport(
  preset: GenerateBindingPreset,
  pageIdMap: Map<string, string>,
  packIdMap: Map<string, string>,
  existingIds: Set<string>,
  usedIds: Set<string>,
): GenerateBindingPreset {
  const nextId = pickImportId(preset.presetId, existingIds, usedIds);
  const now = Date.now();
  const bindOverrides: GenerateBindingPreset["bindOverrides"] = {};
  Object.entries(preset.bindOverrides ?? {}).forEach(([pageId, overrides]) => {
    bindOverrides[pageIdMap.get(pageId) ?? pageId] = { ...overrides };
  });
  const pageTemplateDrafts: GenerateBindingPreset["pageTemplateDrafts"] = {};
  Object.entries(preset.pageTemplateDrafts ?? {}).forEach(([pageId, draft]) => {
    const mappedPageId = pageIdMap.get(pageId) ?? pageId;
    pageTemplateDrafts[mappedPageId] = {
      ...structuredClone(draft),
      pageTemplateId: mappedPageId,
      slots: draft.slots.map((slot) => ({
        ...structuredClone(slot),
        pageId: slot.pageId === pageId ? mappedPageId : slot.pageId,
      })),
      updatedAt: now,
    };
  });
  const generateConfig = structuredClone(preset.generateConfig);
  if (generateConfig.pageConfigs) {
    generateConfig.pageConfigs = Object.fromEntries(
      Object.entries(generateConfig.pageConfigs).map(([pageId, config]) => [
        pageIdMap.get(pageId) ?? pageId,
        config,
      ]),
    );
  }

  return {
    ...structuredClone(preset),
    presetId: nextId,
    name: nextId === preset.presetId ? preset.name : formatImportedTemplateName(preset.name, "Khuôn"),
    packTemplateId: preset.packTemplateId
      ? (packIdMap.get(preset.packTemplateId) ?? preset.packTemplateId)
      : undefined,
    pageTemplateIds: preset.pageTemplateIds.map((id) => pageIdMap.get(id) ?? id),
    bindOverrides,
    pageTemplateDrafts: Object.keys(pageTemplateDrafts).length > 0 ? pageTemplateDrafts : undefined,
    generateConfig,
    createdAt: nextId === preset.presetId ? preset.createdAt : now,
    updatedAt: now,
    version: 1,
  };
}

export async function importPortableBundle(bundle: GenPosterPortableBundleV1) {
  const existingPageIds = new Set((await db.pageTemplates.toCollection().primaryKeys()) as string[]);
  const existingPackIds = new Set((await db.packTemplates.toCollection().primaryKeys()) as string[]);
  const existingPresetIds = new Set((await db.generatePresets.toCollection().primaryKeys()) as string[]);
  const usedPageIds = new Set<string>();
  const usedPackIds = new Set<string>();
  const usedPresetIds = new Set<string>();
  const pageIdMap = new Map<string, string>();
  const packIdMap = new Map<string, string>();

  // Restore font upload custom TRƯỚC khi import pages — để các font reference
  // trong slot có sẵn FontAsset record tương ứng. Nếu font portable hỏng
  // dataUrl, restore sẽ skip → fontFamily đó vào danh sách missingFonts ở dưới.
  const addedFontCount = await restorePortableFontAssets(bundle.fontAssets);

  const pages = (bundle.pageTemplates ?? []).map((page) =>
    clonePageForImport(page, pageIdMap, existingPageIds, usedPageIds),
  );
  const packs = (bundle.packTemplates ?? []).map((pack) =>
    clonePackForImport(pack, pageIdMap, packIdMap, existingPackIds, usedPackIds),
  );
  const presets = (bundle.generatePresets ?? []).map((preset) =>
    clonePresetForImport(preset, pageIdMap, packIdMap, existingPresetIds, usedPresetIds),
  );

  await db.transaction(
    "rw",
    [db.pageTemplates, db.packTemplates, db.generatePresets],
    async () => {
      if (pages.length > 0) await db.pageTemplates.bulkPut(pages);
      if (packs.length > 0) await db.packTemplates.bulkPut(packs);
      if (presets.length > 0) await db.generatePresets.bulkPut(presets);
    },
  );

  // Quét fontFamily còn thiếu sau khi đã restore — để caller hiển thị toast
  // cảnh báo. Family trong Google catalogue mặc định coi là có (route đã load
  // extended fonts toàn cục). Chỉ cảnh báo những family không có ở đâu cả.
  const referencedFamilies = collectFontFamiliesFromPages(pages);
  const installedFontAssets = (await db.fontAssets.toArray()) as FontAsset[];
  const installedFamilies = new Set(installedFontAssets.map((fontAsset) => fontAsset.family));
  const missingFonts = Array.from(referencedFamilies).filter((family) => {
    if (GOOGLE_FONT_FAMILIES.has(family)) return false;
    if (installedFamilies.has(family)) return false;
    return true;
  });

  return { pages, packs, presets, missingFonts, addedFontCount };
}
