import { createServerFn } from "@tanstack/react-start";
import { getExistingDataImageFile, saveDataImageStream } from "./dataImageStorage";

interface DriveFetchInput {
  reference: string;
  rootFolderUrl?: string;
  searchContext?: string;
  entityName?: string;
  maxFiles?: number;
}

interface DriveEntry {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType?: string;
}

type ResolvedDriveReference = { id: string; kind: "file" | "folder"; name?: string };
type DriveFetchErrorCode =
  | "invalid"
  | "private"
  | "not_found"
  | "not_image"
  | "too_large"
  | "network"
  | "throttle"
  | "unknown";
interface CachedFolderList {
  promise: Promise<DriveEntry[]>;
  expiresAt: number;
}

interface DriveSearchMatch extends ResolvedDriveReference {
  depth: number;
  path: string[];
  score: number;
}

class DriveFetchError extends Error {
  code: DriveFetchErrorCode;

  constructor(message: string, code: DriveFetchErrorCode = "unknown") {
    super(message);
    this.name = "DriveFetchError";
    this.code = code;
  }
}

const IMAGE_EXT_RE = /\.(png|jpe?g|jfif|webp|gif|bmp|avif)$/i;
const LARGE_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_FILES = 20;
const DRIVE_FILE_CONCURRENCY = 4;
const STREAM_FILE_CONCURRENCY = 1;
const MAX_STREAM_FILES_PER_REFERENCE = 1000;
const MAX_FOLDER_SEARCH_DEPTH = 4;
const MAX_NESTED_IMAGE_DEPTH = 2;
const FOLDER_LIST_CACHE_TTL_MS = 2 * 60 * 1000;
const folderListCache = new Map<string, CachedFolderList>();

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

function validateDriveInput(input: DriveFetchInput) {
  if (!input || typeof input.reference !== "string" || input.reference.trim().length === 0) {
    throw new DriveFetchError("Thiếu Drive reference.", "invalid");
  }
  if (input.reference.length > 2000) {
    throw new DriveFetchError("Drive reference quá dài.", "invalid");
  }
  if (input.rootFolderUrl && input.rootFolderUrl.length > 2000) {
    throw new DriveFetchError("Drive root folder URL quá dài.", "invalid");
  }
  if (input.searchContext && input.searchContext.length > 300) {
    throw new DriveFetchError("Drive search context quá dài.", "invalid");
  }
  if (input.entityName && input.entityName.length > 300) {
    throw new DriveFetchError("Ten quan qua dai.", "invalid");
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

function decodeBufferSnippet(buffer: ArrayBuffer) {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 4096));
}

function contentLengthFromResponse(res: Response) {
  const value = Number(res.headers.get("content-length") ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function classifyNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/quota|rate|too many|throttle|429/i.test(message)) {
    return new DriveFetchError("Google Drive đang giới hạn tốc độ. Bấm Tải tiếp sau vài phút.", "throttle");
  }
  if (/fetch failed|network|socket|econn|etimedout|timeout|reset/i.test(message)) {
    return new DriveFetchError("Lỗi mạng khi tải ảnh. Bấm Tải lại lỗi để thử lại.", "network");
  }
  return error instanceof DriveFetchError ? error : new DriveFetchError(message);
}

