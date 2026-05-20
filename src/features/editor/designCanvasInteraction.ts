import type { PointerEvent as ReactPointerEvent } from "react";
import { applyTextRunStyle } from "./richText";
import type {
  DesignElement,
  DesignPage,
  DesignShapeElement,
  DesignTextElement,
  ElementStyle,
} from "@/models";

export type DesignTool = "select" | "pan" | "crop";

const TEXT_RUN_STYLE_KEYS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "color",
  "lineHeight",
  "letterSpacing",
  "textTransform",
] as const;
export type MovePayload = {
  elementId: string;
  moveIds: string[];
  originById: Record<string, { x: number; y: number }>;
  nextPrimaryX: number;
  nextPrimaryY: number;
};

export type SnapLine = { axis: "x" | "y"; value: number };

export type ResizePayload = {
  elementId: string;
  patch: Partial<DesignElement>;
  snapLines?: SnapLine[];
  snapTargetIds?: string[];
};

export type RafScheduler<T> = ((value: T) => void) & { cancel: () => void; flush: () => void };

export type PointerSessionHandlers = {
  onMove?: (event: PointerEvent) => void;
  onEnd?: (event: PointerEvent | Event) => void;
  onCancel?: (event: PointerEvent | Event) => void;
};

export function startPointerSession(event: ReactPointerEvent<HTMLElement>,
  { onMove, onEnd, onCancel }: PointerSessionHandlers,
) {
  const target = event.currentTarget;
  const pointerId = event.pointerId;
  let ended = false;

  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Pointer capture can fail if the browser already released the pointer.
  }

  const cleanup = () => {
    target.removeEventListener("pointermove", handleMove);
    target.removeEventListener("pointerup", handleEnd);
    target.removeEventListener("pointercancel", handleCancel);
    target.removeEventListener("lostpointercapture", handleCancel);
    window.removeEventListener("blur", handleCancel);
    window.removeEventListener("keydown", handleKeyDown);
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch {
      // Ignore release errors from already-cancelled pointer sessions.
    }
  };

  const finish = (handler: PointerSessionHandlers["onEnd"], nextEvent: PointerEvent | Event) => {
    if (ended) return;
    ended = true;
    cleanup();
    handler?.(nextEvent);
  };

  function handleMove(nextEvent: PointerEvent) {
    if (nextEvent.pointerId !== pointerId) return;
    onMove?.(nextEvent);
  }

  function handleEnd(nextEvent: PointerEvent) {
    if (nextEvent.pointerId !== pointerId) return;
    finish(onEnd, nextEvent);
  }

  function handleCancel(nextEvent: PointerEvent | Event) {
    if (nextEvent instanceof PointerEvent && nextEvent.pointerId !== pointerId) return;
    finish(onCancel ?? onEnd, nextEvent);
  }

  function handleKeyDown(nextEvent: KeyboardEvent) {
    if (nextEvent.key === "Escape") finish(onCancel ?? onEnd, nextEvent);
  }

  target.addEventListener("pointermove", handleMove);
  target.addEventListener("pointerup", handleEnd);
  target.addEventListener("pointercancel", handleCancel);
  target.addEventListener("lostpointercapture", handleCancel);
  window.addEventListener("blur", handleCancel);
  window.addEventListener("keydown", handleKeyDown);
}

export function createRafScheduler<T>(callback: (value: T) => void): RafScheduler<T> {
  let frame = 0;
  let latestValue: T | null = null;

  const schedule = ((value: T) => {
    latestValue = value;
    if (frame) return;

    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const nextValue = latestValue;
      latestValue = null;
      if (nextValue !== null) callback(nextValue);
    });
  }) as RafScheduler<T>;

  schedule.cancel = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    latestValue = null;
  };

  schedule.flush = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    const nextValue = latestValue;
    latestValue = null;
    if (nextValue !== null) callback(nextValue);
  };

  return schedule;
}

