import type { Entity } from "@/models";

export function normalizeEntityKeyPart(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function entityContentKey(entity: Entity): string {
  const name = normalizeEntityKeyPart(entity.name);
  const address = normalizeEntityKeyPart(entity.address ?? entity.metadata?.address);
  const sheet = normalizeEntityKeyPart(entity.sheetName);
  if (name) return `${sheet}|${name}`;
  if (address) return `${sheet}|address:${address}`;
  return entity.entityId;
}
