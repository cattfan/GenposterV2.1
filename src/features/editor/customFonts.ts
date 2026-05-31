// Global custom-font loader.
//
// Custom (uploaded / imported-via-bundle) fonts live in db.fontAssets as blobs.
// They must be registered into document.fonts (via the FontFace API) before the
// browser can render text using them. Previously this only happened inside the
// Design editor (DesignWorkspace), so an imported pack's fonts did not render on
// other routes (Templates / Generate / preview / export) until the editor was
// opened. This module registers them app-wide, idempotently.

import { db } from "@/storage/db";
import { resolveImageSrcAsync } from "@/storage/imageSrc";
import type { FontAsset } from "@/models";

/** Tracks already-registered fonts so repeated calls are cheap and safe. */
const registeredKeys = new Set<string>();

function fontKey(fontAsset: FontAsset): string {
  return `${fontAsset.family}__${fontAsset.weight ?? 400}__${fontAsset.style ?? "normal"}`;
}

/** Register a single custom FontAsset into document.fonts (idempotent). */
export async function registerCustomFont(fontAsset: FontAsset): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const key = fontKey(fontAsset);
  if (registeredKeys.has(key)) return;
  const src = await resolveImageSrcAsync(fontAsset.sourceValue);
  const usableSrc = src ?? fontAsset.sourceValue;
  if (!usableSrc) return;
  // Mark before awaiting load to avoid duplicate concurrent registrations.
  registeredKeys.add(key);
  try {
    const font = new FontFace(fontAsset.family, `url(${usableSrc})`, {
      style: fontAsset.style ?? "normal",
      weight: String(fontAsset.weight ?? 400),
    });
    await font.load();
    document.fonts.add(font);
  } catch {
    // Allow a later retry if loading failed (e.g. blob not ready yet).
    registeredKeys.delete(key);
  }
}

/**
 * Load every custom font stored locally and register it into document.fonts.
 * Safe to call repeatedly; only newly-seen fonts do work. Call on app start so
 * imported packs render with the correct fonts everywhere, not just in the editor.
 */
export async function registerAllCustomFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  let fontAssets: FontAsset[];
  try {
    fontAssets = await db.fontAssets.toArray();
  } catch {
    return;
  }
  await Promise.all(fontAssets.map((fontAsset) => registerCustomFont(fontAsset)));
}