export function cssAttrValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function getPreviewNodes(canvas: HTMLElement | null, elementId: string) {
  if (!canvas) return [];
  const id = cssAttrValue(elementId);
  return Array.from(
    canvas.querySelectorAll<HTMLElement>(
      `[data-rendered-element-id="${id}"], [data-design-element-id="${id}"]`,
    ),
  );
}

export function getSelectionPreviewNodes(canvas: HTMLElement | null) {
  if (!canvas) return [];
  return Array.from(canvas.querySelectorAll<HTMLElement>("[data-selection-preview]"));
}

export type PreviewNodeCache = {
  elementNodes: Map<string, HTMLElement[]>;
  selectionNodes: HTMLElement[];
  selectionBoundsNode: HTMLElement | null;
};

export function createPreviewNodeCache(
  canvas: HTMLElement | null,
  elementIds: string[],
): PreviewNodeCache {
  return {
    elementNodes: new Map(elementIds.map((id) => [id, getPreviewNodes(canvas, id)])),
    selectionNodes: getSelectionPreviewNodes(canvas),
    selectionBoundsNode: canvas?.querySelector<HTMLElement>("[data-selection-bounds]") ?? null,
  };
}

export function markPreviewNode(node: HTMLElement, willChange: string) {
  node.dataset.previewing = "true";
  node.style.willChange = willChange;
}

export function resetPreviewMarkers(
  canvas: HTMLElement | null,
  options: { restoreTransform?: boolean } = {},
) {
  if (!canvas) return;
  canvas.querySelectorAll<HTMLElement>('[data-previewing="true"]').forEach((node) => {
    if (options.restoreTransform && "previewBaseTransform" in node.dataset) {
      node.style.transform = node.dataset.previewBaseTransform ?? "";
    }
    delete node.dataset.previewing;
    delete node.dataset.previewBaseTransform;
    node.style.willChange = "";
  });
}

export function applyMovePreview(
  canvas: HTMLElement | null,
  moveIds: string[],
  dx: number,
  dy: number,
  scale: number,
  cache?: PreviewNodeCache,
) {
  const translate = `translate3d(${dx * scale}px, ${dy * scale}px, 0)`;
  for (const elementId of moveIds) {
    for (const node of cache?.elementNodes.get(elementId) ?? getPreviewNodes(canvas, elementId)) {
      const baseTransform = node.dataset.previewBaseTransform ?? node.style.transform;
      node.dataset.previewBaseTransform = baseTransform;
      markPreviewNode(node, "transform");
      node.style.transform = `${translate} ${baseTransform}`.trim();
    }
  }

  for (const node of cache?.selectionNodes ?? getSelectionPreviewNodes(canvas)) {
    const baseTransform = node.dataset.previewBaseTransform ?? node.style.transform;
    node.dataset.previewBaseTransform = baseTransform;
    markPreviewNode(node, "transform");
    node.style.transform = `${translate} ${baseTransform}`.trim();
  }
}

export function applyResizePreview(
  canvas: HTMLElement | null,
  elementId: string,
  rect: { x?: number; y?: number; width?: number; height?: number },
  scale: number,
  updateSelectionBounds = true,
  cache?: PreviewNodeCache,
) {
  for (const node of cache?.elementNodes.get(elementId) ?? getPreviewNodes(canvas, elementId)) {
    markPreviewNode(node, "left, top, width, height");
    if (typeof rect.x === "number") node.style.left = `${rect.x * scale}px`;
    if (typeof rect.y === "number") node.style.top = `${rect.y * scale}px`;
    if (typeof rect.width === "number") node.style.width = `${rect.width * scale}px`;
    if (typeof rect.height === "number") node.style.height = `${rect.height * scale}px`;
  }

  const boundsNode = updateSelectionBounds
    ? (cache?.selectionBoundsNode ?? canvas?.querySelector<HTMLElement>("[data-selection-bounds]"))
    : null;
  if (boundsNode && typeof rect.x === "number" && typeof rect.y === "number") {
    markPreviewNode(boundsNode, "left, top, width, height");
    boundsNode.style.left = `${rect.x * scale - 6}px`;
    boundsNode.style.top = `${rect.y * scale - 6}px`;
    if (typeof rect.width === "number") boundsNode.style.width = `${rect.width * scale + 12}px`;
    if (typeof rect.height === "number") boundsNode.style.height = `${rect.height * scale + 12}px`;
  }
}

