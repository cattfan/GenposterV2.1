import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

const DATA_IMAGES_ROUTE = "/data-images";
const DATA_IMAGES_ROOT = path.resolve(process.cwd(), "data", "images");

const MIME_BY_EXT: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jfif": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

interface SaveDataImageInput {
  sheetName?: string;
  entityName?: string;
  sourceId?: string;
  fileName?: string;
  mimeType?: string;
  buffer: ArrayBuffer | Uint8Array | Buffer;
}

interface DataImageTargetInput {
  sheetName?: string;
  entityName?: string;
  sourceId?: string;
  fileName?: string;
  mimeType?: string;
}

interface SaveDataImageStreamInput extends DataImageTargetInput {
  stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  expectedSize?: number;
  skipIfExists?: boolean;
}

type MiddlewareRequest = {
  method?: string;
  url?: string;
};

type MiddlewareResponse = {
  statusCode: number;
  setHeader(name: string, value: string | number): void;
  end(body?: Buffer | string): void;
};

type MiddlewareNext = () => void;

function stripDiacritics(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function safeSegment(value: string | undefined, fallback: string) {
  const segment = stripDiacritics(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  return segment || fallback;
}

function safeFileName(fileName: string | undefined, mimeType: string | undefined, sourceId: string | undefined) {
  const extFromName = path.extname(fileName || "").toLowerCase();
  const ext = MIME_BY_EXT[extFromName] ? extFromName : EXT_BY_MIME[(mimeType || "").toLowerCase()] ?? ".jpg";
  const baseName = fileName ? path.basename(fileName, path.extname(fileName)) : "image";
  const base = safeSegment(baseName, "image").slice(0, 80);
  const suffix = sourceId ? safeSegment(sourceId, stableHash(sourceId)).slice(0, 24) : "";

  return `${base}${suffix ? `-${suffix}` : ""}${ext}`;
}

function assertInsideRoot(targetPath: string) {
  const relative = path.relative(DATA_IMAGES_ROOT, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Duong dan anh nam ngoai thu muc data/images.");
  }
}

function bufferFromInput(input: ArrayBuffer | Uint8Array | Buffer) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  return Buffer.from(input);
}

function encodeRouteSegment(segment: string) {
  return encodeURIComponent(segment);
}

function toNodeReadable(stream: SaveDataImageStreamInput["stream"]) {
  if ("getReader" in stream) {
    return Readable.fromWeb(stream as unknown as NodeReadableStream);
  }
  return stream;
}

async function statFile(filePath: string) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? fileStat : null;
  } catch {
    return null;
  }
}

export function getDataImageRoot() {
  return DATA_IMAGES_ROOT;
}

export function getDataImageFileInfo(input: DataImageTargetInput) {
  const sheetSegment = safeSegment(input.sheetName, "default");
  const entitySegment = safeSegment(input.entityName, "unknown");
  const fileName = safeFileName(input.fileName, input.mimeType, input.sourceId);
  const directory = path.resolve(DATA_IMAGES_ROOT, sheetSegment, entitySegment);
  const absolutePath = path.resolve(directory, fileName);

  assertInsideRoot(directory);
  assertInsideRoot(absolutePath);
  const relativePath = path.relative(DATA_IMAGES_ROOT, absolutePath).split(path.sep).join("/");
  const url = [
    DATA_IMAGES_ROUTE,
    encodeRouteSegment(sheetSegment),
    encodeRouteSegment(entitySegment),
    encodeRouteSegment(fileName),
  ].join("/");

  return {
    absolutePath,
    directory,
    fileName,
    relativePath,
    url,
  };
}

export async function getExistingDataImageFile(input: DataImageTargetInput) {
  const target = getDataImageFileInfo(input);
  const existing = await statFile(target.absolutePath);
  return existing
    ? {
        ...target,
        size: existing.size,
      }
    : null;
}

export async function saveDataImageFile(input: SaveDataImageInput) {
  const target = getDataImageFileInfo(input);

  await mkdir(target.directory, { recursive: true });
  const buffer = bufferFromInput(input.buffer);
  await writeFile(target.absolutePath, buffer);

  return {
    absolutePath: target.absolutePath,
    relativePath: target.relativePath,
    url: target.url,
    skipped: false,
    size: buffer.byteLength,
  };
}

export async function saveDataImageStream(input: SaveDataImageStreamInput) {
  const target = getDataImageFileInfo(input);
  const existing = await statFile(target.absolutePath);
  if (
    input.skipIfExists &&
    existing &&
    (!input.expectedSize || existing.size === input.expectedSize)
  ) {
    return {
      absolutePath: target.absolutePath,
      relativePath: target.relativePath,
      url: target.url,
      skipped: true,
      size: existing.size,
    };
  }

  await mkdir(target.directory, { recursive: true });
  const tempPath = `${target.absolutePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await pipeline(toNodeReadable(input.stream), createWriteStream(tempPath));
    await rename(tempPath, target.absolutePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }

  const saved = await statFile(target.absolutePath);
  return {
    absolutePath: target.absolutePath,
    relativePath: target.relativePath,
    url: target.url,
    skipped: false,
    size: saved?.size ?? input.expectedSize ?? 0,
  };
}

function contentTypeForPath(filePath: string) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function readDataImage(pathname: string) {
  const routeRelative = decodeURIComponent(pathname.replace(new RegExp(`^${DATA_IMAGES_ROUTE}/?`), ""));
  if (!routeRelative || routeRelative.includes("\0")) return null;

  const absolutePath = path.resolve(DATA_IMAGES_ROOT, routeRelative);
  assertInsideRoot(absolutePath);

  try {
    const buffer = await readFile(absolutePath);
    return {
      buffer,
      contentType: contentTypeForPath(absolutePath),
    };
  } catch {
    return null;
  }
}

export function createDataImagesMiddleware() {
  return async (req: MiddlewareRequest, res: MiddlewareResponse, next: MiddlewareNext) => {
    const rawUrl = req.url || "";
    const pathname = new URL(rawUrl, "http://local").pathname;
    if (!pathname.startsWith(`${DATA_IMAGES_ROUTE}/`)) {
      next();
      return;
    }

    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end("Method Not Allowed");
      return;
    }

    let image: Awaited<ReturnType<typeof readDataImage>>;
    try {
      image = await readDataImage(pathname);
    } catch {
      image = null;
    }

    if (!image) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", image.buffer.byteLength);
    res.end(req.method === "HEAD" ? undefined : image.buffer);
  };
}