function classifyDriveHtml(html: string): DriveFetchError | null {
  const text = stripTags(html).toLowerCase();
  if (
    /you need access|request access|access denied|permission|sign in|đăng nhập|cần quyền|không có quyền|quyền truy cập/.test(
      text,
    )
  ) {
    return new DriveFetchError("Link Drive đang private hoặc cần quyền truy cập.", "private");
  }
  if (/\b404\b|not found|file does not exist|folder does not exist|không tìm thấy|khong tim thay/.test(text)) {
    return new DriveFetchError("Không tìm thấy file/folder Drive.", "not_found");
  }
  if (/download quota exceeded|too many users|rate limit|quota exceeded|429|throttle/.test(text)) {
    return new DriveFetchError("Google Drive đang giới hạn tốc độ tải file này.", "throttle");
  }
  return null;
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
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

function looksLikeDirectImageUrl(input: string) {
  return /^https?:\/\/.+\.(png|jpe?g|jfif|webp|gif|bmp|avif)([?#].*)?$/i.test(input.trim());
}

function looksLikeHttpUrl(input: string) {
  return /^https?:\/\//i.test(input.trim());
}

function isImageEntry(entry: DriveEntry) {
  return Boolean(entry.mimeType?.startsWith("image/") || IMAGE_EXT_RE.test(entry.name));
}

function entryComparableName(entry: DriveEntry) {
  return entry.kind === "file" ? entry.name.replace(IMAGE_EXT_RE, "") : entry.name;
}

function isLooseSlugMatch(entrySlug: string, targetSlug: string) {
  if (!entrySlug || !targetSlug) return false;
  if (entrySlug.length < 4 || targetSlug.length < 4) return false;
  return entrySlug.includes(targetSlug) || targetSlug.includes(entrySlug);
}

function tokenOverlapScore(entrySlug: string, targetSlug: string) {
  const entryTokens = new Set(entrySlug.split(" ").filter((token) => token.length >= 2));
  const targetTokens = targetSlug.split(" ").filter((token) => token.length >= 2);
  if (targetTokens.length < 2) return 0;

  const matched = targetTokens.filter((token) => entryTokens.has(token)).length;
  if (matched === targetTokens.length) return 55;
  if (targetTokens.length >= 3 && matched / targetTokens.length >= 0.8) return 45;
  return 0;
}

function scoreEntryMatch(entry: DriveEntry, targetSlug: string) {
  const entrySlug = slugify(entryComparableName(entry));
  if (!entrySlug || !targetSlug) return 0;

  if (entrySlug === targetSlug) return entry.kind === "folder" ? 100 : 90;
  if (isLooseSlugMatch(entrySlug, targetSlug)) return entry.kind === "folder" ? 70 : 60;

  const tokenScore = tokenOverlapScore(entrySlug, targetSlug);
  if (!tokenScore) return 0;
  return tokenScore + (entry.kind === "folder" ? 5 : 0);
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
  if (res.status === 401 || res.status === 403) {
    throw new DriveFetchError("Folder Drive đang private hoặc cần quyền truy cập.", "private");
  }
  if (res.status === 404) {
    throw new DriveFetchError("Không tìm thấy folder Drive.", "not_found");
  }
  if (!res.ok) throw new DriveFetchError(`Google Drive folder trả về ${res.status}.`, "unknown");
  const html = await res.text();
  const entries = parseEmbeddedFolderEntries(html);
  if (entries.length > 0) return entries;

  const htmlProblem = classifyDriveHtml(html);
  if (htmlProblem) throw htmlProblem;
  return entries;
}

function listFolderCached(folderId: string): Promise<DriveEntry[]> {
  const cached = folderListCache.get(folderId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const request = listFolder(folderId).catch((error) => {
    folderListCache.delete(folderId);
    throw error;
  });
  folderListCache.set(folderId, {
    promise: request,
    expiresAt: Date.now() + FOLDER_LIST_CACHE_TTL_MS,
  });
  return request;
}

function fileNameFromDisposition(disposition: string | null) {
  if (!disposition) return "";
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) return decodeURIComponent(utfMatch[1].replace(/"/g, ""));
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch ? decodeURIComponent(plainMatch[1]) : "";
}

function ensureImageResponse(res: Response, fallbackName: string) {
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = contentLengthFromResponse(res);
  const name = fileNameFromDisposition(res.headers.get("content-disposition")) || fallbackName;
  const looksImage = contentType.startsWith("image/") || contentType === "application/octet-stream" || IMAGE_EXT_RE.test(name);
  return {
    contentType,
    contentLength,
    name,
    looksImage,
  };
}

function directImageNameFromUrl(url: string, fallbackName: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "") || fallbackName;
  } catch {
    return fallbackName;
  }
}

async function htmlResponseProblem(res: Response, fallback: DriveFetchError) {
  const snippet = await readResponseSnippet(res);
  return classifyDriveHtml(snippet) ?? fallback;
}

async function downloadFile(id: string, fallbackName: string) {
  const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: { Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (res.status === 401 || res.status === 403) {
    throw new DriveFetchError("File Drive đang private hoặc cần quyền truy cập.", "private");
  }
  if (res.status === 404) {
    throw new DriveFetchError("Không tìm thấy file Drive.", "not_found");
  }
  if (!res.ok) throw new DriveFetchError(`Google Drive file ${id} trả về ${res.status}.`, "unknown");

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  if (contentType.includes("text/html")) {
    const htmlProblem = classifyDriveHtml(decodeBufferSnippet(buffer));
    throw (
      htmlProblem ??
      new DriveFetchError(
        "Drive trả về trang HTML thay vì ảnh. Kiểm tra lại quyền public của file.",
        "private",
      )
    );
  }

  const name = fileNameFromDisposition(res.headers.get("content-disposition")) || fallbackName || id;
  const looksImage = contentType.startsWith("image/") || IMAGE_EXT_RE.test(name);
  if (!looksImage) throw new DriveFetchError(`${name} không phải file ảnh.`, "not_image");

  return {
    id,
    name,
    mimeType: contentType.startsWith("image/") ? contentType : "image/jpeg",
    base64: arrayBufferToBase64(buffer),
    size: buffer.byteLength,
  };
}

async function downloadDirectImageUrl(url: string, fallbackName: string) {
  const res = await fetch(url, {
    headers: { Accept: "image/*,*/*" },
    redirect: "follow",
  });

  if (res.status === 401 || res.status === 403) {
    throw new DriveFetchError("Link anh can quyen truy cap hoac dang private.", "private");
  }
  if (res.status === 404) {
    throw new DriveFetchError("Khong tim thay anh tu link trong sheet.", "not_found");
  }
  if (!res.ok) throw new DriveFetchError(`Link anh tra ve ${res.status}.`, "unknown");

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  if (contentType.includes("text/html")) {
    throw new DriveFetchError("Link trong sheet tra ve HTML thay vi file anh.", "not_image");
  }

  const nameFromUrl = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
  const name = fileNameFromDisposition(res.headers.get("content-disposition")) || nameFromUrl || fallbackName;
  const looksImage = contentType.startsWith("image/") || IMAGE_EXT_RE.test(name);
  if (!looksImage) throw new DriveFetchError(`${name} khong phai file anh.`, "not_image");

  return {
    id: url,
    name,
    mimeType: contentType.startsWith("image/") ? contentType : "image/jpeg",
    base64: arrayBufferToBase64(buffer),
    size: buffer.byteLength,
  };
}

async function downloadDriveFileToData(input: {
  file: DriveEntry;
  sheetName?: string;
  entityName?: string;
}) {
  const existing = await getExistingDataImageFile({
    sheetName: input.sheetName,
    entityName: input.entityName,
    sourceId: input.file.id,
    fileName: input.file.name,
    mimeType: input.file.mimeType,
  });
  if (existing) {
    return {
      id: input.file.id,
      name: input.file.name,
      mimeType: input.file.mimeType ?? "image/jpeg",
      size: existing.size,
      url: existing.url,
      relativePath: existing.relativePath,
      skipped: true,
      warnings: [] as string[],
    };
  }

  const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(input.file.id)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "image/*,*/*" },
      redirect: "follow",
    });
  } catch (error) {
    throw classifyNetworkError(error);
  }

  if (res.status === 401 || res.status === 403) {
    await cancelBody(res);
    throw new DriveFetchError("File Drive đang private hoặc cần quyền truy cập.", "private");
  }
  if (res.status === 404) {
    await cancelBody(res);
    throw new DriveFetchError("Không tìm thấy file Drive.", "not_found");
  }
  if (res.status === 429) {
    await cancelBody(res);
    throw new DriveFetchError("Google Drive đang giới hạn tốc độ tải file này.", "throttle");
  }
  if (!res.ok) {
    await cancelBody(res);
    throw new DriveFetchError(`Google Drive file ${input.file.id} trả về ${res.status}.`, "unknown");
  }

  const responseInfo = ensureImageResponse(res, input.file.name || input.file.id);
  if (responseInfo.contentType.includes("text/html")) {
    throw await htmlResponseProblem(
      res,
      new DriveFetchError(
        "Drive trả về trang HTML thay vì ảnh. Kiểm tra lại quyền public của file.",
        "private",
      ),
    );
  }
  if (!responseInfo.looksImage) {
    await cancelBody(res);
    throw new DriveFetchError(`${responseInfo.name} không phải file ảnh.`, "not_image");
  }
  if (!res.body) {
    throw new DriveFetchError(`${responseInfo.name} không có nội dung để tải.`, "unknown");
  }

  const saved = await saveDataImageStream({
    sheetName: input.sheetName,
    entityName: input.entityName,
    sourceId: input.file.id,
    fileName: responseInfo.name,
    mimeType: responseInfo.contentType.startsWith("image/")
      ? responseInfo.contentType
      : input.file.mimeType,
    expectedSize: responseInfo.contentLength,
    stream: res.body,
    skipIfExists: true,
  });
  const size = saved.size || responseInfo.contentLength;
  const warnings =
    size > LARGE_FILE_BYTES
      ? [`${responseInfo.name} lớn ${formatBytes(size)}, tải có thể lâu.`]
      : [];

  return {
    id: input.file.id,
    name: responseInfo.name,
    mimeType: responseInfo.contentType.startsWith("image/") ? responseInfo.contentType : "image/jpeg",
    size,
    url: saved.url,
    relativePath: saved.relativePath,
    skipped: saved.skipped,
    warnings,
  };
}