export function applyRotationPreview(
  canvas: HTMLElement | null,
  elementId: string,
  deltaDeg: number,
  cache?: PreviewNodeCache,
) {
  const rotate = `rotate(${deltaDeg}deg)`;
  for (const node of cache?.elementNodes.get(elementId) ?? getPreviewNodes(canvas, elementId)) {
    const baseTransform = node.dataset.previewBaseTransform ?? node.style.transform;
    node.dataset.previewBaseTransform = baseTransform;
    markPreviewNode(node, "transform");
    node.style.transform = `${rotate} ${baseTransform}`.trim();
  }
}

export function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function getCanvasPoint(
  canvas: HTMLElement | null,
  scale: number,
  clientX: number,
  clientY: number,
  panX = 0,
  panY = 0,
) {
  const rect = canvas?.getBoundingClientRect();
  return {
    x: (clientX - (rect?.left ?? 0) - panX) / scale,
    y: (clientY - (rect?.top ?? 0) - panY) / scale,
  };
}

export function normalizeMarqueeRect(start: { x: number; y: number }, current: { x: number; y: number }) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

export function snapRotation(rotation: number, event: { shiftKey: boolean }) {
  if (!event.shiftKey) return rotation;
  return Math.round(rotation / 15) * 15;
}

export function applyResizeModifiers(
  origin: { x: number; y: number; width: number; height: number },
  handle: string,
  dx: number,
  dy: number,
  keepAspect: boolean,
  fromCenter: boolean,
) {
  let nextX = origin.x;
  let nextY = origin.y;
  let nextWidth = origin.width;
  let nextHeight = origin.height;
  const aspectRatio = origin.width / Math.max(origin.height, 1);

  if (handle.includes("e")) nextWidth = Math.max(20, origin.width + dx);
  if (handle.includes("s")) nextHeight = Math.max(20, origin.height + dy);
  if (handle.includes("w")) {
    nextWidth = Math.max(20, origin.width - dx);
    nextX = origin.x + (origin.width - nextWidth);
  }
  if (handle.includes("n")) {
    nextHeight = Math.max(20, origin.height - dy);
    nextY = origin.y + (origin.height - nextHeight);
  }

  if (keepAspect && !handle.includes("n") && !handle.includes("s")) {
    nextHeight = Math.max(20, nextWidth / aspectRatio);
  } else if (keepAspect && !handle.includes("e") && !handle.includes("w")) {
    nextWidth = Math.max(20, nextHeight * aspectRatio);
  } else if (keepAspect) {
    const widthDrivenHeight = Math.max(20, nextWidth / aspectRatio);
    const heightDrivenWidth = Math.max(20, nextHeight * aspectRatio);
    if (Math.abs(widthDrivenHeight - nextHeight) <= Math.abs(heightDrivenWidth - nextWidth)) {
      nextHeight = widthDrivenHeight;
    } else {
      nextWidth = heightDrivenWidth;
    }
  }

  if (handle.includes("w") && keepAspect) {
    nextX = origin.x + (origin.width - nextWidth);
  }
  if (handle.includes("n") && keepAspect) {
    nextY = origin.y + (origin.height - nextHeight);
  }

  if (fromCenter) {
    nextX = origin.x - (nextWidth - origin.width) / 2;
    nextY = origin.y - (nextHeight - origin.height) / 2;
  }

  return {
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
  };
}

export function getSelectedElementsByIds(elements: DesignElement[], selectedIds: string[]) {
  return selectedIds
    .map((id) => elements.find((element) => element.elementId === id))
    .filter((element): element is DesignElement => !!element);
}

export function getMarqueeSelection(
  elements: DesignElement[],
  marquee: { x: number; y: number; width: number; height: number },
) {
  return elements
    .filter((element) => !element.hidden && !element.locked)
    .filter((element) =>
      rectsIntersect(marquee, {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      }),
    )
    .map((element) => element.elementId);
}

