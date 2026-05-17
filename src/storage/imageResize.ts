// Client-side image downscaler used before uploading to backend.
//
// Goals:
//   • Cap the longest edge at MAX_EDGE (default 3000px) so backend blobs
//     stay reasonable size while preserving sharpness for poster generation.
//   • Skip re-encoding small images (<8MB) to avoid unnecessary quality loss.
//   • Use createImageBitmap + OffscreenCanvas when available (modern browsers)
//     for 2-3x faster decode and non-blocking UI; fallback to HTMLImageElement
//     + HTMLCanvasElement.
//   • Fail soft: if something goes wrong we return the original File/Blob.

// 3000px = 4K vừa đủ cho poster A3/A4 in 300dpi, vẫn sắc nét. Tăng từ 2400.
const DEFAULT_MAX_EDGE = 3000;
// Chỉ resize ảnh > 8MB (raw camera). Ảnh phone HEIC/JPEG ~2-5MB skip hết
// để giữ nét tối đa. Backend filesystem không có size limit strict.
const DEFAULT_REENCODE_THRESHOLD_BYTES = 8_000_000;
// 0.95 thay 0.92 -> chỉ tăng size ~10% nhưng giảm artifact JPEG đáng kể.
const DEFAULT_JPEG_QUALITY = 0.95;

const RESIZABLE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

type ResizeOptions = {
  maxEdge?: number;
  reencodeThresholdBytes?: number;
  jpegQuality?: number;
};

function resolveOutputMime(input: string | undefined, fallback: string): string {
  if (!input) return fallback;
  const lower = input.toLowerCase();
  if (lower === "image/png" || lower === "image/webp") return lower;
  return "image/jpeg";
}

function hasOffscreenCanvas(): boolean {
  return typeof window !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

function hasCreateImageBitmap(): boolean {
  return typeof createImageBitmap === "function";
}

/**
 * Decode ảnh bằng `createImageBitmap` (modern, async, không block UI).
 * Trả về { bitmap, width, height } — caller phải gọi `bitmap.close()` để giải phóng.
 */
async function decodeFast(blob: Blob): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

/** Fallback decode dùng HTMLImageElement (older browsers). */
function decodeLegacy(blob: Blob): Promise<{ image: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        image: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh để resize"));
    };
    img.src = url;
  });
}

/** Convert OffscreenCanvas -> Blob (modern, non-blocking). */
function offscreenToBlob(
  canvas: OffscreenCanvas,
  mime: string,
  quality: number,
): Promise<Blob> {
  return canvas.convertToBlob({
    type: mime,
    quality: mime === "image/png" ? undefined : quality,
  });
}

/** Convert HTMLCanvasElement -> Blob (fallback). */
function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas.toBlob trả về null"));
      },
      mime,
      mime === "image/png" ? undefined : quality,
    );
  });
}

/**
 * Downscale ảnh nếu (a) size > threshold HOẶC (b) longest edge > maxEdge.
 *
 * Trả về Blob gốc nếu không cần resize hoặc resize fail.
 *
 * Ảnh nhỏ (<8MB) ALWAYS được giữ nguyên không decode/encode lại — nét tối đa.
 */
export async function resizeImageBlob(input: File | Blob, options: ResizeOptions = {}): Promise<Blob> {
  if (typeof window === "undefined" || typeof document === "undefined") return input;

  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const threshold = options.reencodeThresholdBytes ?? DEFAULT_REENCODE_THRESHOLD_BYTES;
  const quality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;

  const mime = input.type?.toLowerCase();
  if (!mime || !RESIZABLE_MIME.has(mime)) return input;

  // Fast path: ảnh đã nhỏ -> giữ nguyên gốc, không decode, không re-encode.
  // Đảm bảo không mất nét cho hầu hết ảnh phone (~2-5MB).
  if (input.size <= threshold) return input;

  try {
    // Decode: ưu tiên createImageBitmap (browser modern, ~2-3x nhanh hơn
    // HTMLImageElement vì decode trên thread riêng + không qua DOM).
    let width: number;
    let height: number;
    let bitmap: ImageBitmap | null = null;
    let legacyImage: HTMLImageElement | null = null;

    if (hasCreateImageBitmap()) {
      const decoded = await decodeFast(input);
      bitmap = decoded.bitmap;
      width = decoded.width;
      height = decoded.height;
    } else {
      const decoded = await decodeLegacy(input);
      legacyImage = decoded.image;
      width = decoded.width;
      height = decoded.height;
    }

    if (!width || !height) {
      bitmap?.close();
      return input;
    }

    const natural = Math.max(width, height);
    const scale = natural > maxEdge ? maxEdge / natural : 1;

    // Nếu cả 2 điều kiện đều không bắt buộc resize (size đã pass threshold
    // nhưng dimension vẫn ≤ maxEdge), nén nhẹ với quality cao để giảm size
    // mà giữ chi tiết. Trường hợp này hiếm: ảnh PNG to (10MB) nhưng pixel ít.
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    // Modern path: OffscreenCanvas. Render trên thread riêng, không block.
    if (hasOffscreenCanvas() && bitmap) {
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return input;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();
      const outMime = resolveOutputMime(mime, "image/jpeg");
      const encoded = await offscreenToBlob(canvas, outMime, quality);
      // Chỉ keep nếu thực sự nhỏ hơn (tránh PNG -> PNG bị bloat).
      if (encoded.size >= input.size && scale === 1) return input;
      return encoded;
    }

    // Legacy path: HTMLCanvasElement.
    const source = bitmap ?? legacyImage;
    if (!source) return input;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap?.close();
      return input;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight);
    bitmap?.close();
    const outMime = resolveOutputMime(mime, "image/jpeg");
    const encoded = await canvasToBlob(canvas, outMime, quality);
    if (encoded.size >= input.size && scale === 1) return input;
    return encoded;
  } catch (err) {
    console.warn(
      "[resizeImageBlob] fallback to original blob:",
      err instanceof Error ? err.message : err,
    );
    return input;
  }
}