async function downloadDirectImageUrlToData(input: {
  url: string;
  fallbackName: string;
  sheetName?: string;
  entityName?: string;
}) {
  const fallbackFileName = directImageNameFromUrl(input.url, input.fallbackName);
  const existing = await getExistingDataImageFile({
    sheetName: input.sheetName,
    entityName: input.entityName,
    sourceId: input.url,
    fileName: fallbackFileName,
    mimeType: "image/jpeg",
  });
  if (existing) {
    return {
      id: input.url,
      name: fallbackFileName,
      mimeType: "image/jpeg",
      size: existing.size,
      url: existing.url,
      relativePath: existing.relativePath,
      skipped: true,
      warnings: [] as string[],
    };
  }

  let res: Response;
  try {
    res = await fetch(input.url, {
      headers: { Accept: "image/*,*/*" },
      redirect: "follow",
    });
  } catch (error) {
    throw classifyNetworkError(error);
  }

  if (res.status === 401 || res.status === 403) {
    await cancelBody(res);
    throw new DriveFetchError("Link ảnh cần quyền truy cập hoặc đang private.", "private");
  }
  if (res.status === 404) {
    await cancelBody(res);
    throw new DriveFetchError("Không tìm thấy ảnh từ link trong sheet.", "not_found");
  }
  if (res.status === 429) {
    await cancelBody(res);
    throw new DriveFetchError("Nguồn ảnh đang giới hạn tốc độ tải.", "throttle");
  }
  if (!res.ok) {
    await cancelBody(res);
    throw new DriveFetchError(`Link ảnh trả về ${res.status}.`, "unknown");
  }

  const responseInfo = ensureImageResponse(res, fallbackFileName);
  if (responseInfo.contentType.includes("text/html")) {
    throw await htmlResponseProblem(
      res,
      new DriveFetchError("Link trong sheet trả về HTML thay vì file ảnh.", "not_image"),
    );
  }
  if (!responseInfo.looksImage) {
    await cancelBody(res);
    throw new DriveFetchError(`${responseInfo.name} không phải file ảnh.`, "not_image");
  }
  if (!res.body) {
    throw new DriveFetchError(`${responseInfo.name} không có nội dung để tải.`, "unknown");
  }

  const saved = await saveDataImageStream({
    sheetName: input.sheetName,
    entityName: input.entityName,
    sourceId: input.url,
    fileName: responseInfo.name,
    mimeType: responseInfo.contentType.startsWith("image/") ? responseInfo.contentType : "image/jpeg",
    expectedSize: responseInfo.contentLength,
    stream: res.body,
    skipIfExists: true,
  });
  const size = saved.size || responseInfo.contentLength;
  const warnings =
    size > LARGE_FILE_BYTES
      ? [`${responseInfo.name} lớn ${formatBytes(size)}, tải có thể lâu.`]
      : [];

  return {
    id: input.url,
    name: responseInfo.name,
    mimeType: responseInfo.contentType.startsWith("image/") ? responseInfo.contentType : "image/jpeg",
    size,
    url: saved.url,
    relativePath: saved.relativePath,
    skipped: saved.skipped,
    warnings,
  };
}

