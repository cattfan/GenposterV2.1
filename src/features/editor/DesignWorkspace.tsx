import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlignCenter,
  AlignEndHorizontal,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  FlipHorizontal,
  FlipVertical,
  AlignVerticalJustifyCenter,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  Frame,
  Grid2X2,
  Group,
  Hand,
  Image as ImageIcon,
  Info,
  Layers,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  MoveDown,
  MoveUp,
  PanelLeft,
  PanelRight,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  Shapes,
  Table2,
  Trash2,
  Type,
  Ungroup,
  Upload,
  Undo2,
  Redo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildTextStyle } from "@/engines/binding/dataBinding";
import { LayoutGuides } from "@/features/render/LayoutGuides";
import { PageRenderer } from "@/features/render/PageRenderer";
import { db, saveBlob } from "@/storage/db";
import { makeIdbSrc, resolveImageSrcAsync } from "@/storage/imageSrc";
import type {
  AssetItem,
  BrandKit,
  DesignDocument,
  DesignElement,
  DesignPage,
  DesignTextElement,
  EditorMode,
  ElementStyle,
  FontAsset,
  ImageCrop,
  PageTemplate,
} from "@/models";
import { DesignRenderer } from "./DesignRenderer";
import { FONTS } from "./fonts";
import {
  getBuiltInIconSvg,
  getBuiltInAssetLibrary,
  isHeroiconAsset,
  loadExtendedIconLibrary,
  normalizeIconSearch,
  type HeroiconAsset,
} from "./designAssets";
import { useDesignEditor } from "./designStore";
import { TextToolbar } from "./TextToolbar";
import { CropOverlay } from "./CropOverlay";
import { CanvasRuler } from "./CanvasRuler";
import { SmartSpacing, computeSpacingLines } from "./SmartSpacing";
import { ColorPicker } from "./ColorPicker";

type WorkspaceMode = EditorMode;
type AssetPanelItem = AssetItem | HeroiconAsset;
type DesignTool = "select" | "pan" | "crop";
type IconVariantFilter = "all" | HeroiconAsset["styleGroup"];
const EMPTY_ASSETS: AssetItem[] = [];
const EMPTY_BRAND_KITS: BrandKit[] = [];
const EMPTY_FONT_ASSETS: FontAsset[] = [];
const EMPTY_PAGE_TEMPLATES: PageTemplate[] = [];
const AUTOSAVE_DELAY_MS = 500;
const ICON_PICKER_RESULT_LIMIT = 360;

type MovePayload = {
  elementId: string;
  moveIds: string[];
  originById: Record<string, { x: number; y: number }>;
  nextPrimaryX: number;
  nextPrimaryY: number;
};

type SnapLine = { axis: "x" | "y"; value: number };

type ResizePayload = {
  elementId: string;
  patch: Partial<DesignElement>;
  snapLines?: SnapLine[];
  snapTargetIds?: string[];
};

type RafScheduler<T> = ((value: T) => void) & { cancel: () => void; flush: () => void };

