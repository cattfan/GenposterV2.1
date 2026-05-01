import type { Asset, Entity } from "@/models";

function normalizeReferenceKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valueParts(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(valueParts);
  if (typeof value === "object") return Object.values(value).flatMap(valueParts);

  return String(value)
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isImageReferenceKey(key: string) {
  const normalized = normalizeReferenceKey(key);
  if (!normalized) return false;
  if (["image_ref", "imageref", "image", "images", "img", "photo"].includes(normalized)) {
    return true;
  }

  return /(^|_)(anh|hinh|image|img|photo|drive|folder)($|_)/.test(normalized);
}

export function getEntityImageReferences(entity: Entity): string[] {
  const references = new Set<string>();

  for (const [key, value] of Object.entries(entity.metadata ?? {})) {
    if (!isImageReferenceKey(key)) continue;
    for (const part of valueParts(value)) references.add(part);
  }

  return [...references];
}

export function entityHasImageReference(entity: Entity) {
  return getEntityImageReferences(entity).length > 0;
}

export function getAssetEntityIds(assets: Asset[]) {
  return new Set(assets.map((asset) => asset.entityId));
}

export function entityHasImageSource(entity: Entity, assetEntityIds: Set<string>) {
  return assetEntityIds.has(entity.entityId) || entityHasImageReference(entity);
}
