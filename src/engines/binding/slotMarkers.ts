import type { Slot } from "@/models";

function normalizeMarkerText(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .trim()
    .toLowerCase();
}

export function isDataGroupMarkerSlot(slot: Slot): boolean {
  if (slot.kind !== "text") return false;
  const text = normalizeMarkerText(slot.staticText ?? slot.name);
  const compactText = text.replace(/\s+/g, "");
  return (
    text === "nhom" ||
    /^nhom\s*\d+$/.test(text) ||
    compactText === "nhom" ||
    /^nhom\d+$/.test(compactText)
  );
}