async function cancelBody(res: Response) {
  try {
    await res.body?.cancel();
  } catch {
    // Nothing useful to do; the probe already has the status/header signal.
  }
}

async function readResponseSnippet(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < 4096) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk.slice(0, Math.max(0, Math.min(chunk.byteLength, received - offset))), offset);
    offset += chunk.byteLength;
    if (offset >= received) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function probeFile(id: string, fallbackName: string) {
  const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: { Accept: "image/*,*/*", Range: "bytes=0-4095" },
    redirect: "follow",
  });

  if (res.status === 401 || res.status === 403) {
    await cancelBody(res);
    throw new DriveFetchError("File Drive đang private hoặc cần quyền truy cập.", "private");
  }
  if (res.status === 404) {
    await cancelBody(res);
    throw new DriveFetchError("Không tìm thấy file Drive.", "not_found");
  }
  if (!res.ok && res.status !== 206) {
    await cancelBody(res);
    throw new DriveFetchError(`Google Drive file ${id} trả về ${res.status}.`, "unknown");
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const name = fileNameFromDisposition(res.headers.get("content-disposition")) || fallbackName || id;

  if (contentType.includes("text/html")) {
    const htmlProblem = classifyDriveHtml(await readResponseSnippet(res));
    throw (
      htmlProblem ??
      new DriveFetchError(
        "Drive trả về trang HTML thay vì ảnh. Kiểm tra lại quyền public của file.",
        "private",
      )
    );
  }

  const looksImage =
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream" ||
    IMAGE_EXT_RE.test(name);
  await cancelBody(res);
  if (!looksImage) throw new DriveFetchError(`${name} không phải file ảnh.`, "not_image");

  return { ok: true as const, kind: "file" as const };
}

