import { createServerFn } from "@tanstack/react-start";

interface DriveFetchInput {
  reference: string;
  rootFolderUrl?: string;
  maxFiles?: number;
}

interface DriveEntry {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType?: string;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_FILES = 20;

function validateDriveInput(input: DriveFetchInput) {
  if (!input || typeof input.reference !== "string" || input.reference.trim().length === 0) {
    throw new Error("Thieu Drive reference");
  }
  if (input.reference.length > 2000) throw new Error("Drive reference qua dai");
  if (input.rootFolderUrl && input.rootFolderUrl.length > 2000) {
    throw new Error("Drive root folder URL qua dai");
  }
  return input;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractId(input: string, kind?: "file" | "folder"): { id: string; kind: "file" | "folder" } | null {
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return { id: folderMatch[1], kind: "folder" };

  const fileMatch =
    trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ??
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/) ??
    trimmed.match(/[?&]folders=([a-zA-Z0-9_-]+)/);
  if (fileMatch) return { id: fileMatch[1], kind: kind ?? "file" };

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return { id: trimmed, kind: kind ?? "file" };
  }

  return null;
}

function isImageEntry(entry: DriveEntry) {
  return Boolean(entry.mimeType?.startsWith("image/") || IMAGE_EXT_RE.test(entry.name));
}

function parseEmbeddedFolderEntries(html: string): DriveEntry[] {
  const entries: DriveEntry[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;

  while ((match = anchorRe.exec(html))) {
    const href = decodeHtml(match[1]);
    const inner = match[2];
    const folderMatch = href.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/);
    const fileMatch = href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!folderMatch && !fileMatch) continue;

    const id = folderMatch?.[1] ?? fileMatch?.[1];
    if (!id || seen.has(id)) continue;

    const titleMatch = inner.match(/<div[^>]*class="[^"]*flip-entry-title[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const typeMatch = inner.match(/drive-thirdparty\.googleusercontent\.com\/16\/type\/([^"]+)/);
    const name = titleMatch ? stripTags(titleMatch[1]) : id;
    const mimeType = typeMatch ? decodeURIComponent(decodeHtml(typeMatch[1])) : undefined;

    seen.add(id);
    entries.push({
      id,
      name,
      kind: folderMatch ? "folder" : "file",
      mimeType,
    });
  }

  return entries;
}

async function listFolder(folderId: string): Promise<DriveEntry[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  const res = await fetch(url, {
    headers: { Accept: "text/html,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Google Drive folder tra ve ${res.status}`);
  const html = await res.text();
  return parseEmbeddedFolderEntries(html);
}

function fileNameFromDisposition(disposition: string | null) {
  if (!disposition) return "";
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) return decodeURIComponent(utfMatch[1].replace(/"/g, ""));
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch ? decodeURIComponent(plainMatch[1]) : "";
}

async function downloadFile(id: string, fallbackName: string) {
  const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: { Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Google Drive file ${id} tra ve ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES) throw new Error(`${fallbackName} lon hon 25MB`);

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error(`${fallbackName} lon hon 25MB`);

  const name = fileNameFromDisposition(res.headers.get("content-disposition")) || fallbackName || id;
  const looksImage = contentType.startsWith("image/") || IMAGE_EXT_RE.test(name);
  if (!looksImage) throw new Error(`${name} khong phai file anh`);

  return {
    id,
    name,
    mimeType: contentType.startsWith("image/") ? contentType : "image/jpeg",
    base64: arrayBufferToBase64(buffer),
    size: buffer.byteLength,
  };
}

async function resolveReference(reference: string, rootFolderUrl?: string) {
  const direct = extractId(reference);
  if (direct) return direct;

  const root = rootFolderUrl ? extractId(rootFolderUrl, "folder") : null;
  if (!root || root.kind !== "folder") return null;

  const targetSlug = slugify(reference);
  const entries = await listFolder(root.id);
  const folders = entries.filter((entry) => entry.kind === "folder");
  const files = entries.filter((entry) => entry.kind === "file");
  const exactFolder = folders.find((entry) => slugify(entry.name) === targetSlug);
  if (exactFolder) return { id: exactFolder.id, kind: "folder" as const };

  const looseFolder = folders.find((entry) => {
    const entrySlug = slugify(entry.name);
    return entrySlug.includes(targetSlug) || targetSlug.includes(entrySlug);
  });
  if (looseFolder) return { id: looseFolder.id, kind: "folder" as const };

  const exactFile = files.find((entry) => slugify(entry.name.replace(IMAGE_EXT_RE, "")) === targetSlug);
  if (exactFile) return { id: exactFile.id, kind: "file" as const, name: exactFile.name };

  return null;
}

export const fetchDriveImagesServer = createServerFn({ method: "POST" })
  .inputValidator(validateDriveInput)
  .handler(async ({ data }) => {
    const maxFiles = Math.max(1, Math.min(data.maxFiles ?? DEFAULT_MAX_FILES, 50));

    try {
      const resolved = await resolveReference(data.reference, data.rootFolderUrl);
      if (!resolved) {
        return {
          ok: false as const,
          error: "Khong tim thay file/folder Drive. Neu cot chi la ten folder, hay cau hinh root folder Drive public.",
        };
      }

      const files =
        resolved.kind === "folder"
          ? (await listFolder(resolved.id)).filter((entry) => entry.kind === "file" && isImageEntry(entry))
          : [{ id: resolved.id, name: "drive-image", kind: "file" as const, mimeType: "image/*" }];

      if (files.length === 0) {
        return { ok: false as const, error: "Folder Drive khong co file anh public doc duoc." };
      }

      const downloaded = [];
      const errors: string[] = [];
      for (const file of files.slice(0, maxFiles)) {
        try {
          downloaded.push(await downloadFile(file.id, file.name));
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      if (downloaded.length === 0) {
        return {
          ok: false as const,
          error: errors[0] ?? "Khong tai duoc anh Drive.",
        };
      }

      return {
        ok: true as const,
        files: downloaded,
        skipped: Math.max(files.length - downloaded.length, 0),
        warnings: errors,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: "Khong tai duoc Drive: " + (error instanceof Error ? error.message : String(error)),
      };
    }
  });
