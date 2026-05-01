import { db } from "./db";
import type { AppSettings } from "@/models";

const DEFAULTS: AppSettings = {
  language: "vi",
  captionProvider: "local",
  exportScale: 2,
  defaultCanvas: { width: 1080, height: 1350, background: "#ffffff" },
  theme: "light",
  driveRootFolderUrl:
    "https://drive.google.com/drive/folders/1f_gOfPyy0QbezU4y_W6EtESpo4Z_Hz9k?hl=vi",
};

export async function getSettings(): Promise<AppSettings> {
  const rec = await db.settings.get("app");
  if (!rec) return DEFAULTS;
  const { id: _id, ...rest } = rec;
  return { ...DEFAULTS, ...rest };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await db.settings.put({ id: "app", ...s });
}