async function probeDirectImageUrl(url: string) {
  const res = await fetch(url, {
    headers: { Accept: "image/*,*/*", Range: "bytes=0-4095" },
    redirect: "follow",
  });

  if (res.status === 401 || res.status === 403) {
    await cancelBody(res);
    throw new DriveFetchError("Link anh can quyen truy cap hoac dang private.", "private");
  }
  if (res.status === 404) {
    await cancelBody(res);
    throw new DriveFetchError("Khong tim thay anh tu link trong sheet.", "not_found");
  }
  if (!res.ok && res.status !== 206) {
    await cancelBody(res);
    throw new DriveFetchError(`Link anh tra ve ${res.status}.`, "unknown");
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "image");
  const looksImage =
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream" ||
    IMAGE_EXT_RE.test(name);
  await cancelBody(res);
  if (!looksImage) throw new DriveFetchError(`${name} khong phai file anh.`, "not_image");

  return { ok: true as const, kind: "file" as const };
}

function findMatchingEntries(
  entries: DriveEntry[],
  targetSlug: string,
  depth: number,
  path: string[],
): DriveSearchMatch[] {
  return entries.flatMap((entry) => {
    const score = scoreEntryMatch(entry, targetSlug);
    if (!score) return [];
    return [
      {
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        depth,
        path: [...path, entry.name],
        score,
      },
    ];
  });
}

function sortDriveMatches(matches: DriveSearchMatch[]) {
  return [...matches].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.path.join("/").localeCompare(b.path.join("/"));
  });
}

async function collectImageFilesFromFolder(
  folderId: string,
  maxFiles: number = Number.POSITIVE_INFINITY,
  remainingDepth: number,
  visited = new Set<string>(),
): Promise<DriveEntry[]> {
  if (visited.has(folderId) || maxFiles <= 0) return [];
  visited.add(folderId);

  const entries = await listFolderCached(folderId);
  const files = entries.filter((entry) => entry.kind === "file" && isImageEntry(entry));
  if (files.length >= maxFiles || remainingDepth <= 0) return files.slice(0, maxFiles);

  const collected = [...files];
  for (const folder of entries.filter((entry) => entry.kind === "folder")) {
    const nested = await collectImageFilesFromFolder(
      folder.id,
      maxFiles - collected.length,
      remainingDepth - 1,
      visited,
    );
    collected.push(...nested);
    if (collected.length >= maxFiles) break;
  }

  return collected;
}