export function toggleSelectionIds(existing: string[], additions: string[]) {
  const next = new Set(existing);
  for (const id of additions) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return Array.from(next);
}

export function mergeSelectionIds(existing: string[], additions: string[]) {
  return Array.from(new Set([...existing, ...additions]));
}

export function getSelectionFromMarquee(
  existing: string[],
  additions: string[],
  additive: boolean,
  toggle: boolean,
) {
  if (toggle) return toggleSelectionIds(existing, additions);
  if (additive) return mergeSelectionIds(existing, additions);
  return additions;
}

export function formatZoom(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

export function getNextZoom(current: number, direction: 1 | -1) {
  const factor = direction > 0 ? 1.1 : 1 / 1.1;
  return Math.min(3, Math.max(0.1, current * factor));
}

export type StagePoint = { x: number; y: number };

export function getDesignCanvasElement(container: HTMLElement | null) {
  return container?.querySelector<HTMLElement>("[data-design-canvas]") ?? null;
}

export function getStageClientPoint(container: HTMLElement, point: StagePoint | null) {
  const rect = container.getBoundingClientRect();
  const x = point ? clamp(point.x, 0, rect.width) : rect.width / 2;
  const y = point ? clamp(point.y, 0, rect.height) : rect.height / 2;
  return {
    clientX: rect.left + x,
    clientY: rect.top + y,
  };
}

export function readCssPx(value: string) {
  return Number.parseFloat(value) || 0;
}

export function getStageContentBox(container: HTMLElement) {
  const styles = window.getComputedStyle(container);
  const paddingLeft = readCssPx(styles.paddingLeft);
  const paddingRight = readCssPx(styles.paddingRight);
  const paddingTop = readCssPx(styles.paddingTop);
  const paddingBottom = readCssPx(styles.paddingBottom);
  return {
    paddingLeft,
    paddingTop,
    contentWidth: Math.max(0, container.clientWidth - paddingLeft - paddingRight),
    contentHeight: Math.max(0, container.clientHeight - paddingTop - paddingBottom),
  };
}

export function getStageBaseOffset(page: DesignPage, container: HTMLElement, zoom: number) {
  const { paddingLeft, paddingTop, contentWidth, contentHeight } = getStageContentBox(container);
  const pageWidth = page.width * zoom;
  const pageHeight = page.height * zoom;
  return {
    x: paddingLeft + Math.max((contentWidth - pageWidth) / 2, 0),
    y: paddingTop + Math.max((contentHeight - pageHeight) / 2, 0),
  };
}

export function getZoomPanAtClientPoint(params: {
  container: HTMLElement;
  canvas: HTMLElement | null;
  page: DesignPage;
  currentZoom: number;
  nextZoom: number;
  panX: number;
  panY: number;
  clientX: number;
  clientY: number;
}) {
  const containerRect = params.container.getBoundingClientRect();
  const pointX = params.clientX - containerRect.left + params.container.scrollLeft;
  const pointY = params.clientY - containerRect.top + params.container.scrollTop;
  const canvasRect = params.canvas?.getBoundingClientRect();
  const currentBase = getStageBaseOffset(params.page, params.container, params.currentZoom);
  const contentX =
    canvasRect && params.currentZoom > 0
      ? (params.clientX - canvasRect.left) / params.currentZoom
      : (pointX - currentBase.x - params.panX) / params.currentZoom;
  const contentY =
    canvasRect && params.currentZoom > 0
      ? (params.clientY - canvasRect.top) / params.currentZoom
      : (pointY - currentBase.y - params.panY) / params.currentZoom;
  const nextBase = getStageBaseOffset(params.page, params.container, params.nextZoom);
  return {
    panX: pointX - nextBase.x - contentX * params.nextZoom,
    panY: pointY - nextBase.y - contentY * params.nextZoom,
  };
}

export function getFitPageZoom(page: DesignPage, container: HTMLElement, maxZoom: number) {
  const { contentWidth, contentHeight } = getStageContentBox(container);
  const margin = 96;
  const availW = Math.max(1, contentWidth - margin);
  const availH = Math.max(1, contentHeight - margin);
  return Math.min(maxZoom, 3, Math.max(0.1, Math.min(availW / page.width, availH / page.height)));
}

export function getCenteredPagePan(page: DesignPage, container: HTMLElement, zoom: number) {
  const { paddingLeft, paddingTop, contentWidth, contentHeight } = getStageContentBox(container);
  const pageWidth = page.width * zoom;
  const pageHeight = page.height * zoom;
  const baseX = paddingLeft + Math.max((contentWidth - pageWidth) / 2, 0);
  const baseY = paddingTop + Math.max((contentHeight - pageHeight) / 2, 0);
  return {
    panX: container.scrollLeft + paddingLeft + contentWidth / 2 - baseX - pageWidth / 2,
    panY: container.scrollTop + paddingTop + contentHeight / 2 - baseY - pageHeight / 2,
  };
}

export function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function isPanToolActive(tool: DesignTool, spacePressed: boolean) {
  return tool === "pan" || spacePressed;
}

export function getToolCursor(tool: DesignTool, spacePressed: boolean) {
  return isPanToolActive(tool, spacePressed) ? "grab" : "default";
}

export function getCanvasCursor(elementLocked: boolean, tool: DesignTool, spacePressed: boolean) {
  if (isPanToolActive(tool, spacePressed)) return "grab";
  return elementLocked ? "default" : "move";
}

export function pickTextRunStylePatch(patch: Partial<ElementStyle>): Partial<ElementStyle> {
  const picked: Record<string, unknown> = {};
  for (const key of TEXT_RUN_STYLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      picked[key] = patch[key];
    }
  }
  return picked as Partial<ElementStyle>;
}