function createRafScheduler<T>(callback: (value: T) => void): RafScheduler<T> {
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

function cssAttrValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getPreviewNodes(canvas: HTMLElement | null, elementId: string) {
  if (!canvas) return [];
  const id = cssAttrValue(elementId);
  return Array.from(
    canvas.querySelectorAll<HTMLElement>(
      `[data-rendered-element-id="${id}"], [data-design-element-id="${id}"]`,
    ),
  );
}

function getSelectionPreviewNodes(canvas: HTMLElement | null) {
  if (!canvas) return [];
  return Array.from(canvas.querySelectorAll<HTMLElement>("[data-selection-preview]"));
}

type PreviewNodeCache = {
  elementNodes: Map<string, HTMLElement[]>;
  selectionNodes: HTMLElement[];
  selectionBoundsNode: HTMLElement | null;
};

function createPreviewNodeCache(
  canvas: HTMLElement | null,
  elementIds: string[],
): PreviewNodeCache {
  return {
    elementNodes: new Map(elementIds.map((id) => [id, getPreviewNodes(canvas, id)])),
    selectionNodes: getSelectionPreviewNodes(canvas),
    selectionBoundsNode: canvas?.querySelector<HTMLElement>("[data-selection-bounds]") ?? null,
  };
}

function markPreviewNode(node: HTMLElement, willChange: string) {
  node.dataset.previewing = "true";
  node.style.willChange = willChange;
}

function resetPreviewMarkers(
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

function applyMovePreview(
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

function applyResizePreview(
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

function applyRotationPreview(
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

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getCanvasPoint(
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

function normalizeMarqueeRect(start: { x: number; y: number }, current: { x: number; y: number }) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function snapRotation(rotation: number, event: { shiftKey: boolean }) {
  if (!event.shiftKey) return rotation;
  return Math.round(rotation / 15) * 15;
}

function applyResizeModifiers(
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

function getSelectedElementsByIds(elements: DesignElement[], selectedIds: string[]) {
  return selectedIds
    .map((id) => elements.find((element) => element.elementId === id))
    .filter((element): element is DesignElement => !!element);
}

function getMarqueeSelection(
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

function toggleSelectionIds(existing: string[], additions: string[]) {
  const next = new Set(existing);
  for (const id of additions) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return Array.from(next);
}

function mergeSelectionIds(existing: string[], additions: string[]) {
  return Array.from(new Set([...existing, ...additions]));
}

function getSelectionFromMarquee(
  existing: string[],
  additions: string[],
  additive: boolean,
  toggle: boolean,
) {
  if (toggle) return toggleSelectionIds(existing, additions);
  if (additive) return mergeSelectionIds(existing, additions);
  return additions;
}

function formatZoom(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

function getNextZoom(current: number, direction: 1 | -1) {
  const factor = direction > 0 ? 1.1 : 1 / 1.1;
  return Math.min(3, Math.max(0.1, current * factor));
}

function zoomAtPoint(params: {
  currentZoom: number;
  nextZoom: number;
  panX: number;
  panY: number;
  pointX: number;
  pointY: number;
}) {
  const contentX = (params.pointX - params.panX) / params.currentZoom;
  const contentY = (params.pointY - params.panY) / params.currentZoom;
  return {
    panX: params.pointX - contentX * params.nextZoom,
    panY: params.pointY - contentY * params.nextZoom,
  };
}

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function isPanToolActive(tool: DesignTool, spacePressed: boolean) {
  return tool === "pan" || spacePressed;
}

function getToolCursor(tool: DesignTool, spacePressed: boolean) {
  return isPanToolActive(tool, spacePressed) ? "grab" : "default";
}

function getCanvasCursor(elementLocked: boolean, tool: DesignTool, spacePressed: boolean) {
  if (isPanToolActive(tool, spacePressed)) return "grab";
  return elementLocked ? "default" : "move";
}

function zoomByStep(editor: ReturnType<typeof useDesignEditor>, zoom: number, direction: 1 | -1) {
  editor.setZoom(getNextZoom(zoom, direction));
}

function zoomToFit(editor: ReturnType<typeof useDesignEditor>, container: HTMLElement | null) {
  const page = editor.activePage;
  if (!page || !container) return;
  const rect = container.getBoundingClientRect();
  const padding = 48;
  const availW = rect.width - padding * 2;
  const availH = rect.height - padding * 2;
  if (availW <= 0 || availH <= 0) return;
  const scale = Math.min(availW / page.width, availH / page.height, 3);
  const panX = (rect.width - page.width * scale) / 2;
  const panY = (rect.height - page.height * scale) / 2;
  editor.setZoom(scale);
  editor.setPan(panX, panY);
}

const RESIZE_HANDLES = [
  { key: "nw", cursor: "nwse-resize", style: { left: -8, top: -8 } },
  { key: "n", cursor: "ns-resize", style: { left: "50%", top: -8, marginLeft: -8 } },
  { key: "ne", cursor: "nesw-resize", style: { right: -8, top: -8 } },
  { key: "e", cursor: "ew-resize", style: { right: -8, top: "50%", marginTop: -8 } },
  { key: "se", cursor: "nwse-resize", style: { right: -8, bottom: -8 } },
  { key: "s", cursor: "ns-resize", style: { left: "50%", bottom: -8, marginLeft: -8 } },
  { key: "sw", cursor: "nesw-resize", style: { left: -8, bottom: -8 } },
  { key: "w", cursor: "ew-resize", style: { left: -8, top: "50%", marginTop: -8 } },
] as const;

function getSelectionBounds(elements: DesignElement[]) {
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

function getDescendantIds(elements: DesignElement[], parentId: string): string[] {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMoveTargets(selected: DesignElement[]): string[] {
  const ids = new Set<string>();
  for (const element of selected) {
    ids.add(element.elementId);
  }
  for (const element of selected) {
    if (element.kind !== "group") continue;
    getDescendantIds(selected, element.elementId).forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

function snapMove(
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

function snapResize(
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

async function registerFontAsset(fontAsset: FontAsset) {
  const src = await resolveImageSrcAsync(fontAsset.sourceValue);
  const usableSrc = src ?? fontAsset.sourceValue;
  if (!usableSrc) return;
  const font = new FontFace(fontAsset.family, `url(${usableSrc})`, {
    style: fontAsset.style ?? "normal",
    weight: String(fontAsset.weight ?? 400),
  });
  await font.load();
  document.fonts.add(font);
}

function layerTree(
  elements: DesignElement[],
  parentId?: string,
  depth = 0,
): Array<{ element: DesignElement; depth: number }> {
  return elements
    .filter((element) => element.parentId === parentId)
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
    .flatMap((element) => [
      { element, depth },
      ...layerTree(elements, element.elementId, depth + 1),
    ]);
}

function IconAssetGlyph({ asset, className }: { asset: HeroiconAsset; className?: string }) {
  const IconComponent = asset.component;
  if (IconComponent) return <IconComponent className={className} />;

  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: getBuiltInIconSvg(asset) }} />
  );
}

export function DesignWorkspace({
  initialDocument,
  mode,
  contextTitle,
  onSave,
  onClose,
  allowMultiplePages = true,
  autosave = false,
  packPages = EMPTY_PAGE_TEMPLATES,
  activeTemplateId,
  onOpenTemplatePage,
}: {
  initialDocument: DesignDocument;
  mode?: WorkspaceMode;
  contextTitle?: string;
  onSave?: (document: DesignDocument) => void | Promise<void>;
  onClose?: () => void;
  allowMultiplePages?: boolean;
  autosave?: boolean;
  packPages?: PageTemplate[];
  activeTemplateId?: string;
  onOpenTemplatePage?: (pageTemplateId: string) => void;
}) {
  const workspaceDocument = useMemo(
    () => ({
      ...initialDocument,
      mode: mode ?? initialDocument.mode,
    }),
    [initialDocument, mode],
  );
  const editor = useDesignEditor(workspaceDocument);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState("insert");
  const [rightTab, setRightTab] = useState("properties");
  const [assetSearch, setAssetSearch] = useState("");
  const [iconSearch, setIconSearch] = useState("");
  const deferredIconSearch = useDeferredValue(iconSearch);
  const [iconVariantFilter, setIconVariantFilter] = useState<IconVariantFilter>("all");
  const [extendedIconAssets, setExtendedIconAssets] = useState<HeroiconAsset[]>([]);
  const [extendedIconsLoading, setExtendedIconsLoading] = useState(false);
  const [selectedIconId, setSelectedIconId] = useState("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [snapTargetIds, setSnapTargetIds] = useState<string[]>([]);
  const [tool, setTool] = useState<DesignTool>("select");
  const [spacePressed, setSpacePressed] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const stagePanLayerRef = useRef<HTMLDivElement | null>(null);
  const panPreviewRef = useRef<{
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
    latestPanX: number;
    latestPanY: number;
  } | null>(null);
  const panSchedulerRef = useRef<RafScheduler<{ clientX: number; clientY: number }> | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panCursor, setPanCursor] = useState<"grab" | "grabbing">("grab");
  const [, setViewportDrag] = useState<{ startX: number; startY: number } | null>(null);
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const [isElementTransforming, setIsElementTransforming] = useState(false);
  const elementTransformingRef = useRef(false);
  const lastComputedDocumentSignatureRef = useRef("");
  const onSaveRef = useRef(onSave);
  const autosaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<{ document: DesignDocument; signature: string } | null>(null);
  const autosaveErrorToastShownRef = useRef(false);
  const latestDocumentRef = useRef<DesignDocument | null>(null);
  const latestSignatureRef = useRef("");
  const [spacingLines, setSpacingLines] = useState<
    Array<{ axis: "x" | "y"; from: number; to: number; pos: number; gap: number }>
  >([]);
  const assetLibraryQuery = useLiveQuery(
    () => db.assetLibrary.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const brandKitsQuery = useLiveQuery(
    () => db.brandKits.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const fontAssetsQuery = useLiveQuery(
    () => db.fontAssets.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const assetLibrary = assetLibraryQuery ?? EMPTY_ASSETS;
  const brandKits = brandKitsQuery ?? EMPTY_BRAND_KITS;
  const fontAssets = fontAssetsQuery ?? EMPTY_FONT_ASSETS;
  const builtInAssets = useMemo(() => getBuiltInAssetLibrary(), []);
  const uploadedAssets = assetLibrary.filter((asset) => !isHeroiconAsset(asset));
  const iconAssets = useMemo(
    () => [...builtInAssets.filter(isHeroiconAsset), ...extendedIconAssets],
    [builtInAssets, extendedIconAssets],
  );
  const filteredIconAssets = useMemo(() => {
    const query = normalizeIconSearch(deferredIconSearch.trim());
    return iconAssets.filter((asset) => {
      if (iconVariantFilter !== "all" && asset.styleGroup !== iconVariantFilter) return false;
      if (!query) return true;
      const haystack =
        asset.searchText ?? normalizeIconSearch([asset.name, ...(asset.tags ?? [])].join(" "));
      return haystack.includes(query);
    });
  }, [iconAssets, deferredIconSearch, iconVariantFilter]);
  const visibleIconAssets = useMemo(
    () => filteredIconAssets.slice(0, ICON_PICKER_RESULT_LIMIT),
    [filteredIconAssets],
  );
  const iconResultsAreLimited = filteredIconAssets.length > visibleIconAssets.length;

  useEffect(() => {
    if (leftTab !== "insert" || extendedIconAssets.length > 0) return;
    let cancelled = false;
    setExtendedIconsLoading(true);
    loadExtendedIconLibrary()
      .then((assets) => {
        if (!cancelled) setExtendedIconAssets(assets);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Khong tai duoc thu vien icon mo rong",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setExtendedIconsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [extendedIconAssets.length, leftTab]);

  const documentSignature = useMemo(() => {
    if (isElementTransforming && lastComputedDocumentSignatureRef.current) {
      return lastComputedDocumentSignatureRef.current;
    }

    const nextSignature = [
      editor.state.designDocumentId,
      editor.state.mode,
      editor.state.updatedAt,
      editor.state.activePageId,
      editor.state.pageOrder.length,
      Object.keys(editor.state.elementsById).length,
    ].join(":");
    lastComputedDocumentSignatureRef.current = nextSignature;
    return nextSignature;
  }, [
    editor.state.activePageId,
    editor.state.designDocumentId,
    editor.state.elementsById,
    editor.state.mode,
    editor.state.pageOrder.length,
    editor.state.updatedAt,
    isElementTransforming,
  ]);
  const documentIdentity = `${workspaceDocument.designDocumentId}:${workspaceDocument.mode}`;
  const lastSavedSignatureRef = useRef(documentSignature);
  const autosaveDocumentIdentityRef = useRef(documentIdentity);
  const availableFontFamilies = useMemo(() => {
    const fromGoogle = FONTS.map((font) => font.family);
    const fromUpload = fontAssets.map((fontAsset) => fontAsset.family);
    return Array.from(new Set([...fromGoogle, ...fromUpload])).sort((a, b) => a.localeCompare(b));
  }, [fontAssets]);
  const libraryAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    const merged = uploadedAssets;
    return merged.filter((asset) => {
      const haystack = [asset.name, ...(asset.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [uploadedAssets, assetSearch]);

  onSaveRef.current = onSave;
  latestDocumentRef.current = editor.document;
  latestSignatureRef.current = documentSignature;

  const beginElementTransform = useCallback(() => {
    if (elementTransformingRef.current) return;
    elementTransformingRef.current = true;
    setIsElementTransforming(true);
  }, []);

  const endElementTransform = useCallback(() => {
    if (!elementTransformingRef.current) return;
    elementTransformingRef.current = false;
    setIsElementTransforming(false);
  }, []);

  const flushAutosaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    try {
      while (queuedSaveRef.current && onSaveRef.current) {
        const nextSave = queuedSaveRef.current;
        queuedSaveRef.current = null;

        if (nextSave.signature === lastSavedSignatureRef.current) continue;

        setAutosaveStatus("saving");

        try {
          await onSaveRef.current(nextSave.document);
          lastSavedSignatureRef.current = nextSave.signature;
          autosaveErrorToastShownRef.current = false;
          setAutosaveStatus(queuedSaveRef.current ? "pending" : "saved");
        } catch (error) {
          setAutosaveStatus("error");
          if (!autosaveErrorToastShownRef.current) {
            autosaveErrorToastShownRef.current = true;
            toast.error(error instanceof Error ? error.message : "Autosave thất bại");
          }
        }
      }
    } finally {
      saveInFlightRef.current = false;
    }
  }, []);

  const queueAutosave = useCallback(
    (documentToSave: DesignDocument, signature: string) => {
      if (!onSaveRef.current || signature === lastSavedSignatureRef.current) return;
      queuedSaveRef.current = { document: documentToSave, signature };
      void flushAutosaveQueue();
    },
    [flushAutosaveQueue],
  );

  useEffect(() => {
    fontAssets.forEach((fontAsset) => {
      registerFontAsset(fontAsset).catch(() => undefined);
    });
  }, [fontAssets]);

  useEffect(() => {
    if (autosaveDocumentIdentityRef.current !== documentIdentity) {
      autosaveDocumentIdentityRef.current = documentIdentity;
      lastSavedSignatureRef.current = documentSignature;
      queuedSaveRef.current = null;
      setAutosaveStatus(autosave && onSaveRef.current ? "saved" : "idle");
    }
  }, [autosave, documentIdentity, documentSignature]);

  useEffect(() => {
    if (!autosave || !onSaveRef.current) return;

    if (documentSignature === lastSavedSignatureRef.current) {
      setAutosaveStatus("saved");
      return;
    }

    setAutosaveStatus("pending");
    autosaveTimerRef.current = window.setTimeout(() => {
      const documentToSave = latestDocumentRef.current;
      if (!documentToSave) return;
      queueAutosave(documentToSave, documentSignature);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [autosave, documentSignature, queueAutosave]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (!autosave || !latestDocumentRef.current) return;
      queueAutosave(latestDocumentRef.current, latestSignatureRef.current);
    };
  }, [autosave, queueAutosave]);

  useEffect(() => {
    if (!selectedIconId && iconAssets[0]) {
      setSelectedIconId(iconAssets[0].assetId);
    }
  }, [iconAssets, selectedIconId]);

  useEffect(() => {
    if (!editingTextId) return;
    const current = editor.activeElements.find((element) => element.elementId === editingTextId);
    if (!current || current.kind !== "text") {
      setEditingTextId(null);
      setEditingTextValue("");
    }
  }, [editingTextId, editor.activeElements]);

  const activePage = editor.activePage;
  const selected = editor.selectedElements;
  const primary = selected.at(-1) ?? null;
  const hasPackPages = packPages.length > 0;
  const zoom = editor.state.viewport.zoom;
  const currentBrandKit =
    brandKits.find((kit) => kit.brandKitId === editor.state.brandKitId) ?? brandKits[0] ?? null;

  const persistBrandKitSelection = async (brandKitId: string | undefined) => {
    editor.setBrandKit(brandKitId);
  };

  const handleSave = async () => {
    if (!onSave) return;
    await onSave(editor.document);
    toast.success("Đã lưu thay đổi");
  };

  const runExport = async (label: "json" | "png" | "jpg" | "svg" | "pdf") => {
    try {
      const exporter = await import("./exportDesign");
      if (label === "json") exporter.exportDesignDocumentJson(editor.document);
      if (label === "png") await exporter.exportDesignPagePng({ document: editor.document });
      if (label === "jpg") await exporter.exportDesignPageJpg({ document: editor.document });
      if (label === "svg") await exporter.exportDesignPageSvg({ document: editor.document });
      if (label === "pdf") await exporter.exportDesignDocumentPdf({ document: editor.document });
      toast.success(`Đã export ${label.toUpperCase()}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Export ${label.toUpperCase()} thất bại`,
      );
    }
  };

  const insertText = () => {
    if (!activePage) return;
    const elementId = nanoid();
    editor.insertElement({
      elementId,
      pageId: activePage.pageId,
      kind: "text",
      name: "Text",
      x: 120,
      y: 120,
      width: 420,
      height: 120,
      zIndex: editor.activeElements.length,
      text: "Text mới",
      style: {
        fontFamily: currentBrandKit?.fontAssetIds.length
          ? (fontAssets.find((item) => item.fontAssetId === currentBrandKit.fontAssetIds[0])
              ?.family ?? "Be Vietnam Pro")
          : "Be Vietnam Pro",
        fontSize: 48,
        fontWeight: 700,
        color: "#0f172a",
        lineHeight: 1.2,
      },
      textRuns: [],
    });
  };

  const insertShape = (shapeKind: "rectangle" | "circle" | "triangle" | "line" = "rectangle") => {
    if (!activePage) return;
    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "shape",
      name: "Shape",
      x: 160,
      y: 180,
      width: shapeKind === "line" ? 320 : 240,
      height: shapeKind === "line" ? 20 : 180,
      zIndex: editor.activeElements.length,
      shapeKind,
      text: "",
      style: {
        fill: shapeKind === "line" ? "#0f172a" : "#f97316",
        borderRadius: shapeKind === "circle" ? 9999 : 18,
        strokeWidth: shapeKind === "line" ? 4 : undefined,
      },
    });
  };

  const insertTable = () => {
    if (!activePage) return;
    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "table",
      name: "Table",
      x: 120,
      y: 220,
      width: 560,
      height: 300,
      zIndex: editor.activeElements.length,
      columns: 3,
      rows: 4,
      cells: Array.from({ length: 12 }, (_, index) => ({
        cellId: `cell-${index}`,
        text: index < 3 ? `Header ${index + 1}` : "",
      })),
      style: {
        fill: "#ffffff",
        color: "#0f172a",
        fontSize: 18,
      },
    });
  };

  const insertImageFrame = () => {
    if (!activePage) return;
    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "image",
      name: "Image",
      x: 140,
      y: 160,
      width: 320,
      height: 420,
      zIndex: editor.activeElements.length,
      src: "",
      style: {
        fit: "cover",
        borderRadius: 24,
      },
    });
  };

  const insertAsset = (asset: AssetPanelItem) => {
    if (!activePage) return;
    if (isHeroiconAsset(asset)) {
      const svgContent = getBuiltInIconSvg(asset);
      editor.insertElement({
        elementId: nanoid(),
        pageId: activePage.pageId,
        kind: "icon",
        name: asset.name,
        x: 160,
        y: 160,
        width: 180,
        height: 180,
        zIndex: editor.activeElements.length,
        iconName: asset.iconName,
        svgContent: svgContent || asset.svgContent,
        assetId: asset.assetId,
        style: {
          tint: "#0f172a",
          color: "#0f172a",
        },
      });
      return;
    }

    if (asset.kind === "svg") {
      editor.insertElement({
        elementId: nanoid(),
        pageId: activePage.pageId,
        kind: "svg",
        name: asset.name,
        x: 160,
        y: 160,
        width: 180,
        height: 180,
        zIndex: editor.activeElements.length,
        svgContent: asset.sourceValue,
        assetId: asset.assetId,
        style: {
          tint: "#0f172a",
          color: "#0f172a",
        },
      });
      return;
    }

    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "image",
      name: asset.name,
      x: 160,
      y: 160,
      width: 320,
      height: 320,
      zIndex: editor.activeElements.length,
      src: asset.sourceValue,
      assetId: asset.assetId,
      style: {
        fit: "cover",
        borderRadius: 24,
      },
    });
  };

  const uploadAsset = async (kind: AssetItem["kind"] = "image") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "image" || kind === "logo" ? "image/*" : ".svg";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const blobKey = await saveBlob(file);
      const asset: AssetItem = {
        assetId: nanoid(),
        name: file.name.replace(/\.[^.]+$/, ""),
        kind,
        sourceType: "local",
        sourceValue: makeIdbSrc(blobKey),
        blobKey,
        mime: file.type,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.assetLibrary.put(asset);
      editor.setAssetIds([...editor.state.assetIds, asset.assetId]);
      if (kind !== "logo") insertAsset(asset);
      toast.success("Đã thêm asset");
    };
    input.click();
  };

  const deleteAsset = async (asset: AssetItem) => {
    await db.assetLibrary.delete(asset.assetId);
    editor.setAssetIds(editor.state.assetIds.filter((id) => id !== asset.assetId));
    toast.success(`Đã xoá asset "${asset.name}"`);
  };

  const uploadFont = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".woff,.woff2,.ttf,.otf";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const blobKey = await saveBlob(file);
      const family = file.name.replace(/\.[^.]+$/, "");
      const fontAsset: FontAsset = {
        fontAssetId: nanoid(),
        family,
        sourceValue: makeIdbSrc(blobKey),
        blobKey,
        format: file.name.split(".").pop()?.toLowerCase(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.fontAssets.put(fontAsset);
      await registerFontAsset(fontAsset);
      toast.success(`Đã thêm font ${family}`);
    };
    input.click();
  };

  const createBrandKit = async () => {
    const brandKit: BrandKit = {
      brandKitId: nanoid(),
      name: `Brand Kit ${brandKits.length + 1}`,
      colors: ["#0f172a", "#f97316", "#f8fafc"],
      logoAssetIds: [],
      fontAssetIds: [],
      presets: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.brandKits.put(brandKit);
    await persistBrandKitSelection(brandKit.brandKitId);
    toast.success("Đã tạo Brand Kit");
  };

  const updateBrandKit = async (patch: Partial<BrandKit>) => {
    if (!currentBrandKit) return;
    await db.brandKits.put({
      ...currentBrandKit,
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const toggleSafeZone = () => {
    editor.updateDocumentSettings({
      showSafeZone: !editor.state.documentSettings.showSafeZone,
    });
  };

  const openPropertiesPanel = () => {
    setRightOpen(true);
    setRightTab("properties");
  };

  const getSelectionActionIds = () => {
    const ids = new Set<string>(editor.state.selection.ids);
    selected.forEach((element) => {
      if (element.kind !== "group") return;
      getDescendantIds(editor.activeElements, element.elementId).forEach((id) => ids.add(id));
    });
    return Array.from(ids);
  };

  const moveSelectionBy = (dx: number, dy: number) => {
    const ids = getSelectionActionIds();
    if (ids.length === 0) return;
    editor.updateElements(ids, (element) => ({
      x: Math.round(element.x + dx),
      y: Math.round(element.y + dy),
    }));
  };

  const alignSelectionToPage = (
    mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) => {
    if (!activePage || selected.length === 0) return;
    const bounds = getSelectionBounds(selected);
    if (!bounds) return;
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = -bounds.x;
    if (mode === "center") dx = activePage.width / 2 - (bounds.x + bounds.width / 2);
    if (mode === "right") dx = activePage.width - (bounds.x + bounds.width);
    if (mode === "top") dy = -bounds.y;
    if (mode === "middle") dy = activePage.height / 2 - (bounds.y + bounds.height / 2);
    if (mode === "bottom") dy = activePage.height - (bounds.y + bounds.height);
    moveSelectionBy(dx, dy);
  };

  const alignSelectionFromToolbar = (
    mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) => {
    alignSelectionToPage(mode);
  };

  const showSelectionInfo = () => {
    const bounds = getSelectionBounds(selected);
    if (!primary) return;
    const info = bounds
      ? `${primary.name ?? primary.kind} · ${Math.round(bounds.width)}×${Math.round(bounds.height)}`
      : (primary.name ?? primary.kind);
    toast.message(info);
    openPropertiesPanel();
  };

  const startInlineTextEdit = (elementId: string) => {
    const element = editor.activeElements.find((item) => item.elementId === elementId);
    if (!element || element.kind !== "text") return;
    editor.setSelection([elementId], elementId);
    setEditingTextId(elementId);
    setEditingTextValue(element.text);
  };

  const commitInlineTextEdit = () => {
    if (!editingTextId) return;
    editor.updateElements([editingTextId], { text: editingTextValue }, { history: false });
    setEditingTextId(null);
  };

  const cancelInlineTextEdit = () => {
    setEditingTextId(null);
    setEditingTextValue("");
  };

  const keyboardStateRef = useRef({
    editor,
    selected,
    editingTextId,
    insertText,
    insertShape,
    cancelInlineTextEdit,
  });
  keyboardStateRef.current = {
    editor,
    selected,
    editingTextId,
    insertText,
    insertShape,
    cancelInlineTextEdit,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        setSpacePressed(true);
        return;
      }

      if (isEditableTarget(event.target)) return;

      const keyboard = keyboardStateRef.current;
      const currentEditor = keyboard.editor;
      const currentSelected = keyboard.selected;
      const mod = event.ctrlKey || event.metaKey;
      const lower = event.key.toLowerCase();

      if (lower === "v" && !mod) {
        event.preventDefault();
        setTool("select");
        return;
      }
      if (lower === "h" && !mod) {
        event.preventDefault();
        setTool("pan");
        return;
      }
      if (lower === "t" && !mod) {
        event.preventDefault();
        keyboard.insertText();
        return;
      }
      if (lower === "r" && !mod) {
        event.preventDefault();
        keyboard.insertShape("rectangle");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (keyboard.editingTextId) {
          keyboard.cancelInlineTextEdit();
          return;
        }
        currentEditor.setSelection([]);
        setMarqueeRect(null);
        return;
      }
      if (mod && lower === "a") {
        event.preventDefault();
        const selectableIds = currentEditor.activeElements
          .filter((element) => !element.hidden)
          .map((element) => element.elementId);
        currentEditor.setSelection(selectableIds, selectableIds.at(-1) ?? null);
        return;
      }
      if (mod && lower === "z" && !event.shiftKey) {
        event.preventDefault();
        currentEditor.undo();
        return;
      }
      if (mod && ((lower === "z" && event.shiftKey) || lower === "y")) {
        event.preventDefault();
        currentEditor.redo();
        return;
      }
      if (mod && lower === "c") {
        event.preventDefault();
        currentEditor.copySelection();
        return;
      }
      if (mod && lower === "v") {
        event.preventDefault();
        currentEditor.pasteClipboard();
        return;
      }
      if (mod && lower === "d") {
        event.preventDefault();
        currentEditor.duplicateSelection();
        return;
      }
      if (mod && lower === "g" && event.shiftKey) {
        event.preventDefault();
        currentEditor.ungroupSelection();
        return;
      }
      if (mod && lower === "g") {
        event.preventDefault();
        currentEditor.groupSelection();
        return;
      }
      if (mod && event.key === "]") {
        event.preventDefault();
        if (event.altKey) currentEditor.orderSelection("front");
        else currentEditor.orderSelection("forward");
        return;
      }
      if (mod && event.key === "[") {
        event.preventDefault();
        if (event.altKey) currentEditor.orderSelection("back");
        else currentEditor.orderSelection("backward");
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && currentSelected.length > 0) {
        event.preventDefault();
        currentEditor.deleteSelection();
        return;
      }
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        if (currentSelected.length === 0) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const moveTargets = new Set<string>();
        currentSelected.forEach((element) => {
          moveTargets.add(element.elementId);
          getDescendantIds(currentEditor.activeElements, element.elementId).forEach((id) =>
            moveTargets.add(id),
          );
        });
        currentEditor.updateElements(Array.from(moveTargets), (element) => ({
          x: element.x + dx,
          y: element.y + dy,
        }));
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") {
        setSpacePressed(false);
        setIsPanning(false);
        setPanCursor("grab");
        setViewportDrag(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!spacePressed) return;
    setPanCursor("grab");
  }, [spacePressed]);

  useEffect(() => {
    if (!stageWrapRef.current) return;
    stageWrapRef.current.style.cursor = isPanning ? "grabbing" : getToolCursor(tool, spacePressed);
  }, [tool, spacePressed, isPanning]);

  const handleZoomStep = (direction: 1 | -1) => {
    zoomByStep(editor, zoom, direction);
  };

  const viewportPanX = editor.state.viewport.panX;
  const viewportPanY = editor.state.viewport.panY;
  const setEditorPan = editor.setPan;
  const setEditorZoom = editor.setZoom;

  const handleCanvasWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const currentZoom = zoom;
      const nextZoom = getNextZoom(currentZoom, event.deltaY < 0 ? 1 : -1);
      const wrapRect = stageWrapRef.current?.getBoundingClientRect();
      const pointX = event.clientX - (wrapRect?.left ?? 0);
      const pointY = event.clientY - (wrapRect?.top ?? 0);
      const nextPan = zoomAtPoint({
        currentZoom,
        nextZoom,
        panX: viewportPanX,
        panY: viewportPanY,
        pointX,
        pointY,
      });
      setEditorPan(nextPan.panX, nextPan.panY);
      setEditorZoom(nextZoom);
    },
    [setEditorPan, setEditorZoom, viewportPanX, viewportPanY, zoom],
  );

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const wrap = stageWrapRef.current;
      if (!wrap || !(event.target instanceof Node) || !wrap.contains(event.target)) return;
      handleCanvasWheel(event);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, [handleCanvasWheel]);

  const beginPan = (clientX: number, clientY: number) => {
    const originPanX = editor.state.viewport.panX;
    const originPanY = editor.state.viewport.panY;
    panPreviewRef.current = {
      startX: clientX,
      startY: clientY,
      originPanX,
      originPanY,
      latestPanX: originPanX,
      latestPanY: originPanY,
    };
    panSchedulerRef.current?.cancel();
    panSchedulerRef.current = createRafScheduler(
      ({ clientX: nextClientX, clientY: nextClientY }) => {
        const preview = panPreviewRef.current;
        if (!preview) return;
        const nextPanX = preview.originPanX + (nextClientX - preview.startX);
        const nextPanY = preview.originPanY + (nextClientY - preview.startY);
        preview.latestPanX = nextPanX;
        preview.latestPanY = nextPanY;
        const node = stagePanLayerRef.current;
        if (node) {
          node.style.willChange = "transform";
          node.style.transform = `translate(${nextPanX}px, ${nextPanY}px)`;
        }
      },
    );
    setIsPanning(true);
    setPanCursor("grabbing");
    setViewportDrag({ startX: clientX, startY: clientY });
  };

  const updatePan = (clientX: number, clientY: number) => {
    if (panPreviewRef.current && panSchedulerRef.current) {
      panSchedulerRef.current({ clientX, clientY });
      return;
    }
    setViewportDrag((prev) => {
      if (!prev) return prev;
      editor.setPan(
        editor.state.viewport.panX + (clientX - prev.startX),
        editor.state.viewport.panY + (clientY - prev.startY),
      );
      return { startX: clientX, startY: clientY };
    });
  };

  const endPan = () => {
    panSchedulerRef.current?.flush();
    const preview = panPreviewRef.current;
    if (preview) {
      editor.setPan(preview.latestPanX, preview.latestPanY);
    }
    panPreviewRef.current = null;
    panSchedulerRef.current = null;
    if (stagePanLayerRef.current) {
      stagePanLayerRef.current.style.willChange = "";
    }
    setIsPanning(false);
    setPanCursor("grab");
    setViewportDrag(null);
  };

  const handleStageBackgroundMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const canvas = event.currentTarget;
    if (isPanToolActive(tool, spacePressed)) {
      beginPan(event.clientX, event.clientY);
      const onMouseMove = (moveEvent: MouseEvent) =>
        updatePan(moveEvent.clientX, moveEvent.clientY);
      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        endPan();
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return;
    }

    editor.setSelection([]);
    const additive = event.shiftKey;
    const toggle = event.ctrlKey || event.metaKey;
    const start = getCanvasPoint(canvas, zoom, event.clientX, event.clientY, 0, 0);
    setMarqueeRect({ x: start.x, y: start.y, width: 0, height: 0 });

    const onMouseMove = (moveEvent: MouseEvent) => {
      const point = getCanvasPoint(canvas, zoom, moveEvent.clientX, moveEvent.clientY, 0, 0);
      const rect = normalizeMarqueeRect(start, point);
      setMarqueeRect(rect);
      const nextIds = getSelectionFromMarquee(
        editor.state.selection.ids,
        getMarqueeSelection(editor.activeElements, rect),
        additive,
        toggle,
      );
      editor.setSelection(nextIds, nextIds.at(-1) ?? null);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setMarqueeRect(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleStageWrapMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-design-canvas]")) return;
    if (isPanToolActive(tool, spacePressed)) return;
    editor.setSelection([]);
    setMarqueeRect(null);
  };

  const selectedBounds = getSelectionBounds(selected);
  const stageCursor = isPanning ? panCursor : getToolCursor(tool, spacePressed);

  const renderElementContextMenu = (element: DesignElement) => {
    const hasSelection = selected.length > 0;
    const canGroup = selected.length > 1;
    const canUngroup = selected.some((item) => item.kind === "group");
    return (
      <ContextMenuContent className="w-72">
        <ContextMenuItem onSelect={() => editor.copySelection()} disabled={!hasSelection}>
          <Copy className="mr-2 size-4" />
          Sao chép
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.pasteClipboard()}
          disabled={!editor.state.clipboard?.length}
        >
          <ClipboardPaste className="mr-2 size-4" />
          Dán
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.duplicateSelection()} disabled={!hasSelection}>
          <Layers className="mr-2 size-4" />
          Tạo bản sao
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.deleteSelection()} disabled={!hasSelection}>
          <Trash2 className="mr-2 size-4" />
          Xóa
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => editor.orderSelection("front")} disabled={!hasSelection}>
          Lên trên cùng
          <ContextMenuShortcut>Ctrl+Alt+]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.orderSelection("forward")} disabled={!hasSelection}>
          Lên một lớp
          <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.orderSelection("backward")}
          disabled={!hasSelection}
        >
          Xuống một lớp
          <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.orderSelection("back")} disabled={!hasSelection}>
          Xuống dưới cùng
          <ContextMenuShortcut>Ctrl+Alt+[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Căn chỉnh theo trang</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem onSelect={() => alignSelectionToPage("left")}>
              Căn trái
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("center")}>
              Căn giữa ngang
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("right")}>
              Căn phải
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => alignSelectionToPage("top")}>Căn trên</ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("middle")}>
              Căn giữa dọc
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("bottom")}>
              Căn dưới
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => editor.groupSelection()} disabled={!canGroup}>
          <Group className="mr-2 size-4" />
          Tạo thành phần
          <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.ungroupSelection()} disabled={!canUngroup}>
          <Ungroup className="mr-2 size-4" />
          Bỏ nhóm
          <ContextMenuShortcut>Ctrl+Shift+G</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            editor.updateElements(
              [element.elementId],
              { locked: !element.locked },
              { history: false },
            )
          }
        >
          {element.locked ? <LockOpen className="mr-2 size-4" /> : <Lock className="mr-2 size-4" />}
          {element.locked ? "Mở khóa" : "Khóa"}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            editor.updateElements(
              [element.elementId],
              { hidden: !element.hidden },
              { history: false },
            )
          }
        >
          {element.hidden ? <Eye className="mr-2 size-4" /> : <EyeOff className="mr-2 size-4" />}
          {element.hidden ? "Hiện thành phần" : "Ẩn thành phần"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() =>
            editor.updateElements(
              [element.elementId],
              {
                style: { ...(element.style ?? {}), flipH: !element.style?.flipH },
              } as Partial<DesignElement>,
              { history: false },
            )
          }
        >
          <FlipHorizontal className="mr-2 size-4" />
          Lật ngang
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            editor.updateElements(
              [element.elementId],
              {
                style: { ...(element.style ?? {}), flipV: !element.style?.flipV },
              } as Partial<DesignElement>,
              { history: false },
            )
          }
        >
          <FlipVertical className="mr-2 size-4" />
          Lật dọc
        </ContextMenuItem>
        {element.kind === "image" ? (
          <ContextMenuItem onSelect={() => setCropTargetId(element.elementId)}>
            <ImageIcon className="mr-2 size-4" />
            Cắt ảnh
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={openPropertiesPanel}>
          <PanelRight className="mr-2 size-4" />
          Mở thuộc tính
        </ContextMenuItem>
        <ContextMenuItem onSelect={showSelectionInfo}>
          <Info className="mr-2 size-4" />
          Thông tin
        </ContextMenuItem>
      </ContextMenuContent>
    );
  };

  const renderCanvasContextMenu = () => (
    <ContextMenuContent className="w-64">
      <ContextMenuLabel>Canvas</ContextMenuLabel>
      <ContextMenuItem
        onSelect={() => editor.pasteClipboard()}
        disabled={!editor.state.clipboard?.length}
      >
        <ClipboardPaste className="mr-2 size-4" />
        Dán
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={insertText}>
        <Type className="mr-2 size-4" />
        Thêm text
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => insertShape("rectangle")}>
        <Shapes className="mr-2 size-4" />
        Thêm shape
      </ContextMenuItem>
      <ContextMenuItem onSelect={insertImageFrame}>
        <ImageIcon className="mr-2 size-4" />
        Thêm khung ảnh
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuCheckboxItem
        checked={editor.state.documentSettings.showSafeZone}
        onCheckedChange={toggleSafeZone}
      >
        Hiện khung an toàn
      </ContextMenuCheckboxItem>
    </ContextMenuContent>
  );

  if (!activePage) return null;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <div className="flex flex-wrap items-center gap-2 border-b bg-card/40 px-3 py-2">
          <Input
            value={editor.document.name}
            onChange={(event) => editor.setName(event.target.value)}
            className="h-9 max-w-[220px]"
            aria-label="Tên design"
          />

          {contextTitle ? (
            <div
              className="max-w-[320px] truncate rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
              title={contextTitle}
            >
              {contextTitle}
            </div>
          ) : null}

          <ToolbarDivider />

          {/* Undo / Redo */}
          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={!editor.canUndo}
                  onClick={() => editor.undo()}
                >
                  <Undo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo · Ctrl+Z</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={!editor.canRedo}
                  onClick={() => editor.redo()}
                >
                  <Redo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo · Ctrl+Shift+Z</TooltipContent>
            </Tooltip>
          </div>

          <ToolbarDivider />

          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => handleZoomStep(-1)}
                >
                  <ZoomOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out · Ctrl/Cmd + −</TooltipContent>
            </Tooltip>
            <div className="w-14 text-center text-xs font-medium tabular-nums">
              {formatZoom(zoom)}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => handleZoomStep(1)}
                >
                  <ZoomIn className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in · Ctrl/Cmd + +</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => zoomToFit(editor, stageWrapRef.current)}
                >
                  <Frame className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to screen</TooltipContent>
            </Tooltip>
          </div>

          <ToolbarDivider />

          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={tool === "select" ? "default" : "ghost"}
                  className="size-8"
                  onClick={() => setTool("select")}
                  aria-label="Select"
                  aria-pressed={tool === "select"}
                >
                  <MousePointer2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select · V</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={tool === "pan" || spacePressed ? "default" : "ghost"}
                  className="size-8"
                  onClick={() => setTool("pan")}
                  aria-label="Pan"
                  aria-pressed={tool === "pan"}
                >
                  <Hand className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Pan · H / Space</TooltipContent>
            </Tooltip>
          </div>

          <ToolbarDivider />

          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={editor.state.documentSettings.showSafeZone ? "default" : "ghost"}
                  className="size-8"
                  onClick={toggleSafeZone}
                  aria-label="Toggle khung an toàn"
                  aria-pressed={editor.state.documentSettings.showSafeZone}
                >
                  <Frame className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Khung an toàn</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={editor.state.documentSettings.showGrid ? "default" : "ghost"}
                  className="size-8"
                  onClick={() =>
                    editor.updateDocumentSettings({
                      showGrid: !editor.state.documentSettings.showGrid,
                    })
                  }
                  aria-label="Toggle grid"
                  aria-pressed={editor.state.documentSettings.showGrid}
                >
                  <Grid2X2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={editor.state.documentSettings.showGuides ? "default" : "ghost"}
                  className="size-8"
                  onClick={() =>
                    editor.updateDocumentSettings({
                      showGuides: !editor.state.documentSettings.showGuides,
                    })
                  }
                  aria-label="Toggle guides"
                  aria-pressed={editor.state.documentSettings.showGuides}
                >
                  <Ruler className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Guides</TooltipContent>
            </Tooltip>
          </div>

          <ToolbarDivider />

          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("left")}
                >
                  <AlignStartHorizontal className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Align left</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("center")}
                >
                  <AlignCenter className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Align horizontal center</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("right")}
                >
                  <AlignEndHorizontal className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Align right</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("top")}
                >
                  <MoveUp className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Align top</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("middle")}
                >
                  <AlignVerticalJustifyCenter className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Align vertical middle</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("bottom")}
                >
                  <MoveDown className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Align bottom</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.distributeSelection("horizontal")}
                >
                  <AlignHorizontalJustifyCenter className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Distribute horizontally</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.distributeSelection("vertical")}
                >
                  <AlignVerticalJustifyCenter className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Distribute vertically</TooltipContent>
            </Tooltip>
          </div>

          <ToolbarDivider />

          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.groupSelection()}
                  disabled={selected.length < 2}
                >
                  <Group className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Group · Ctrl+G</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.ungroupSelection()}
                  disabled={!selected.some((e) => e.kind === "group")}
                >
                  <Ungroup className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ungroup · Ctrl+Shift+G</TooltipContent>
            </Tooltip>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Download className="mr-2 size-4" />
                  Download
                  <ChevronDown className="ml-1 size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Xuất thiết kế</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => runExport("png")}>PNG</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => runExport("jpg")}>JPG</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => runExport("svg")}>SVG</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => runExport("pdf")}>PDF</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => runExport("json")}>JSON (dev)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <ToolbarDivider />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={leftOpen ? "default" : "ghost"}
                  className="size-8"
                  onClick={() => setLeftOpen((value) => !value)}
                  aria-label="Toggle left panel"
                  aria-pressed={leftOpen}
                >
                  <PanelLeft className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Left panel</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={rightOpen ? "default" : "ghost"}
                  className="size-8"
                  onClick={() => setRightOpen((value) => !value)}
                  aria-label="Toggle right panel"
                  aria-pressed={rightOpen}
                >
                  <PanelRight className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Right panel</TooltipContent>
            </Tooltip>

            {autosave && onSave ? (
              <span
                className="px-1 text-xs text-muted-foreground"
                aria-live="polite"
                title="Editor lưu tự động khi có thay đổi"
              >
                {autosaveStatus === "pending" || autosaveStatus === "saving"
                  ? "Đang lưu"
                  : autosaveStatus === "error"
                    ? "Đang lưu"
                    : "Đã lưu"}
              </span>
            ) : null}

            {!autosave && onSave ? (
              <Button onClick={handleSave}>
                <Save className="mr-2 size-4" />
                Lưu
              </Button>
            ) : null}

            {onClose ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-9 rounded-full"
                    onClick={onClose}
                    aria-label="Đóng editor"
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Đóng editor</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div
          className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
          style={{
            gridTemplateColumns: `${leftOpen ? 320 : 0}px minmax(0,1fr) ${rightOpen ? 340 : 0}px`,
          }}
        >
          {leftOpen ? (
            <aside className="min-h-0 min-w-0 overflow-hidden border-r">
              <Tabs value={leftTab} onValueChange={setLeftTab} className="flex h-full flex-col">
                <TabsList className="mx-4 mt-4 grid grid-cols-3">
                  <TabsTrigger value="insert">Insert</TabsTrigger>
                  <TabsTrigger value="assets">Assets</TabsTrigger>
                  <TabsTrigger value="pages">Pages</TabsTrigger>
                </TabsList>
                <TabsContent value="insert" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-2 pt-4">
                    <Button className="w-full justify-start" variant="outline" onClick={insertText}>
                      <Type className="mr-2 size-4" /> Text
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={insertImageFrame}
                    >
                      <ImageIcon className="mr-2 size-4" /> Image
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => insertShape("rectangle")}
                    >
                      <Shapes className="mr-2 size-4" /> Rectangle
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => insertShape("circle")}
                    >
                      <Shapes className="mr-2 size-4" /> Circle
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => insertShape("line")}
                    >
                      <Minus className="mr-2 size-4" /> Line
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={insertTable}
                    >
                      <Table2 className="mr-2 size-4" /> Table
                    </Button>
                    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs uppercase text-muted-foreground">Icon</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {extendedIconsLoading ? "..." : filteredIconAssets.length}
                        </span>
                      </div>
                      <Input
                        value={iconSearch}
                        onChange={(event) => setIconSearch(event.target.value)}
                        placeholder="Tìm icon: địa điểm, pin, phone, cafe..."
                      />
                      <ToggleGroup
                        type="single"
                        value={iconVariantFilter}
                        onValueChange={(value) => {
                          if (value) setIconVariantFilter(value as IconVariantFilter);
                        }}
                        variant="outline"
                        size="sm"
                        className="grid grid-cols-4"
                      >
                        <ToggleGroupItem value="all" aria-label="Tất cả icon">
                          Tất cả
                        </ToggleGroupItem>
                        <ToggleGroupItem value="line" aria-label="Icon line">
                          Line
                        </ToggleGroupItem>
                        <ToggleGroupItem value="solid" aria-label="Icon solid">
                          Solid
                        </ToggleGroupItem>
                        <ToggleGroupItem value="color" aria-label="Icon màu">
                          Màu
                        </ToggleGroupItem>
                      </ToggleGroup>
                      {extendedIconsLoading ? (
                        <div className="text-xs text-muted-foreground">
                          Đang tải thêm icon Canva-like...
                        </div>
                      ) : null}
                      {iconResultsAreLimited ? (
                        <div className="text-xs text-muted-foreground">
                          Đang hiển thị {visibleIconAssets.length} icon đầu tiên. Gõ từ khóa để lọc
                          nhanh hơn.
                        </div>
                      ) : null}
                      <ScrollArea className="h-64 rounded-lg border bg-background p-2">
                        {visibleIconAssets.length > 0 ? (
                          <div className="grid grid-cols-6 gap-1.5 pr-2">
                            {visibleIconAssets.map((asset) => (
                              <button
                                key={asset.assetId}
                                type="button"
                                onClick={() => {
                                  setSelectedIconId(asset.assetId);
                                  insertAsset(asset);
                                }}
                                className={
                                  "flex aspect-square items-center justify-center rounded-md border bg-card transition " +
                                  (asset.assetId === selectedIconId
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "hover:border-primary/50 hover:bg-muted")
                                }
                                title={asset.name}
                                aria-label={`Thêm ${asset.name}`}
                              >
                                <IconAssetGlyph asset={asset} className="block size-5" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                            Không có icon phù hợp.
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="assets" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-3 pt-4">
                    <div className="flex gap-2">
                      <Input
                        value={assetSearch}
                        onChange={(event) => setAssetSearch(event.target.value)}
                        placeholder="Tìm asset đã tải lên"
                      />
                      <Button variant="outline" onClick={() => uploadAsset("image")}>
                        <Upload className="size-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Tab này chỉ lưu assets mà người dùng tải lên.
                    </div>
                    {libraryAssets.length === 0 ? (
                      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                        Chưa có asset nào được tải lên.
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      {libraryAssets.map((asset) => (
                        <div
                          key={asset.assetId}
                          className="relative rounded-xl border bg-card p-3 transition hover:border-primary hover:shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => insertAsset(asset)}
                            className="w-full text-left"
                          >
                            <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-muted/50">
                              {isHeroiconAsset(asset) ? (
                                <IconAssetGlyph
                                  asset={asset}
                                  className="block size-12 text-foreground"
                                />
                              ) : asset.kind === "image" || asset.kind === "logo" ? (
                                <ImageIcon className="size-8 text-muted-foreground" />
                              ) : (
                                <div
                                  className="size-12 text-foreground"
                                  dangerouslySetInnerHTML={{ __html: asset.sourceValue }}
                                />
                              )}
                            </div>
                            <div className="pr-8 text-sm font-medium">{asset.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {isHeroiconAsset(asset) ? asset.provider : asset.kind}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteAsset(asset);
                            }}
                            className="absolute right-2 top-2 rounded-md border bg-background p-1 text-muted-foreground transition hover:border-destructive hover:text-destructive"
                            title={`Xoá ${asset.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="pages" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-3 pt-4">
                    {allowMultiplePages && !hasPackPages ? (
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => editor.addPage()}
                      >
                        <Plus className="mr-2 size-4" /> Add page
                      </Button>
                    ) : null}
                    {hasPackPages
                      ? packPages.map((pageTemplate, index) => {
                          const selectedPage =
                            activeTemplateId === pageTemplate.pageTemplateId ||
                            editor.document.sourcePageTemplateId === pageTemplate.pageTemplateId;
                          const previewScale = Math.min(
                            72 / pageTemplate.canvas.width,
                            90 / pageTemplate.canvas.height,
                          );
                          return (
                            <button
                              key={pageTemplate.pageTemplateId}
                              type="button"
                              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/60 hover:bg-muted/40 ${
                                selectedPage ? "border-primary bg-primary/5" : "bg-card"
                              }`}
                              onClick={() => {
                                if (selectedPage) return;
                                onOpenTemplatePage?.(pageTemplate.pageTemplateId);
                              }}
                            >
                              <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                                {index + 1}
                              </div>
                              <div className="shrink-0 overflow-hidden rounded-md border bg-background shadow-sm">
                                <PageRenderer
                                  template={pageTemplate}
                                  entities={[]}
                                  assets={[]}
                                  scale={previewScale}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">
                                  {pageTemplate.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {pageTemplate.canvas.width} x {pageTemplate.canvas.height}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      : editor.state.pageOrder.map((pageId, index) => {
                          const page = editor.state.pagesById[pageId];
                          const selectedPage = editor.state.activePageId === pageId;
                          return (
                            <div
                              key={pageId}
                              className={`rounded-xl border p-3 ${selectedPage ? "border-primary bg-primary/5" : ""}`}
                            >
                              <button
                                className="w-full text-left"
                                onClick={() => editor.setActivePage(pageId)}
                              >
                                <div className="text-sm font-semibold">{page.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {page.width} × {page.height}
                                </div>
                              </button>
                              <div className="mt-3 flex gap-2">
                                {allowMultiplePages ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => editor.movePage(pageId, -1)}
                                      disabled={index === 0}
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => editor.movePage(pageId, 1)}
                                      disabled={index === editor.state.pageOrder.length - 1}
                                    >
                                      ↓
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={editor.duplicateActivePage}
                                      disabled={!selectedPage}
                                    >
                                      Copy
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => editor.removePage(pageId)}
                                      disabled={editor.state.pageOrder.length <= 1}
                                    >
                                      Delete
                                    </Button>
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
                                    Single-page mode
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                  </div>
                </TabsContent>
              </Tabs>
            </aside>
          ) : (
            <div />
          )}

          <div
            ref={stageWrapRef}
            className={`design-stage-scroll min-h-0 min-w-0 overflow-auto bg-muted/30 px-6 pb-6 ${primary?.kind === "text" ? "pt-16" : "pt-6"}`}
            onMouseDown={handleStageWrapMouseDown}
          >
            <div
              ref={stagePanLayerRef}
              className="flex min-h-full items-start justify-center"
              style={{
                transform: `translate(${editor.state.viewport.panX}px, ${editor.state.viewport.panY}px)`,
                transformOrigin: "top left",
                cursor: stageCursor,
              }}
            >
              <div className="relative">
                {editor.state.documentSettings.showGuides ? (
                  <CanvasRuler
                    pageWidth={activePage.width}
                    pageHeight={activePage.height}
                    scale={zoom}
                    guides={activePage.guides ?? []}
                    onAddGuide={(axis, value) => {
                      const guides = [
                        ...(activePage.guides ?? []),
                        { guideId: nanoid(), axis, value },
                      ];
                      editor.updatePage(activePage.pageId, { guides });
                    }}
                    onRemoveGuide={(guideId) => {
                      const guides = (activePage.guides ?? []).filter((g) => g.guideId !== guideId);
                      editor.updatePage(activePage.pageId, { guides });
                    }}
                  />
                ) : null}
                <DesignStage
                  page={activePage}
                  elements={editor.activeElements}
                  scale={zoom}
                  tool={tool}
                  spacePressed={spacePressed}
                  marqueeRect={marqueeRect}
                  selectedIds={editor.state.selection.ids}
                  primaryId={editor.state.selection.primaryId}
                  snapLines={editor.state.viewport.snapLines}
                  snapTargetIds={snapTargetIds}
                  showSafeZone={editor.state.documentSettings.showSafeZone}
                  showGrid={editor.state.documentSettings.showGrid}
                  showGuides={editor.state.documentSettings.showGuides}
                  snapToGrid={editor.state.documentSettings.snapToGrid}
                  gridSize={editor.state.documentSettings.gridSize}
                  renderCanvasContextMenu={renderCanvasContextMenu}
                  renderElementContextMenu={renderElementContextMenu}
                  editingTextId={editingTextId}
                  editingTextValue={editingTextValue}
                  onEditingTextValueChange={setEditingTextValue}
                  onStartTextEdit={startInlineTextEdit}
                  onCommitTextEdit={commitInlineTextEdit}
                  onCancelTextEdit={cancelInlineTextEdit}
                  onStageMouseDown={handleStageBackgroundMouseDown}
                  onSelect={(elementId, additive) => {
                    if (!elementId) {
                      editor.setSelection([]);
                      return;
                    }
                    const existing = editor.state.selection.ids;
                    if (additive) {
                      if (existing.includes(elementId)) {
                        const nextIds = existing.filter((id) => id !== elementId);
                        editor.setSelection(nextIds, nextIds.at(-1) ?? null);
                      } else {
                        editor.setSelection([...existing, elementId], elementId);
                      }
                      return;
                    }
                    editor.setSelection([elementId], elementId);
                  }}
                  onMove={({ elementId, moveIds, originById, nextPrimaryX, nextPrimaryY }) => {
                    beginElementTransform();
                    const primaryTarget =
                      editor.activeElements.find((item) => item.elementId === elementId) ?? null;
                    const primaryOrigin = originById[elementId];
                    if (!primaryTarget || !primaryOrigin) return;
                    if (editor.state.documentSettings.snapToGrid) {
                      const grid = editor.state.documentSettings.gridSize;
                      nextPrimaryX = Math.round(nextPrimaryX / grid) * grid;
                      nextPrimaryY = Math.round(nextPrimaryY / grid) * grid;
                    }
                    const snapped = snapMove(
                      activePage,
                      primaryTarget,
                      nextPrimaryX,
                      nextPrimaryY,
                      editor.activeElements.filter(
                        (element) => !moveIds.includes(element.elementId),
                      ),
                      zoom,
                    );
                    const appliedDx = snapped.x - primaryOrigin.x;
                    const appliedDy = snapped.y - primaryOrigin.y;
                    editor.setSnapLines(snapped.snapLines);
                    setSnapTargetIds(snapped.snapTargetIds);
                    // Smart spacing
                    const movedEl = { ...primaryTarget, x: snapped.x, y: snapped.y };
                    const others = editor.activeElements.filter(
                      (e) => !moveIds.includes(e.elementId) && !e.hidden,
                    );
                    setSpacingLines(computeSpacingLines(movedEl, others));
                    editor.updateElements(moveIds, (element) => ({
                      x: clamp(
                        (originById[element.elementId]?.x ?? element.x) + appliedDx,
                        -activePage.width,
                        activePage.width * 2,
                      ),
                      y: clamp(
                        (originById[element.elementId]?.y ?? element.y) + appliedDy,
                        -activePage.height,
                        activePage.height * 2,
                      ),
                    }));
                  }}
                  onMoveCommit={() => {
                    endElementTransform();
                    editor.setSnapLines([]);
                    setSnapTargetIds([]);
                    setSpacingLines([]);
                  }}
                  onResize={({ elementId, patch, snapLines, snapTargetIds }) => {
                    beginElementTransform();
                    editor.updateElements([elementId], patch);
                    editor.setSnapLines(snapLines ?? []);
                    setSnapTargetIds(snapTargetIds ?? []);
                  }}
                  onResizeMany={(payloads) => {
                    beginElementTransform();
                    if (payloads.length === 0) return;
                    const patchById = new Map(
                      payloads.map((payload) => [payload.elementId, payload.patch]),
                    );
                    editor.updateElements(
                      payloads.map((payload) => payload.elementId),
                      (element) => patchById.get(element.elementId) ?? {},
                    );
                  }}
                  onResizeCommit={() => {
                    endElementTransform();
                    editor.setSnapLines([]);
                    setSnapTargetIds([]);
                  }}
                  availableFontFamilies={availableFontFamilies}
                  onUpdateElementStyle={(elementId, patch) =>
                    editor.updateElements(
                      [elementId],
                      {
                        style: {
                          ...(editor.activeElements.find((e) => e.elementId === elementId)?.style ??
                            {}),
                          ...patch,
                        },
                      } as Partial<DesignElement>,
                      { history: false },
                    )
                  }
                  cropTargetId={cropTargetId}
                  onStartImageCrop={(elementId) => setCropTargetId(elementId)}
                  onCommitCrop={(elementId, crop) => {
                    editor.updateElements([elementId], { crop }, { history: false });
                    setCropTargetId(null);
                  }}
                  onCancelCrop={() => setCropTargetId(null)}
                  spacingLines={spacingLines}
                />
              </div>
            </div>
          </div>

          {rightOpen ? (
            <aside className="min-h-0 min-w-0 overflow-hidden border-l">
              <Tabs value={rightTab} onValueChange={setRightTab} className="flex h-full flex-col">
                <TabsList className="mx-4 mt-4 grid grid-cols-3">
                  <TabsTrigger value="properties">Thuộc tính</TabsTrigger>
                  <TabsTrigger value="layers">Lớp</TabsTrigger>
                  <TabsTrigger value="brand">Brand</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="properties"
                  className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
                >
                  <div className="flex flex-col gap-3 pt-4">
                    <InspectorSection
                      title="Trang"
                      action={
                        <Button
                          size="sm"
                          variant={editor.state.documentSettings.snapToGrid ? "default" : "outline"}
                          className="h-7 gap-1.5 px-2 text-[11px]"
                          onClick={() =>
                            editor.updateDocumentSettings({
                              snapToGrid: !editor.state.documentSettings.snapToGrid,
                            })
                          }
                        >
                          <Grid2X2 className="size-3.5" />
                          Snap {editor.state.documentSettings.snapToGrid ? "On" : "Off"}
                        </Button>
                      }
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <NumberField
                          label="W"
                          value={activePage.width}
                          onChange={(value) =>
                            editor.updatePage(activePage.pageId, { width: value })
                          }
                        />
                        <NumberField
                          label="H"
                          value={activePage.height}
                          onChange={(value) =>
                            editor.updatePage(activePage.pageId, { height: value })
                          }
                        />
                      </div>
                      <CompactColorControl
                        label="Nền"
                        value={activePage.background ?? "#ffffff"}
                        onChange={(color) =>
                          editor.updatePage(activePage.pageId, { background: color })
                        }
                      />
                    </InspectorSection>

                    {primary ? (
                      <div className="flex flex-col gap-3">
                        <InspectorSection
                          title="Element"
                          action={
                            <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                              {selected.length > 1 ? `${selected.length} items` : primary.kind}
                            </span>
                          }
                        >
                          <div className="flex flex-col gap-2">
                            <Label className="text-[11px] font-medium text-muted-foreground">
                              Tên layer
                            </Label>
                            <Input
                              value={primary.name ?? ""}
                              onChange={(event) =>
                                editor.updateElements(
                                  [primary.elementId],
                                  { name: event.target.value },
                                  { history: false },
                                )
                              }
                              placeholder="Layer name"
                              className="h-8"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <NumberField
                              label="X"
                              value={primary.x}
                              onChange={(value) =>
                                editor.updateSelectedElements({ x: value }, { history: false })
                              }
                            />
                            <NumberField
                              label="Y"
                              value={primary.y}
                              onChange={(value) =>
                                editor.updateSelectedElements({ y: value }, { history: false })
                              }
                            />
                            <NumberField
                              label="W"
                              value={primary.width}
                              onChange={(value) =>
                                editor.updateSelectedElements({ width: value }, { history: false })
                              }
                            />
                            <NumberField
                              label="H"
                              value={primary.height}
                              onChange={(value) =>
                                editor.updateSelectedElements({ height: value }, { history: false })
                              }
                            />
                          </div>
                          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                            <NumberField
                              label="Rotation"
                              value={primary.rotation ?? 0}
                              suffix="°"
                              onChange={(value) =>
                                editor.updateSelectedElements(
                                  { rotation: value },
                                  { history: false },
                                )
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-10 px-0"
                              onClick={() =>
                                editor.updateSelectedElements(
                                  { rotation: (primary.rotation ?? 0) - 15 },
                                  { history: false },
                                )
                              }
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-10 px-0"
                              onClick={() =>
                                editor.updateSelectedElements(
                                  { rotation: (primary.rotation ?? 0) + 15 },
                                  { history: false },
                                )
                              }
                            >
                              <RotateCw className="size-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" variant="outline" onClick={editor.copySelection}>
                              <Copy className="mr-2 size-4" /> Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editor.duplicateSelection()}
                            >
                              <Layers className="mr-2 size-4" /> Duplicate
                            </Button>
                          </div>
                        </InspectorSection>

                        <InspectorSection title="Layer">
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("front")}
                            >
                              Lên cùng
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("forward")}
                            >
                              Lên 1 lớp
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("backward")}
                            >
                              Xuống 1 lớp
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("back")}
                            >
                              Xuống cùng
                            </Button>
                          </div>
                        </InspectorSection>

                        {primary.kind === "text" ? (
                          <InspectorSection title="Text">
                            <div className="text-[11px] text-muted-foreground">
                              Double-click trên canvas để sửa nhanh.
                            </div>
                            <textarea
                              value={primary.text}
                              onChange={(event) =>
                                editor.updateElements(
                                  [primary.elementId],
                                  { text: event.target.value } as Partial<DesignElement>,
                                  { history: false },
                                )
                              }
                              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <NumberField
                                label="Font size"
                                value={Number(primary.style?.fontSize ?? 48)}
                                onChange={(value) =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: { ...(primary.style ?? {}), fontSize: value },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              />
                              <NumberField
                                label="Weight"
                                value={Number(primary.style?.fontWeight ?? 700)}
                                onChange={(value) =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: { ...(primary.style ?? {}), fontWeight: value },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Font family</Label>
                              <Select
                                value={String(primary.style?.fontFamily ?? "Be Vietnam Pro")}
                                onValueChange={(value) =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: { ...(primary.style ?? {}), fontFamily: value },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableFontFamilies.map((family) => (
                                    <SelectItem key={family} value={family}>
                                      {family}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <CompactColorControl
                              label="Màu chữ"
                              value={primary.style?.color ?? "#0f172a"}
                              onChange={(color) =>
                                editor.updateElements(
                                  [primary.elementId],
                                  {
                                    style: {
                                      ...(primary.style ?? {}),
                                      color,
                                    },
                                  } as Partial<DesignElement>,
                                  { history: false },
                                )
                              }
                            />
                            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs">Text outline</Label>
                                <Button
                                  size="sm"
                                  variant={
                                    Number(primary.style?.textStrokeWidth ?? 0) > 0
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() => {
                                    const enabled = Number(primary.style?.textStrokeWidth ?? 0) > 0;
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textStrokeWidth: enabled ? 0 : 2,
                                          textStrokeColor:
                                            primary.style?.textStrokeColor ?? "#ffffff",
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    );
                                  }}
                                >
                                  {Number(primary.style?.textStrokeWidth ?? 0) > 0 ? "On" : "Off"}
                                </Button>
                              </div>
                              <div className="grid grid-cols-[1fr_120px] items-end gap-2">
                                <NumberField
                                  label="Width"
                                  value={Number(primary.style?.textStrokeWidth ?? 0)}
                                  onChange={(value) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textStrokeWidth: Math.max(0, value),
                                          textStrokeColor:
                                            primary.style?.textStrokeColor ?? "#ffffff",
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                                <CompactColorControl
                                  label="Color"
                                  value={primary.style?.textStrokeColor ?? "#ffffff"}
                                  onChange={(color) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textStrokeColor: color,
                                          textStrokeWidth:
                                            Number(primary.style?.textStrokeWidth ?? 0) > 0
                                              ? primary.style?.textStrokeWidth
                                              : 2,
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs">Text shadow</Label>
                                <Button
                                  size="sm"
                                  variant={primary.style?.textShadowColor ? "default" : "outline"}
                                  onClick={() => {
                                    const enabled = !!primary.style?.textShadowColor;
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textShadowColor: enabled ? undefined : "#000000",
                                          textShadowBlur: enabled ? undefined : 8,
                                          textShadowX: enabled ? undefined : 2,
                                          textShadowY: enabled ? undefined : 4,
                                          textShadow: enabled
                                            ? undefined
                                            : primary.style?.textShadow,
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    );
                                  }}
                                >
                                  {primary.style?.textShadowColor ? "On" : "Off"}
                                </Button>
                              </div>
                              {primary.style?.textShadowColor ? (
                                <>
                                  <CompactColorControl
                                    label="Color"
                                    value={primary.style.textShadowColor}
                                    onChange={(color) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: {
                                            ...(primary.style ?? {}),
                                            textShadowColor: color,
                                          },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <Label className="text-xs text-muted-foreground">Blur</Label>
                                      <span className="text-[11px] tabular-nums text-muted-foreground">
                                        {Number(primary.style?.textShadowBlur ?? 8)}px
                                      </span>
                                    </div>
                                    <Slider
                                      value={[Number(primary.style?.textShadowBlur ?? 8)]}
                                      min={0}
                                      max={40}
                                      step={1}
                                      onValueChange={(value) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              textShadowBlur: value[0],
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <NumberField
                                      label="X"
                                      value={Number(primary.style?.textShadowX ?? 2)}
                                      onChange={(value) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              textShadowX: value,
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                    />
                                    <NumberField
                                      label="Y"
                                      value={Number(primary.style?.textShadowY ?? 4)}
                                      onChange={(value) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              textShadowY: value,
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                    />
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </InspectorSection>
                        ) : null}

                        {primary.kind === "image" || primary.kind === "shape" ? (
                          <InspectorSection title="Visual">
                            <div className="space-y-2">
                              <Label className="text-xs">Border radius</Label>
                              <Slider
                                value={[Number(primary.style?.borderRadius ?? 0)]}
                                min={0}
                                max={160}
                                step={2}
                                onValueChange={(value) =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: { ...(primary.style ?? {}), borderRadius: value[0] },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              />
                            </div>
                            {primary.kind === "shape" ? (
                              <CompactColorControl
                                label="Fill"
                                value={primary.style?.fill ?? "#f97316"}
                                onChange={(color) =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: {
                                        ...(primary.style ?? {}),
                                        fill: color,
                                      },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              />
                            ) : null}
                            {primary.kind === "image" ? (
                              <div className="space-y-2">
                                <Label className="text-xs">Fit</Label>
                                <Select
                                  value={primary.style?.fit ?? "cover"}
                                  onValueChange={(value) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          fit: value as "cover" | "contain" | "stretch",
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cover">cover</SelectItem>
                                    <SelectItem value="contain">contain</SelectItem>
                                    <SelectItem value="stretch">stretch</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                            {primary.kind === "image" ? (
                              <div className="space-y-3 border-t pt-3">
                                <Label className="text-xs uppercase text-muted-foreground">
                                  Filters
                                </Label>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Brightness</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {Math.round((primary.style?.brightness ?? 1) * 100)}%
                                    </span>
                                  </div>
                                  <Slider
                                    value={[(primary.style?.brightness ?? 1) * 100]}
                                    min={0}
                                    max={200}
                                    step={5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), brightness: v / 100 },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Contrast</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {Math.round((primary.style?.contrast ?? 1) * 100)}%
                                    </span>
                                  </div>
                                  <Slider
                                    value={[(primary.style?.contrast ?? 1) * 100]}
                                    min={0}
                                    max={200}
                                    step={5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), contrast: v / 100 },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Saturate</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {Math.round((primary.style?.saturate ?? 1) * 100)}%
                                    </span>
                                  </div>
                                  <Slider
                                    value={[(primary.style?.saturate ?? 1) * 100]}
                                    min={0}
                                    max={200}
                                    step={5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), saturate: v / 100 },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Blur</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {primary.style?.blur ?? 0}px
                                    </span>
                                  </div>
                                  <Slider
                                    value={[primary.style?.blur ?? 0]}
                                    min={0}
                                    max={20}
                                    step={0.5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), blur: v },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          brightness: 1,
                                          contrast: 1,
                                          saturate: 1,
                                          blur: 0,
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                >
                                  Reset filters
                                </Button>
                              </div>
                            ) : null}
                          </InspectorSection>
                        ) : null}

                        {/* Gradient fill — available for shape + text */}
                        {primary.kind === "shape" || primary.kind === "text" ? (
                          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs">Gradient</Label>
                              <Button
                                size="sm"
                                variant={primary.style?.gradientEnabled ? "default" : "outline"}
                                onClick={() =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: {
                                        ...(primary.style ?? {}),
                                        gradientEnabled: !primary.style?.gradientEnabled,
                                      },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              >
                                {primary.style?.gradientEnabled ? "On" : "Off"}
                              </Button>
                            </div>
                            {primary.style?.gradientEnabled ? (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">From</Label>
                                    <Input
                                      type="color"
                                      value={primary.style?.gradientFrom ?? "#f97316"}
                                      onChange={(event) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              gradientFrom: event.target.value,
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                      className="h-8 p-1"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">To</Label>
                                    <Input
                                      type="color"
                                      value={primary.style?.gradientTo ?? "#ec4899"}
                                      onChange={(event) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              gradientTo: event.target.value,
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                      className="h-8 p-1"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs text-muted-foreground">Angle</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {primary.style?.gradientAngle ?? 90}°
                                    </span>
                                  </div>
                                  <Slider
                                    value={[primary.style?.gradientAngle ?? 90]}
                                    min={0}
                                    max={360}
                                    step={15}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: {
                                            ...(primary.style ?? {}),
                                            gradientAngle: v,
                                          },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Shadow controls — available for all elements */}
                        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Shadow</Label>
                            <Button
                              size="sm"
                              variant={primary.style?.shadowColor ? "default" : "outline"}
                              onClick={() =>
                                editor.updateElements(
                                  [primary.elementId],
                                  {
                                    style: {
                                      ...(primary.style ?? {}),
                                      shadowColor: primary.style?.shadowColor
                                        ? undefined
                                        : "rgba(0,0,0,0.25)",
                                      shadowBlur: primary.style?.shadowBlur ?? 8,
                                      shadowX: primary.style?.shadowX ?? 0,
                                      shadowY: primary.style?.shadowY ?? 4,
                                    },
                                  } as Partial<DesignElement>,
                                  { history: false },
                                )
                              }
                            >
                              {primary.style?.shadowColor ? "On" : "Off"}
                            </Button>
                          </div>
                          {primary.style?.shadowColor ? (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Color</Label>
                                <Input
                                  type="color"
                                  value={primary.style.shadowColor ?? "rgba(0,0,0,0.25)"}
                                  onChange={(event) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          shadowColor: event.target.value,
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                  className="h-8 p-1"
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs text-muted-foreground">Blur</Label>
                                  <span className="text-[10px] tabular-nums text-muted-foreground">
                                    {primary.style.shadowBlur ?? 8}px
                                  </span>
                                </div>
                                <Slider
                                  value={[primary.style.shadowBlur ?? 8]}
                                  min={0}
                                  max={40}
                                  step={1}
                                  onValueChange={([v]) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: { ...(primary.style ?? {}), shadowBlur: v },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <NumberField
                                  label="X"
                                  value={primary.style.shadowX ?? 0}
                                  onChange={(v) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: { ...(primary.style ?? {}), shadowX: v },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                                <NumberField
                                  label="Y"
                                  value={primary.style.shadowY ?? 4}
                                  onChange={(v) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: { ...(primary.style ?? {}), shadowY: v },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                        Chọn một element để chỉnh thuộc tính.
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="layers" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-2 pt-4">
                    {layerTree(editor.activeElements).map(({ element, depth }) => {
                      const selectedLayer = editor.state.selection.ids.includes(element.elementId);
                      return (
                        <div
                          key={element.elementId}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selectedLayer ? "border-primary bg-primary/5" : "bg-card"}`}
                          style={{ paddingLeft: 12 + depth * 18 }}
                        >
                          <button
                            className="flex-1 truncate text-left"
                            onClick={() =>
                              editor.setSelection([element.elementId], element.elementId)
                            }
                          >
                            {element.name ?? element.kind}
                          </button>
                          <button
                            onClick={() =>
                              editor.updateElements(
                                [element.elementId],
                                { hidden: !element.hidden },
                                { history: false },
                              )
                            }
                          >
                            {element.hidden ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              editor.updateElements(
                                [element.elementId],
                                { locked: !element.locked },
                                { history: false },
                              )
                            }
                          >
                            {element.locked ? (
                              <Lock className="size-4" />
                            ) : (
                              <LockOpen className="size-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="brand" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-4 pt-4">
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={createBrandKit}>
                        <Plus className="mr-2 size-4" /> New kit
                      </Button>
                      <Button variant="outline" onClick={uploadFont}>
                        <Upload className="mr-2 size-4" /> Upload font
                      </Button>
                      <Button variant="outline" onClick={() => uploadAsset("logo")}>
                        <Upload className="mr-2 size-4" /> Upload logo
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-muted-foreground">
                        Current brand kit
                      </Label>
                      <Select
                        value={currentBrandKit?.brandKitId ?? "__none__"}
                        onValueChange={(value) =>
                          persistBrandKitSelection(value === "__none__" ? undefined : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chưa chọn brand kit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Không dùng</SelectItem>
                          {brandKits.map((kit) => (
                            <SelectItem key={kit.brandKitId} value={kit.brandKitId}>
                              {kit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {currentBrandKit ? (
                      <div className="space-y-4 rounded-xl border bg-card p-3">
                        <Input
                          value={currentBrandKit.name}
                          onChange={(event) => updateBrandKit({ name: event.target.value })}
                        />
                        <div>
                          <Label className="text-xs uppercase text-muted-foreground">Palette</Label>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {currentBrandKit.colors.map((color, index) => (
                              <button
                                key={`${color}-${index}`}
                                className="size-10 rounded-full border"
                                style={{ background: color }}
                                onClick={() => {
                                  if (!primary) return;
                                  const styleKey = primary.kind === "text" ? "color" : "fill";
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: { ...(primary.style ?? {}), [styleKey]: color },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  );
                                }}
                              />
                            ))}
                            <label className="flex size-10 cursor-pointer items-center justify-center rounded-full border bg-muted">
                              <Plus className="size-4" />
                              <input
                                type="color"
                                className="sr-only"
                                onChange={(event) =>
                                  updateBrandKit({
                                    colors: [...currentBrandKit.colors, event.target.value],
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs uppercase text-muted-foreground">Fonts</Label>
                          <div className="mt-3 space-y-2">
                            {fontAssets.map((fontAsset) => {
                              const selectedFont = currentBrandKit.fontAssetIds.includes(
                                fontAsset.fontAssetId,
                              );
                              return (
                                <button
                                  key={fontAsset.fontAssetId}
                                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${selectedFont ? "border-primary bg-primary/5" : ""}`}
                                  onClick={() =>
                                    updateBrandKit({
                                      fontAssetIds: selectedFont
                                        ? currentBrandKit.fontAssetIds.filter(
                                            (id) => id !== fontAsset.fontAssetId,
                                          )
                                        : [...currentBrandKit.fontAssetIds, fontAsset.fontAssetId],
                                    })
                                  }
                                >
                                  <span style={{ fontFamily: fontAsset.family }}>
                                    {fontAsset.family}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {selectedFont ? "On" : "Off"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                        Tạo Brand Kit để lưu palette, font và logo cho editor.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </aside>
          ) : (
            <div />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />;
}

function DesignStage({
  page,
  elements,
  scale,
  tool,
  spacePressed,
  marqueeRect,
  selectedIds,
  primaryId,
  snapLines,
  snapTargetIds,
  showSafeZone,
  showGrid,
  showGuides,
  snapToGrid,
  gridSize: documentGridSize,
  renderCanvasContextMenu,
  renderElementContextMenu,
  editingTextId,
  editingTextValue,
  onEditingTextValueChange,
  onStartTextEdit,
  onCommitTextEdit,
  onCancelTextEdit,
  onStageMouseDown,
  onSelect,
  onMove,
  onMoveCommit,
  onResize,
  onResizeMany,
  onResizeCommit,
  availableFontFamilies,
  onUpdateElementStyle,
  cropTargetId,
  onStartImageCrop,
  onCommitCrop,
  onCancelCrop,
  spacingLines,
}: {
  page: DesignPage;
  elements: DesignElement[];
  scale: number;
  tool: DesignTool;
  spacePressed: boolean;
  marqueeRect: { x: number; y: number; width: number; height: number } | null;
  selectedIds: string[];
  primaryId: string | null;
  snapLines: SnapLine[];
  snapTargetIds: string[];
  showSafeZone: boolean;
  showGrid: boolean;
  showGuides: boolean;
  snapToGrid: boolean;
  gridSize: number;
  renderCanvasContextMenu: () => React.ReactNode;
  renderElementContextMenu: (element: DesignElement) => React.ReactNode;
  editingTextId: string | null;
  editingTextValue: string;
  onEditingTextValueChange: (value: string) => void;
  onStartTextEdit: (elementId: string) => void;
  onCommitTextEdit: () => void;
  onCancelTextEdit: () => void;
  onStageMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSelect: (elementId: string | null, additive: boolean) => void;
  onMove: (payload: MovePayload) => void;
  onMoveCommit: () => void;
  onResize: (payload: ResizePayload) => void;
  onResizeMany: (payloads: ResizePayload[]) => void;
  onResizeCommit: () => void;
  availableFontFamilies: string[];
  onUpdateElementStyle: (elementId: string, patch: Partial<ElementStyle>) => void;
  cropTargetId: string | null;
  onStartImageCrop: (elementId: string) => void;
  onCommitCrop: (elementId: string, crop: ImageCrop) => void;
  onCancelCrop: () => void;
  spacingLines: Array<{ axis: "x" | "y"; from: number; to: number; pos: number; gap: number }>;
}) {
  const toolIsPan = isPanToolActive(tool, spacePressed);
  const guideColor = "rgba(56,189,248,0.9)";
  const gridSize = 40 * scale;
  const gridBackground = showGrid
    ? {
        backgroundImage:
          "linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)",
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }
    : undefined;
  const [previewSnapLines, setPreviewSnapLines] = useState<SnapLine[]>([]);
  const [previewSnapTargetIds, setPreviewSnapTargetIds] = useState<string[]>([]);
  const previewSnapSignatureRef = useRef("");
  const activeSnapLines = previewSnapLines.length ? previewSnapLines : snapLines;
  const activeSnapTargetIds = previewSnapTargetIds.length ? previewSnapTargetIds : snapTargetIds;
  const setLiveSnapState = useCallback((lines: SnapLine[], targetIds: string[]) => {
    const signature = `${lines
      .map((line) => `${line.axis}:${Math.round(line.value * 100) / 100}`)
      .join("|")}::${targetIds.join("|")}`;
    if (previewSnapSignatureRef.current === signature) return;
    previewSnapSignatureRef.current = signature;
    setPreviewSnapLines(lines);
    setPreviewSnapTargetIds(targetIds);
  }, []);
  const clearPreviewSnapState = useCallback(() => {
    previewSnapSignatureRef.current = "";
    setPreviewSnapLines([]);
    setPreviewSnapTargetIds([]);
  }, []);
  const bounds = getSelectionBounds(
    selectedIds
      .map((id) => elements.find((element) => element.elementId === id))
      .filter((element): element is DesignElement => !!element),
  );

  return (
    <div className="relative bg-transparent p-0 shadow-none">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="relative overflow-visible bg-background shadow-sm"
            data-design-canvas
            style={{ width: page.width * scale, height: page.height * scale, ...gridBackground }}
            onMouseDown={onStageMouseDown}
          >
            {showGuides
              ? page.guides?.map((guide) => (
                  <div
                    key={guide.guideId}
                    className="pointer-events-none absolute"
                    style={{
                      left: guide.axis === "x" ? guide.value * scale : 0,
                      top: guide.axis === "y" ? guide.value * scale : 0,
                      width: guide.axis === "x" ? 1 : "100%",
                      height: guide.axis === "y" ? 1 : "100%",
                      background: guideColor,
                      opacity: 0.9,
                    }}
                  />
                ))
              : null}
            {marqueeRect ? (
              <div
                className="pointer-events-none absolute border border-primary/80 bg-primary/10"
                style={{
                  left: marqueeRect.x * scale,
                  top: marqueeRect.y * scale,
                  width: marqueeRect.width * scale,
                  height: marqueeRect.height * scale,
                }}
              />
            ) : null}
            {toolIsPan ? (
              <div className="pointer-events-none absolute right-3 top-3 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
                Pan mode
              </div>
            ) : null}
            <div className="pointer-events-none absolute left-3 top-3 rounded bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
              Select: V · Pan: H / Space · Zoom: Ctrl/Cmd + Wheel
            </div>
            <div
              className="absolute inset-0"
              style={{ width: page.width * scale, height: page.height * scale }}
            >
              <div className="pointer-events-none absolute inset-0">
                <DesignRenderer
                  page={page}
                  elements={elements}
                  scale={scale}
                  suppressElementIds={editingTextId ? [editingTextId] : []}
                  showGuides={showGuides}
                />
              </div>
              {showSafeZone ? (
                <LayoutGuides
                  width={page.width}
                  height={page.height}
                  scale={scale}
                  showBleed={false}
                  showTrim={false}
                  showSafeZone
                />
              ) : null}

              {activeSnapLines.map((line, index) => {
                const isCenterLine =
                  line.axis === "x"
                    ? Math.abs(line.value - page.width / 2) < 0.5
                    : Math.abs(line.value - page.height / 2) < 0.5;
                return (
                  <div
                    key={`${line.axis}-${line.value}-${index}`}
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      zIndex: 2147483630,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: line.axis === "x" ? line.value * scale : 0,
                        top: line.axis === "y" ? line.value * scale : 0,
                        width: line.axis === "x" ? 2 : "100%",
                        height: line.axis === "y" ? 2 : "100%",
                        background: isCenterLine ? "rgba(37,99,235,0.95)" : "rgba(236,72,153,0.95)",
                        boxShadow: isCenterLine
                          ? "0 0 0 1px rgba(255,255,255,0.9), 0 0 12px rgba(37,99,235,0.35)"
                          : "0 0 0 1px rgba(255,255,255,0.85), 0 0 12px rgba(236,72,153,0.3)",
                      }}
                    />
                  </div>
                );
              })}

              <SmartSpacing lines={spacingLines} scale={scale} />

              {elements
                .filter((element) => !element.hidden)
                .slice()
                .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                .map((element) => {
                  const selected = selectedIds.includes(element.elementId);
                  const primary = primaryId === element.elementId;
                  const isSnapTarget = activeSnapTargetIds.includes(element.elementId);
                  const isEditingText =
                    editingTextId === element.elementId && element.kind === "text";
                  const isCropTarget =
                    cropTargetId === element.elementId && element.kind === "image";
                  const textEditorStyle =
                    element.kind === "text" ? buildTextStyle(element.style, scale) : undefined;
                  const visibleBounds =
                    element.kind === "text" || element.kind === "image" || element.kind === "shape";
                  const elementLabel =
                    element.kind === "text"
                      ? "Text"
                      : element.kind === "image"
                        ? "Image"
                        : element.kind === "shape"
                          ? "Shape"
                          : "Group";

                  const overlay = (
                    <div
                      data-design-element
                      data-design-element-id={element.elementId}
                      onContextMenu={() => {
                        if (!selected) onSelect(element.elementId, false);
                      }}
                      onDoubleClick={(event) => {
                        if (element.kind === "text") {
                          event.stopPropagation();
                          onStartTextEdit(element.elementId);
                        } else if (element.kind === "image") {
                          event.stopPropagation();
                          onStartImageCrop(element.elementId);
                        }
                      }}
                      onMouseDown={(event) => {
                        if (isEditingText || toolIsPan) return;
                        event.stopPropagation();
                        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
                        onSelect(element.elementId, additive);
                        if (additive || element.locked) return;
                        const canvas = (event.currentTarget as HTMLElement).closest(
                          "[data-design-canvas]",
                        ) as HTMLElement | null;
                        const startPoint = getCanvasPoint(
                          canvas,
                          scale,
                          event.clientX,
                          event.clientY,
                          0,
                          0,
                        );
                        const baseIds = selectedIds.includes(element.elementId)
                          ? selectedIds
                          : [element.elementId];
                        const moveIds = new Set<string>(baseIds);
                        elements.forEach((entry) => {
                          if (baseIds.includes(entry.elementId) && entry.kind === "group") {
                            getDescendantIds(elements, entry.elementId).forEach((id) =>
                              moveIds.add(id),
                            );
                          }
                        });
                        const moveIdsArray = Array.from(moveIds);
                        const nonMovingElements = elements.filter(
                          (item) => !moveIds.has(item.elementId),
                        );
                        const originById = Object.fromEntries(
                          moveIdsArray
                            .map((id) => elements.find((entry) => entry.elementId === id))
                            .filter((entry): entry is DesignElement => !!entry)
                            .map((entry) => [entry.elementId, { x: entry.x, y: entry.y }]),
                        );
                        const previewCache = createPreviewNodeCache(canvas, moveIdsArray);
                        const pointerOffsetX = startPoint.x - element.x;
                        const pointerOffsetY = startPoint.y - element.y;
                        let latestMovePayload: MovePayload | null = null;
                        const scheduleMovePreview = createRafScheduler((payload: MovePayload) => {
                          const primaryOrigin = payload.originById[payload.elementId];
                          if (!primaryOrigin) return;
                          const primaryTarget =
                            elements.find((item) => item.elementId === payload.elementId) ?? null;
                          if (!primaryTarget) return;
                          let nextPrimaryX = payload.nextPrimaryX;
                          let nextPrimaryY = payload.nextPrimaryY;
                          if (snapToGrid) {
                            nextPrimaryX =
                              Math.round(nextPrimaryX / documentGridSize) * documentGridSize;
                            nextPrimaryY =
                              Math.round(nextPrimaryY / documentGridSize) * documentGridSize;
                          }
                          const snapped = snapMove(
                            page,
                            primaryTarget,
                            nextPrimaryX,
                            nextPrimaryY,
                            nonMovingElements,
                            scale,
                          );
                          latestMovePayload = {
                            ...payload,
                            nextPrimaryX: snapped.x,
                            nextPrimaryY: snapped.y,
                          };
                          setLiveSnapState(snapped.snapLines, snapped.snapTargetIds);
                          applyMovePreview(
                            canvas,
                            payload.moveIds,
                            snapped.x - primaryOrigin.x,
                            snapped.y - primaryOrigin.y,
                            scale,
                            previewCache,
                          );
                        });
                        const onMouseMove = (moveEvent: MouseEvent) => {
                          const point = getCanvasPoint(
                            canvas,
                            scale,
                            moveEvent.clientX,
                            moveEvent.clientY,
                            0,
                            0,
                          );
                          let nextPrimaryX = point.x - pointerOffsetX;
                          let nextPrimaryY = point.y - pointerOffsetY;
                          if (moveEvent.shiftKey) {
                            const deltaX = nextPrimaryX - originById[element.elementId].x;
                            const deltaY = nextPrimaryY - originById[element.elementId].y;
                            if (Math.abs(deltaX) >= Math.abs(deltaY))
                              nextPrimaryY = originById[element.elementId].y;
                            else nextPrimaryX = originById[element.elementId].x;
                          }
                          scheduleMovePreview({
                            elementId: element.elementId,
                            moveIds: moveIdsArray,
                            originById,
                            nextPrimaryX,
                            nextPrimaryY,
                          });
                        };
                        const onMouseUp = () => {
                          window.removeEventListener("mousemove", onMouseMove);
                          window.removeEventListener("mouseup", onMouseUp);
                          scheduleMovePreview.flush();
                          if (latestMovePayload) onMove(latestMovePayload);
                          onMoveCommit();
                          clearPreviewSnapState();
                          window.requestAnimationFrame(() =>
                            resetPreviewMarkers(canvas, { restoreTransform: true }),
                          );
                        };
                        window.addEventListener("mousemove", onMouseMove);
                        window.addEventListener("mouseup", onMouseUp);
                      }}
                      style={{
                        position: "absolute",
                        left: element.x * scale,
                        top: element.y * scale,
                        width: element.width * scale,
                        height: element.height * scale,
                        border: isSnapTarget
                          ? "2px solid rgba(236,72,153,0.9)"
                          : selected
                            ? "1px solid rgba(124,58,237,0.9)"
                            : "1px solid transparent",
                        background: isSnapTarget
                          ? "rgba(236,72,153,0.08)"
                          : selected
                            ? "rgba(124,58,237,0.025)"
                            : "transparent",
                        cursor: element.locked ? "default" : "move",
                        boxSizing: "border-box",
                        boxShadow: selected
                          ? "0 0 0 1px rgba(124,58,237,0.16)"
                          : undefined,
                      }}
                    >
                      {visibleBounds && (selected || primary) && !isEditingText && !isCropTarget ? (
                        <>
                          <div
                            className="pointer-events-none absolute left-1 top-1 z-20 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-80"
                            style={{
                              transform: `scale(${1 / Math.max(scale, 0.6)})`,
                              transformOrigin: "top left",
                            }}
                          >
                            {elementLabel}
                          </div>
                          {element.kind === "image" ? (
                            <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(135deg,rgba(37,99,235,0.08)_25%,transparent_25%,transparent_50%,rgba(37,99,235,0.08)_50%,rgba(37,99,235,0.08)_75%,transparent_75%,transparent)] bg-[length:20px_20px] opacity-50" />
                          ) : null}
                        </>
                      ) : null}
                      {isCropTarget && element.kind === "image" ? (
                        <CropOverlay
                          src={element.src ?? ""}
                          initial={element.crop}
                          zoom={scale}
                          width={element.width}
                          height={element.height}
                          onCommit={(crop) => onCommitCrop(element.elementId, crop)}
                          onCancel={onCancelCrop}
                        />
                      ) : isEditingText && textEditorStyle ? (
                        <div
                          ref={(el) => {
                            if (!el || el.dataset.init === "true") return;
                            el.dataset.init = "true";
                            el.focus();
                            // Place cursor at end
                            const range = document.createRange();
                            const sel = window.getSelection();
                            if (el.childNodes.length > 0) {
                              range.selectNodeContents(el);
                              range.collapse(false);
                            } else {
                              range.selectNodeContents(el);
                            }
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                          }}
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const text = (e.currentTarget as HTMLElement).innerText ?? "";
                            onEditingTextValueChange(text);
                            onCommitTextEdit();
                          }}
                          onInput={(e) => {
                            const text = (e.currentTarget as HTMLElement).innerText ?? "";
                            onEditingTextValueChange(text);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              onCancelTextEdit();
                            }
                            // Rich text shortcuts
                            const mod = event.ctrlKey || event.metaKey;
                            if (mod && event.key === "b") {
                              event.preventDefault();
                              document.execCommand("bold", false);
                            }
                            if (mod && event.key === "i") {
                              event.preventDefault();
                              document.execCommand("italic", false);
                            }
                            if (mod && event.key === "u") {
                              event.preventDefault();
                              document.execCommand("underline", false);
                            }
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          className="absolute inset-0 overflow-hidden bg-transparent outline-none"
                          style={{
                            ...textEditorStyle,
                            width: "100%",
                            height: "100%",
                            border: "none",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {editingTextValue}
                        </div>
                      ) : null}

                      {primary && !element.locked && element.kind !== "group" && !isEditingText ? (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: -34,
                              width: 2,
                              height: 18,
                              marginLeft: -1,
                              background: "hsl(var(--primary))",
                              opacity: 0.7,
                            }}
                          />
                          <button
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              const canvas = (event.currentTarget as HTMLElement).closest(
                                "[data-design-canvas]",
                              ) as HTMLElement | null;
                              const centerX = element.x + element.width / 2;
                              const centerY = element.y + element.height / 2;
                              const startPoint = getCanvasPoint(
                                canvas,
                                scale,
                                event.clientX,
                                event.clientY,
                                0,
                                0,
                              );
                              const startAngle = Math.atan2(
                                startPoint.y - centerY,
                                startPoint.x - centerX,
                              );
                              const originRotation = element.rotation ?? 0;
                              const previewCache = createPreviewNodeCache(canvas, [
                                element.elementId,
                              ]);
                              let latestRotatePayload: ResizePayload | null = null;
                              const scheduleRotate = createRafScheduler(
                                (move: { clientX: number; clientY: number; shiftKey: boolean }) => {
                                  const point = getCanvasPoint(
                                    canvas,
                                    scale,
                                    move.clientX,
                                    move.clientY,
                                    0,
                                    0,
                                  );
                                  const currentAngle = Math.atan2(
                                    point.y - centerY,
                                    point.x - centerX,
                                  );
                                  const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
                                  const nextRotation = snapRotation(
                                    Math.round(originRotation + deltaDeg),
                                    move,
                                  );
                                  latestRotatePayload = {
                                    elementId: element.elementId,
                                    patch: {
                                      rotation: nextRotation,
                                    },
                                  };
                                  applyRotationPreview(
                                    canvas,
                                    element.elementId,
                                    nextRotation - originRotation,
                                    previewCache,
                                  );
                                },
                              );
                              const onMouseMove = (moveEvent: MouseEvent) => {
                                scheduleRotate({
                                  clientX: moveEvent.clientX,
                                  clientY: moveEvent.clientY,
                                  shiftKey: moveEvent.shiftKey,
                                });
                              };
                              const onMouseUp = () => {
                                window.removeEventListener("mousemove", onMouseMove);
                                window.removeEventListener("mouseup", onMouseUp);
                                scheduleRotate.flush();
                                if (latestRotatePayload) onResize(latestRotatePayload);
                                onResizeCommit();
                                window.requestAnimationFrame(() => resetPreviewMarkers(canvas));
                              };
                              window.addEventListener("mousemove", onMouseMove);
                              window.addEventListener("mouseup", onMouseUp);
                            }}
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: -52,
                              width: 28,
                              height: 28,
                              marginLeft: -14,
                              borderRadius: 9999,
                              border: "1px solid rgba(124,58,237,0.9)",
                              background: "#ffffff",
                              boxShadow: "0 0 0 1px rgba(124,58,237,0.16), 0 1px 4px rgba(15,23,42,0.14)",
                              display: "grid",
                              placeItems: "center",
                              cursor: "grab",
                              zIndex: 24,
                            }}
                            title="Xoay"
                          >
                            <RotateCw className="size-4 text-primary" />
                          </button>
                          {RESIZE_HANDLES.map((handle) => (
                            <button
                              key={handle.key}
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                const canvas = (event.currentTarget as HTMLElement).closest(
                                  "[data-design-canvas]",
                                ) as HTMLElement | null;
                                const startX = event.clientX;
                                const startY = event.clientY;
                                const origin = {
                                  x: element.x,
                                  y: element.y,
                                  width: element.width,
                                  height: element.height,
                                };
                                const otherResizeElements = elements.filter(
                                  (entry) => entry.elementId !== element.elementId,
                                );
                                const previewCache = createPreviewNodeCache(canvas, [
                                  element.elementId,
                                ]);
                                let latestResizePayload: ResizePayload | null = null;
                                const scheduleResize = createRafScheduler(
                                  (move: {
                                    clientX: number;
                                    clientY: number;
                                    shiftKey: boolean;
                                    altKey: boolean;
                                  }) => {
                                    const dx = (move.clientX - startX) / scale;
                                    const dy = (move.clientY - startY) / scale;
                                    const draft = applyResizeModifiers(
                                      origin,
                                      handle.key,
                                      dx,
                                      dy,
                                      move.shiftKey,
                                      move.altKey,
                                    );
                                    const snapped = snapResize(
                                      page,
                                      element.elementId,
                                      handle.key,
                                      {
                                        x: draft.x,
                                        y: draft.y,
                                        width: draft.width,
                                        height: draft.height,
                                      },
                                      otherResizeElements,
                                      scale,
                                    );
                                    latestResizePayload = {
                                      elementId: element.elementId,
                                      patch: {
                                        x: snapped.x,
                                        y: snapped.y,
                                        width: snapped.width,
                                        height: snapped.height,
                                      },
                                      snapLines: snapped.snapLines,
                                      snapTargetIds: snapped.snapTargetIds,
                                    };
                                    setLiveSnapState(snapped.snapLines, snapped.snapTargetIds);
                                    applyResizePreview(
                                      canvas,
                                      element.elementId,
                                      snapped,
                                      scale,
                                      true,
                                      previewCache,
                                    );
                                  },
                                );
                                const onMouseMove = (moveEvent: MouseEvent) => {
                                  scheduleResize({
                                    clientX: moveEvent.clientX,
                                    clientY: moveEvent.clientY,
                                    shiftKey: moveEvent.shiftKey,
                                    altKey: moveEvent.altKey,
                                  });
                                };
                                const onMouseUp = () => {
                                  window.removeEventListener("mousemove", onMouseMove);
                                  window.removeEventListener("mouseup", onMouseUp);
                                  scheduleResize.flush();
                                  if (latestResizePayload) onResize(latestResizePayload);
                                  onResizeCommit();
                                  clearPreviewSnapState();
                                  window.requestAnimationFrame(() => resetPreviewMarkers(canvas));
                                };
                                window.addEventListener("mousemove", onMouseMove);
                                window.addEventListener("mouseup", onMouseUp);
                              }}
                              style={{
                                position: "absolute",
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                background: "#ffffff",
                                border: "1px solid rgba(124,58,237,0.9)",
                                boxShadow: "0 0 0 1px rgba(124,58,237,0.16), 0 1px 4px rgba(15,23,42,0.12)",
                                cursor: handle.cursor,
                                zIndex: 20,
                                ...handle.style,
                              }}
                            />
                          ))}
                        </>
                      ) : null}
                    </div>
                  );

                  return (
                    <ContextMenu key={element.elementId}>
                      <ContextMenuTrigger asChild>{overlay}</ContextMenuTrigger>
                      {renderElementContextMenu(element)}
                    </ContextMenu>
                  );
                })}

              {bounds && selectedIds.length > 1 ? (
                <div
                  data-selection-bounds
                  data-selection-preview
                  className="absolute rounded-sm border border-dashed border-primary/70"
                  style={{
                    left: bounds.x * scale - 6,
                    top: bounds.y * scale - 6,
                    width: bounds.width * scale + 12,
                    height: bounds.height * scale + 12,
                    pointerEvents: selectedIds.length > 1 ? "auto" : "none",
                  }}
                >
                  {RESIZE_HANDLES.map((handle) => (
                        <button
                          key={handle.key}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            const canvas = (event.currentTarget as HTMLElement).closest(
                              "[data-design-canvas]",
                            ) as HTMLElement | null;
                            const startX = event.clientX;
                            const startY = event.clientY;
                            const origBounds = { ...bounds };
                            const origElements = selectedIds
                              .map((id) => elements.find((e) => e.elementId === id))
                              .filter((e): e is DesignElement => !!e);
                            const previewCache = createPreviewNodeCache(canvas, selectedIds);

                            let latestMultiResizePayloads: ResizePayload[] = [];
                            const scheduleMultiResize = createRafScheduler(
                              (move: {
                                clientX: number;
                                clientY: number;
                                shiftKey: boolean;
                                altKey: boolean;
                              }) => {
                                const dx = (move.clientX - startX) / scale;
                                const dy = (move.clientY - startY) / scale;
                                const draft = applyResizeModifiers(
                                  origBounds,
                                  handle.key,
                                  dx,
                                  dy,
                                  move.shiftKey,
                                  move.altKey,
                                );
                                // Scale each element proportionally
                                const sx = draft.width / Math.max(origBounds.width, 1);
                                const sy = draft.height / Math.max(origBounds.height, 1);
                                latestMultiResizePayloads = [];
                                for (const el of origElements) {
                                  const relX = el.x - origBounds.x;
                                  const relY = el.y - origBounds.y;
                                  const nextRect = {
                                    x: draft.x + relX * sx,
                                    y: draft.y + relY * sy,
                                    width: Math.max(20, el.width * sx),
                                    height: Math.max(20, el.height * sy),
                                  };
                                  latestMultiResizePayloads.push({
                                    elementId: el.elementId,
                                    patch: nextRect,
                                  });
                                  applyResizePreview(
                                    canvas,
                                    el.elementId,
                                    nextRect,
                                    scale,
                                    false,
                                    previewCache,
                                  );
                                }
                                const boundsNode =
                                  previewCache.selectionBoundsNode ??
                                  canvas?.querySelector<HTMLElement>("[data-selection-bounds]");
                                if (boundsNode) {
                                  markPreviewNode(boundsNode, "left, top, width, height");
                                  boundsNode.style.left = `${draft.x * scale - 6}px`;
                                  boundsNode.style.top = `${draft.y * scale - 6}px`;
                                  boundsNode.style.width = `${draft.width * scale + 12}px`;
                                  boundsNode.style.height = `${draft.height * scale + 12}px`;
                                }
                              },
                            );
                            const onMouseMove = (moveEvent: MouseEvent) => {
                              scheduleMultiResize({
                                clientX: moveEvent.clientX,
                                clientY: moveEvent.clientY,
                                shiftKey: moveEvent.shiftKey,
                                altKey: moveEvent.altKey,
                              });
                            };
                            const onMouseUp = () => {
                              window.removeEventListener("mousemove", onMouseMove);
                              window.removeEventListener("mouseup", onMouseUp);
                              scheduleMultiResize.flush();
                              onResizeMany(latestMultiResizePayloads);
                              onResizeCommit();
                              window.requestAnimationFrame(() => resetPreviewMarkers(canvas));
                            };
                            window.addEventListener("mousemove", onMouseMove);
                            window.addEventListener("mouseup", onMouseUp);
                          }}
                          style={{
                            position: "absolute",
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: "#ffffff",
                            border: "1px solid rgba(124,58,237,0.9)",
                            boxShadow: "0 0 0 1px rgba(124,58,237,0.16), 0 1px 4px rgba(15,23,42,0.12)",
                            cursor: handle.cursor,
                            zIndex: 20,
                            ...handle.style,
                          }}
                        />
                      ))}
                </div>
              ) : null}

              {/* Floating text toolbar for selected text element */}
              {(() => {
                const textEl = primaryId
                  ? elements.find((e) => e.elementId === primaryId && e.kind === "text")
                  : null;
                if (!textEl || textEl.kind !== "text") return null;
                return (
                  <TextToolbar
                    element={textEl}
                    scale={scale}
                    canvasWidth={page.width * scale}
                    availableFontFamilies={availableFontFamilies}
                    onUpdateStyle={(patch) => onUpdateElementStyle(textEl.elementId, patch)}
                    onUpdateText={() => {}}
                  />
                );
              })()}

              {/* Opacity slider on selection */}
              {(() => {
                const primaryEl = primaryId
                  ? elements.find((e) => e.elementId === primaryId)
                  : null;
                if (!primaryEl || !bounds) return null;
                const opacity = primaryEl.style?.opacity ?? 1;
                return (
                  <div
                    data-selection-preview
                    className="pointer-events-auto absolute z-30 flex items-center gap-2 rounded-md border bg-card px-2 py-1 shadow"
                    style={{
                      left: bounds.x * scale,
                      top: (bounds.y + bounds.height) * scale + 12,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">Opacity</span>
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={[opacity]}
                      onValueChange={([v]) =>
                        onUpdateElementStyle(primaryEl.elementId, { opacity: v })
                      }
                      className="w-20"
                    />
                    <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                      {Math.round(opacity * 100)}%
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </ContextMenuTrigger>
        {renderCanvasContextMenu()}
      </ContextMenu>
    </div>
  );
}

function InspectorSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </Label>
        {action}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function CompactColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-2 py-2">
      <Label className="min-w-14 text-[11px] font-medium text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-0 flex-1 justify-start gap-2 px-2"
          >
            <span className="size-4 shrink-0 rounded-sm border" style={{ background: value }} />
            <span className="truncate font-mono text-[11px]">{value}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <ColorPicker value={value} onChange={onChange} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix = "px",
  precision = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  precision?: number;
}) {
  const factor = Math.pow(10, precision);
  const displayValue = Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          value={displayValue}
          step={precision > 0 ? 1 / factor : 1}
          className="h-8 pr-8 text-xs tabular-nums"
          onChange={(event) => onChange(Number(event.target.value) || 0)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