async function selectUsableMatch(
  matches: DriveSearchMatch[],
  allowFolderWithoutImages: boolean,
): Promise<ResolvedDriveReference | null> {
  const sorted = sortDriveMatches(matches);
  let folderWithoutImages: DriveSearchMatch | null = null;

  for (const match of sorted) {
    if (match.kind === "file") return match;
    folderWithoutImages ??= match;
    const files = await collectImageFilesFromFolder(match.id, 1, MAX_NESTED_IMAGE_DEPTH);
    if (files.length > 0) return match;
  }

  return allowFolderWithoutImages ? folderWithoutImages : null;
}

async function findReferenceByScore(
  folderId: string,
  targetSlug: string,
  minScore: number,
  maxDepth: number,
  path: string[] = [],
  fallbackRef: { current: DriveSearchMatch | null },
): Promise<ResolvedDriveReference | null> {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number; path: string[] }> = [
    { id: folderId, depth: 0, path },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const entries = await listFolderCached(current.id);
    const matches = findMatchingEntries(entries, targetSlug, current.depth, current.path).filter(
      (match) => match.score >= minScore,
    );
    const usable = await selectUsableMatch(matches, false);
    if (usable) return usable;

    const fallback = sortDriveMatches(matches).find((match) => match.kind === "folder");
    if (!fallbackRef.current && fallback) fallbackRef.current = fallback;

    if (current.depth >= maxDepth) continue;
    for (const folder of entries.filter((entry) => entry.kind === "folder")) {
      queue.push({
        id: folder.id,
        depth: current.depth + 1,
        path: [...current.path, folder.name],
      });
    }
  }

  return null;
}

async function findReferenceInFolder(
  folderId: string,
  targetSlug: string,
  remainingDepth: number,
  visited = new Set<string>(),
  path: string[] = [],
): Promise<ResolvedDriveReference | null> {
  if (visited.has(folderId)) return null;
  visited.add(folderId);

  const fallbackRef: { current: DriveSearchMatch | null } = { current: null };
  const exactMatch = await findReferenceByScore(folderId, targetSlug, 90, remainingDepth, path, fallbackRef);
  if (exactMatch) return exactMatch;

  const fuzzyMatch = await findReferenceByScore(folderId, targetSlug, 45, remainingDepth, path, fallbackRef);
  return fuzzyMatch ?? fallbackRef.current;
}

async function findContextFolders(rootFolderId: string, searchContext?: string): Promise<DriveSearchMatch[]> {
  const contextSlug = slugify(searchContext ?? "");
  if (!contextSlug || contextSlug === "default" || /^sheet \d+$/.test(contextSlug)) return [];

  const entries = (await listFolderCached(rootFolderId)).filter((entry) => entry.kind === "folder");
  return sortDriveMatches(findMatchingEntries(entries, contextSlug, 0, []));
}

async function resolveReference(
  reference: string,
  rootFolderUrl?: string,
  searchContext?: string,
): Promise<ResolvedDriveReference | null> {
  if (looksLikeDirectImageUrl(reference)) {
    return { id: reference, kind: "file", name: reference.split("/").pop() };
  }

  const direct = extractId(reference);
  if (direct) return direct;

  if (looksLikeHttpUrl(reference)) {
    return { id: reference, kind: "file", name: reference.split("/").filter(Boolean).pop() };
  }

  const root = rootFolderUrl ? extractId(rootFolderUrl, "folder") : null;
  if (!root || root.kind !== "folder") return null;

  const targetSlug = slugify(reference);
  if (!targetSlug) return null;

  const contextFolders = await findContextFolders(root.id, searchContext);
  for (const contextFolder of contextFolders) {
    const contextMatch = await findReferenceInFolder(
      contextFolder.id,
      targetSlug,
      MAX_FOLDER_SEARCH_DEPTH,
      new Set<string>(),
      [contextFolder.name ?? ""].filter(Boolean),
    );
    if (contextMatch) return contextMatch;
  }

  return findReferenceInFolder(root.id, targetSlug, MAX_FOLDER_SEARCH_DEPTH);
}