export function buildElementStylePatch(
  element: DesignElement,
  patch: Partial<ElementStyle>,
): Partial<DesignElement> {
  const next: Partial<DesignElement> = {
    style: {
      ...(element.style ?? {}),
      ...patch,
    },
  } as Partial<DesignElement>;
  const textRunPatch = pickTextRunStylePatch(patch);
  if ((element.kind === "text" || element.kind === "shape") && Object.keys(textRunPatch).length) {
    const nextTextElement = next as Partial<DesignTextElement | DesignShapeElement>;
    const text = element.text ?? "";
    if (text.length > 0 && element.textRuns?.length) {
      nextTextElement.textRuns = applyTextRunStyle(
        text,
        element.textRuns,
        { start: 0, end: text.length },
        textRunPatch,
      );
    }
  }
  return next;
}

export const RESIZE_HANDLES = [
  { key: "nw", cursor: "nwse-resize", style: { left: -8, top: -8 } },
  { key: "n", cursor: "ns-resize", style: { left: "50%", top: -8, marginLeft: -8 } },
  { key: "ne", cursor: "nesw-resize", style: { right: -8, top: -8 } },
  { key: "e", cursor: "ew-resize", style: { right: -8, top: "50%", marginTop: -8 } },
  { key: "se", cursor: "nwse-resize", style: { right: -8, bottom: -8 } },
  { key: "s", cursor: "ns-resize", style: { left: "50%", bottom: -8, marginLeft: -8 } },
  { key: "sw", cursor: "nesw-resize", style: { left: -8, bottom: -8 } },
  { key: "w", cursor: "ew-resize", style: { left: -8, top: "50%", marginTop: -8 } },
] as const;

