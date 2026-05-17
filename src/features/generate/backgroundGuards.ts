import type { CanvasSize, DesignElement, PageTemplate, Slot } from "@/models";

/**
 * Heuristic "đây có phải slot ảnh do AI tạo làm cover background không?".
 * Slot này được templateFromImage tạo với:
 *  - kind: "image", bindingPath: "asset.cover"
 *  - name chứa "mood_background"
 *  - VÀ phủ gần hết canvas (>= 84% mỗi chiều, x/y <= 5% canvas)
 *  - HOẶC slot.isUploadedBackground = true
 *
 * Trước khi gom vào file này, predicate copy-paste 3 nơi (designDocument.ts,
 * EditorCanvas.tsx, PageRenderer.tsx) với cùng ngưỡng nhưng khác signature
 * (`canvas` vs `template.canvas`). Drift giữa các bản gây bug "cover render 2
 * lần" hoặc "không hiện cover khi đáng ra phải hiện".
 */
export function isGeneratedCoverBackgroundSlot(
  slot: Slot,
  canvas: CanvasSize,
): boolean {
  if (slot.kind !== "image" || slot.bindingPath !== "asset.cover") return false;
  const name = (slot.name ?? "").toLowerCase();
  const coversCanvas =
    slot.x <= canvas.width * 0.05 &&
    slot.y <= canvas.height * 0.05 &&
    slot.width >= canvas.width * 0.84 &&
    slot.height >= canvas.height * 0.84;
  return slot.isUploadedBackground || name.includes("mood_background") || coversCanvas;
}

/**
 * Convenience overload nhận `template: PageTemplate` thay vì canvas — phù hợp
 * cho callers như PageRenderer, EditorCanvas (đang có template trên scope).
 */
export function isGeneratedCoverBackgroundSlotFromTemplate(
  slot: Slot,
  template: PageTemplate,
): boolean {
  return isGeneratedCoverBackgroundSlot(slot, template.canvas);
}

/**
 * Slot overlay đi kèm cover background do AI tạo (mood_background_overlay)
 * — thường là shape phủ màu/gradient phía trên cover, dùng để dễ đọc text.
 */
export function isGeneratedBackgroundOverlaySlot(slot: Slot): boolean {
  return slot.kind === "shape" && slot.name === "mood_background_overlay";
}

/**
 * Phiên bản cho DesignElement (canvas mới của editor). Dùng meta.legacy để
 * detect isUploadedBackground vì nó được lưu trong legacy meta khi convert.
 */
export function shouldSuppressGeneratedCoverElementSrc(element: DesignElement): boolean {
  if (element.kind !== "image" && element.kind !== "shape") return false;
  const legacyMeta = (element.meta?.legacy ?? {}) as Record<string, unknown>;
  return (
    element.binding?.path === "asset.cover" &&
    (legacyMeta.isUploadedBackground === true ||
      (element.name ?? "").toLowerCase().includes("mood_background"))
  );
}

export function isGeneratedBackgroundOverlayElement(element: DesignElement): boolean {
  return element.kind === "shape" && element.name === "mood_background_overlay";
}

export function isLikelyGeneratePageBackgroundSlot(
  slot: Slot,
  template: PageTemplate | undefined,
): boolean {
  if (slot.isUploadedBackground) return true;
  if (!template) return false;
  if (slot.kind !== "image" && !(slot.kind === "shape" && !!slot.staticImage)) return false;

  const canvasWidth = Math.max(1, template.canvas.width);
  const canvasHeight = Math.max(1, template.canvas.height);
  const canvasArea = canvasWidth * canvasHeight;
  const slotWidth = Math.max(0, slot.width);
  const slotHeight = Math.max(0, slot.height);
  const slotArea = slotWidth * slotHeight;
  const pageInsetX = canvasWidth * 0.08;
  const pageInsetY = canvasHeight * 0.08;

  const nearlyFullBleed =
    slot.x <= pageInsetX &&
    slot.y <= pageInsetY &&
    slot.x + slotWidth >= canvasWidth - pageInsetX &&
    slot.y + slotHeight >= canvasHeight - pageInsetY &&
    slotWidth >= canvasWidth * 0.72 &&
    slotHeight >= canvasHeight * 0.72;
  const coversMostOfPage = slotArea >= canvasArea * 0.58;
  const backgroundName = normalizeBackgroundName(slot.name);

  return backgroundName && nearlyFullBleed && coversMostOfPage;
}

function normalizeBackgroundName(value: string | undefined): boolean {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    text.includes("background") ||
    text.includes("bg") ||
    text.includes("nen") ||
    text.includes("mood")
  );
}