export const checkDriveReferenceServer = createServerFn({ method: "POST" })
  .inputValidator(validateDriveInput)
  .handler(async ({ data }) => {
    try {
      const resolved = await resolveReference(data.reference, data.rootFolderUrl, data.searchContext);
      if (!resolved) {
        return {
          ok: false as const,
          error:
            "Không tìm thấy file/folder Drive. Nếu cột chỉ là tên folder, hãy cấu hình root folder Drive public.",
          errorCode: "not_found" as const,
        };
      }

      if (looksLikeHttpUrl(resolved.id)) {
        return await probeDirectImageUrl(resolved.id);
      }

      if (resolved.kind === "folder") {
        const files = await collectImageFilesFromFolder(resolved.id, 1, MAX_NESTED_IMAGE_DEPTH);
        if (files.length === 0) {
          return {
            ok: false as const,
            error: "Folder Drive không có file ảnh public đọc được.",
            errorCode: "not_found" as const,
          };
        }
        return { ok: true as const, kind: "folder" as const, imageCount: files.length };
      }

      return await probeFile(resolved.id, resolved.name ?? "drive-image");
    } catch (error) {
      const driveError =
        error instanceof DriveFetchError
          ? error
          : new DriveFetchError(error instanceof Error ? error.message : String(error));
      return {
        ok: false as const,
        error: driveError.message,
        errorCode: driveError.code,
      };
    }
  });

export const fetchDriveImagesServer = createServerFn({ method: "POST" })
  .inputValidator(validateDriveInput)
  .handler(async ({ data }) => {
    const maxFiles = Math.max(1, Math.min(data.maxFiles ?? DEFAULT_MAX_FILES, 50));

    try {
      const resolved = await resolveReference(data.reference, data.rootFolderUrl, data.searchContext);
      if (!resolved) {
        return {
          ok: false as const,
          error: "Không tìm thấy file/folder Drive. Nếu cột chỉ là tên folder, hãy cấu hình root folder Drive public.",
          errorCode: "not_found" as const,
        };
      }

      const files =
        resolved.kind === "folder"
          ? await collectImageFilesFromFolder(resolved.id, maxFiles + 1, MAX_NESTED_IMAGE_DEPTH)
          : [{ id: resolved.id, name: resolved.name ?? "drive-image", kind: "file" as const, mimeType: "image/*" }];

      if (files.length === 0) {
        return {
          ok: false as const,
          error: "Folder Drive không có file ảnh public đọc được.",
          errorCode: "not_found" as const,
        };
      }

      const filesToDownload = files.slice(0, maxFiles);
      const downloadResults = await mapWithConcurrency(filesToDownload, DRIVE_FILE_CONCURRENCY, async (file) => {
        try {
          return {
            ok: true as const,
            file: looksLikeHttpUrl(file.id)
              ? await downloadDirectImageUrl(file.id, file.name)
              : await downloadFile(file.id, file.name),
          };
        } catch (error) {
          const driveError =
            error instanceof DriveFetchError
              ? error
              : new DriveFetchError(error instanceof Error ? error.message : String(error));
          return {
            ok: false as const,
            error: { message: driveError.message, code: driveError.code },
          };
        }
      });
      const downloaded = downloadResults
        .filter((result): result is Extract<(typeof downloadResults)[number], { ok: true }> => result.ok)
        .map((result) => result.file);
      const errors = downloadResults
        .filter((result): result is Extract<(typeof downloadResults)[number], { ok: false }> => !result.ok)
        .map((result) => result.error);

      if (downloaded.length === 0) {
        const firstError = errors[0];
        return {
          ok: false as const,
          error: firstError?.message ?? "Không tải được ảnh Drive.",
          errorCode: firstError?.code ?? ("unknown" as const),
        };
      }

      return {
        ok: true as const,
        files: downloaded,
        skipped: Math.max(files.length - downloaded.length, 0),
        warnings: errors.map((error) => error.message),
      };
    } catch (error) {
      const driveError =
        error instanceof DriveFetchError
          ? error
          : new DriveFetchError(error instanceof Error ? error.message : String(error));
      return {
        ok: false as const,
        error: "Không tải được Drive: " + driveError.message,
        errorCode: driveError.code,
      };
    }
  });