export function getSelectionBounds(elements: DesignElement[]) {
  if (elements.length === 0) return null;
  const minX = Math.min(...elements.map((element) => element.x));
  const minY = Math.min(...elements.map((element) => element.y));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  const maxY = Math.max(...elements.map((element) => element.y + element.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function getDescendantIds(elements: DesignElement[], parentId: string): string[] {
  const out = new Set<string>();
  const walk = (currentParentId: string) => {
    for (const element of elements) {
      if (element.parentId !== currentParentId || out.has(element.elementId)) continue;
      out.add(element.elementId);
      walk(element.elementId);
    }
  };
  walk(parentId);
  return Array.from(out);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getMoveTargets(selected: DesignElement[], allElements: DesignElement[] = selected): string[] {
  const ids = new Set<string>();
  for (const element of selected) {
    ids.add(element.elementId);
  }
  for (const element of selected) {
    if (element.kind !== "group") continue;
    getDescendantIds(allElements, element.elementId).forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

export function snapMove(
  page: DesignPage,
  element: DesignElement,
  x: number,
  y: number,
  otherElements: DesignElement[],
  scale: number,
) {
  const threshold = Math.max(6, 12 / Math.max(scale, 0.1));
  const snapLines: SnapLine[] = [];
  const snapTargetIds = new Set<string>();
  let nextX = x;
  let nextY = y;
  const safe = page.safeZone;

  const evaluateAxis = (
    candidates: Array<{ position: number; lineValue: number }>,
    targets: Array<{ position: number; lineValue: number; elementId?: string }>,
    axis: "x" | "y",
  ) => {
    let best:
      | {
          delta: number;
          lineValue: number;
          elementId?: string;
        }
      | undefined;

    for (const candidate of candidates) {
      for (const target of targets) {
        const delta = target.position - candidate.position;
        if (Math.abs(delta) > threshold) continue;
        if (!best || Math.abs(delta) < Math.abs(best.delta)) {
          best = { delta, lineValue: target.lineValue, elementId: target.elementId };
        }
      }
    }

    if (!best) return;
    if (axis === "x") nextX += best.delta;
    if (axis === "y") nextY += best.delta;
    snapLines.push({ axis, value: best.lineValue });
    if (best.elementId) snapTargetIds.add(best.elementId);
  };

  const xCandidates = [
    { position: nextX, lineValue: nextX },
    { position: nextX + element.width / 2, lineValue: nextX + element.width / 2 },
    { position: nextX + element.width, lineValue: nextX + element.width },
  ];
  const yCandidates = [
    { position: nextY, lineValue: nextY },
    { position: nextY + element.height / 2, lineValue: nextY + element.height / 2 },
    { position: nextY + element.height, lineValue: nextY + element.height },
  ];
  const xTargets: Array<{ position: number; lineValue: number; elementId?: string }> = [
    { position: 0, lineValue: 0 },
    { position: page.width / 2, lineValue: page.width / 2 },
    { position: page.width, lineValue: page.width },
  ];
  const yTargets: Array<{ position: number; lineValue: number; elementId?: string }> = [
    { position: 0, lineValue: 0 },
    { position: page.height / 2, lineValue: page.height / 2 },
    { position: page.height, lineValue: page.height },
  ];

  for (const other of otherElements) {
    xTargets.push(
      { position: other.x, lineValue: other.x, elementId: other.elementId },
      {
        position: other.x + other.width / 2,
        lineValue: other.x + other.width / 2,
        elementId: other.elementId,
      },
      {
        position: other.x + other.width,
        lineValue: other.x + other.width,
        elementId: other.elementId,
      },
    );
    yTargets.push(
      { position: other.y, lineValue: other.y, elementId: other.elementId },
      {
        position: other.y + other.height / 2,
        lineValue: other.y + other.height / 2,
        elementId: other.elementId,
      },
      {
        position: other.y + other.height,
        lineValue: other.y + other.height,
        elementId: other.elementId,
      },
    );
  }

  if (safe) {
    xTargets.push(
      { position: safe.left, lineValue: safe.left },
      { position: page.width - safe.right, lineValue: page.width - safe.right },
    );
    yTargets.push(
      { position: safe.top, lineValue: safe.top },
      { position: page.height - safe.bottom, lineValue: page.height - safe.bottom },
    );
  }

  evaluateAxis(xCandidates, xTargets, "x");
  evaluateAxis(yCandidates, yTargets, "y");

  return { x: nextX, y: nextY, snapLines, snapTargetIds: Array.from(snapTargetIds) };
}

export function snapResize(
  page: DesignPage,
  elementId: string,
  handle: string,
  rect: { x: number; y: number; width: number; height: number },
  otherElements: DesignElement[],
  scale: number,
) {
  const threshold = Math.max(6, 12 / Math.max(scale, 0.1));
  const snapLines: SnapLine[] = [];
  const snapTargetIds = new Set<string>();
  const next = { ...rect };

  const xTargets: Array<{ position: number; lineValue: number; elementId?: string }> = [
    { position: 0, lineValue: 0 },
    { position: page.width / 2, lineValue: page.width / 2 },
    { position: page.width, lineValue: page.width },
  ];
  const yTargets: Array<{ position: number; lineValue: number; elementId?: string }> = [
    { position: 0, lineValue: 0 },
    { position: page.height / 2, lineValue: page.height / 2 },
    { position: page.height, lineValue: page.height },
  ];

  for (const other of otherElements) {
    xTargets.push(
      { position: other.x, lineValue: other.x, elementId: other.elementId },
      {
        position: other.x + other.width / 2,
        lineValue: other.x + other.width / 2,
        elementId: other.elementId,
      },
      {
        position: other.x + other.width,
        lineValue: other.x + other.width,
        elementId: other.elementId,
      },
    );
    yTargets.push(
      { position: other.y, lineValue: other.y, elementId: other.elementId },
      {
        position: other.y + other.height / 2,
        lineValue: other.y + other.height / 2,
        elementId: other.elementId,
      },
      {
        position: other.y + other.height,
        lineValue: other.y + other.height,
        elementId: other.elementId,
      },
    );
  }

  if (page.safeZone) {
    xTargets.push(
      { position: page.safeZone.left, lineValue: page.safeZone.left },
      {
        position: page.width - page.safeZone.right,
        lineValue: page.width - page.safeZone.right,
      },
    );
    yTargets.push(
      { position: page.safeZone.top, lineValue: page.safeZone.top },
      {
        position: page.height - page.safeZone.bottom,
        lineValue: page.height - page.safeZone.bottom,
      },
    );
  }

  const pickClosest = (
    candidate: number,
    targets: Array<{ position: number; lineValue: number; elementId?: string }>,
  ) => {
    let best:
      | {
          delta: number;
          lineValue: number;
          elementId?: string;
        }
      | undefined;
    for (const target of targets) {
      const delta = target.position - candidate;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, lineValue: target.lineValue, elementId: target.elementId };
      }
    }
    return best;
  };

  if (handle.includes("e")) {
    const best = pickClosest(next.x + next.width, xTargets);
    if (best) {
      next.width = Math.max(20, next.width + best.delta);
      snapLines.push({ axis: "x", value: best.lineValue });
      if (best.elementId) snapTargetIds.add(best.elementId);
    }
  }
  if (handle.includes("w")) {
    const best = pickClosest(next.x, xTargets);
    if (best) {
      next.x += best.delta;
      next.width = Math.max(20, rect.x + rect.width - next.x);
      snapLines.push({ axis: "x", value: best.lineValue });
      if (best.elementId) snapTargetIds.add(best.elementId);
    }
  }
  if (handle.includes("s")) {
    const best = pickClosest(next.y + next.height, yTargets);
    if (best) {
      next.height = Math.max(20, next.height + best.delta);
      snapLines.push({ axis: "y", value: best.lineValue });
      if (best.elementId) snapTargetIds.add(best.elementId);
    }
  }
  if (handle.includes("n")) {
    const best = pickClosest(next.y, yTargets);
    if (best) {
      next.y += best.delta;
      next.height = Math.max(20, rect.y + rect.height - next.y);
      snapLines.push({ axis: "y", value: best.lineValue });
      if (best.elementId) snapTargetIds.add(best.elementId);
    }
  }

  return {
    x: Math.round(next.x),
    y: Math.round(next.y),
    width: Math.round(next.width),
    height: Math.round(next.height),
    snapLines,
    snapTargetIds: Array.from(snapTargetIds),
  };
}