export const fetchDriveImagesToDataServer = createServerFn({ method: "POST" })
  .inputValidator(validateDriveInput)
  .handler(async ({ data }) => {
    const maxFiles =
      typeof data.maxFiles === "number" && data.maxFiles > 0
        ? Math.min(data.maxFiles, MAX_STREAM_FILES_PER_REFERENCE)
        : MAX_STREAM_FILES_PER_REFERENCE;

    try {
      const resolved = await resolveReference(data.reference, data.rootFolderUrl, data.searchContext);
      if (!resolved) {
        return {
          ok: false as const,
          error: "Không tìm thấy file/folder Drive. Nếu cột chỉ là tên folder, hãy cấu hình root folder Drive public.",
          errorCode: "not_found" as const,
        };
      }

      const files =
        resolved.kind === "folder"
          ? await collectImageFilesFromFolder(resolved.id, maxFiles + 1, MAX_NESTED_IMAGE_DEPTH)
          : [{ id: resolved.id, name: resolved.name ?? "drive-image", kind: "file" as const, mimeType: "image/*" }];

      if (files.length === 0) {
        return {
          ok: false as const,
          error: "Folder Drive không có file ảnh public đọc được.",
          errorCode: "not_found" as const,
        };
      }

      const filesToDownload = files.slice(0, maxFiles);
      const downloadResults = await mapWithConcurrency(filesToDownload, STREAM_FILE_CONCURRENCY, async (file) => {
        try {
          return {
            ok: true as const,
            file: looksLikeHttpUrl(file.id)
              ? await downloadDirectImageUrlToData({
                  url: file.id,
                  fallbackName: file.name,
                  sheetName: data.searchContext,
                  entityName: data.entityName,
                })
              : await downloadDriveFileToData({
                  file,
                  sheetName: data.searchContext,
                  entityName: data.entityName,
                }),
          };
        } catch (error) {
          const driveError = classifyNetworkError(error);
          return {
            ok: false as const,
            error: { message: driveError.message, code: driveError.code },
          };
        }
      });

      const downloaded = downloadResults
        .filter((result): result is Extract<(typeof downloadResults)[number], { ok: true }> => result.ok)
        .map((result) => result.file);
      const errors = downloadResults
        .filter((result): result is Extract<(typeof downloadResults)[number], { ok: false }> => !result.ok)
        .map((result) => result.error);
      const downloadedBytes = downloaded
        .filter((file) => !file.skipped)
        .reduce((sum, file) => sum + (file.size || 0), 0);
      const skippedBytes = downloaded
        .filter((file) => file.skipped)
        .reduce((sum, file) => sum + (file.size || 0), 0);
      const skippedExisting = downloaded.filter((file) => file.skipped).length;
      const warnings = [
        ...downloaded.flatMap((file) => file.warnings),
        ...errors.map((error) => error.message),
      ];

      if (files.length > maxFiles) {
        warnings.unshift(`Folder có hơn ${maxFiles} ảnh. App đã dừng theo giới hạn ảnh/quán của lượt này.`);
      }

      if (downloaded.length === 0) {
        const firstError = errors[0];
        return {
          ok: false as const,
          error: firstError?.message ?? "Không tải được ảnh Drive.",
          errorCode: firstError?.code ?? ("unknown" as const),
        };
      }

      return {
        ok: true as const,
        files: downloaded.map(({ warnings: _warnings, ...file }) => file),
        skipped: Math.max(files.length - downloaded.length, 0),
        skippedExisting,
        downloadedBytes,
        skippedBytes,
        warnings,
      };
    } catch (error) {
      const driveError = classifyNetworkError(error);
      return {
        ok: false as const,
        error: "Không tải được Drive: " + driveError.message,
        errorCode: driveError.code,
      };
    }
  });
