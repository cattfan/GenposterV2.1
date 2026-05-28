import { useCallback, useEffect, useState, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { RotateCw } from "lucide-react";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Slider } from "@/components/ui/slider";
import { buildTextStyle, textVerticalFlexAlign } from "@/engines/binding/dataBinding";
import { LayoutGuides } from "@/features/render/LayoutGuides";
import type {
  DesignElement,
  DesignPage,
  DesignTextRun,
  ElementStyle,
  ImageCrop,
} from "@/models";
import { DesignRenderer } from "./DesignRenderer";
import { CropOverlay } from "./CropOverlay";
import { SmartSpacing } from "./SmartSpacing";
import { TextToolbar } from "./TextToolbar";
import {
  parseRichTextEditorContent,
  richTextToHtml,
  type TextSelectionRange,
} from "./richText";
import {
  applyMovePreview,
  applyResizeModifiers,
  applyResizePreview,
  applyRotationPreview,
  createPreviewNodeCache,
  createRafScheduler,
  getCanvasPoint,
  getDescendantIds,
  getSelectionBounds,
  isPanToolActive,
  markPreviewNode,
  resetPreviewMarkers,
  RESIZE_HANDLES,
  snapMove,
  snapResize,
  snapRotation,
  startPointerSession,
  type DesignTool,
  type MovePayload,
  type ResizePayload,
  type SnapLine,
} from "./designCanvasInteraction";

type ContextMenuTarget = { kind: "canvas" } | { kind: "element"; elementId: string };

export function DesignStage({
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
  onStagePointerDown,
  onSelect,
  onMove: onMoveElement,
  onMoveCommit,
  onResize,
  onResizeMany,
  onResizeCommit,
  availableFontFamilies,
  onUpdateElementStyle,
  onUpdateElement,
  onUpdateTextRunStyle,
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
  onCommitTextEdit: (textValue?: string, textRuns?: DesignTextRun[]) => void;
  onCancelTextEdit: () => void;
  onStagePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSelect: (elementId: string | null, additive: boolean) => void;
  onMove: (payload: MovePayload) => void;
  onMoveCommit: () => void;
  onResize: (payload: ResizePayload) => void;
  onResizeMany: (payloads: ResizePayload[]) => void;
  onResizeCommit: () => void;
  availableFontFamilies: string[];
  onUpdateElementStyle: (elementId: string, patch: Partial<ElementStyle>) => void;
  onUpdateElement: (elementId: string, patch: Partial<DesignElement>) => void;
  onUpdateTextRunStyle: (
    elementId: string,
    range: TextSelectionRange,
    patch: Partial<ElementStyle>,
  ) => void;
  cropTargetId: string | null;
  onStartImageCrop: (elementId: string) => void;
  onCommitCrop: (elementId: string, crop: ImageCrop) => void;
  onCancelCrop: () => void;
  spacingLines: Array<{ axis: "x" | "y"; from: number; to: number; pos: number; gap: number }>;
}) {
  const toolIsPan = isPanToolActive(tool, spacePressed);
  const guideColor = "rgba(56,189,248,0.9)";
  const [previewSnapLines, setPreviewSnapLines] = useState<SnapLine[]>([]);
  const [previewSnapTargetIds, setPreviewSnapTargetIds] = useState<string[]>([]);
  const [activeTransformKind, setActiveTransformKind] = useState<"move" | "resize" | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextMenuTarget;
  } | null>(null);
  const previewSnapSignatureRef = useRef("");
  const contextMenuTriggerRef = useRef<HTMLSpanElement>(null);
  const openContextMenu = useCallback((event: ReactMouseEvent, target: ContextMenuTarget) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  }, []);
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);
  useEffect(() => {
    if (!contextMenu || !contextMenuTriggerRef.current) return;
    const trigger = contextMenuTriggerRef.current;
    trigger.style.left = `${contextMenu.x}px`;
    trigger.style.top = `${contextMenu.y}px`;
    trigger.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: contextMenu.x,
        clientY: contextMenu.y,
      }),
    );
  }, [contextMenu]);
  const canvasCenterLines =
    activeTransformKind !== null
      ? [
          { axis: "x" as const, value: page.width / 2 },
          { axis: "y" as const, value: page.height / 2 },
        ]
      : [];
  const activeSnapLines = [
    ...canvasCenterLines,
    ...(previewSnapLines.length ? previewSnapLines : snapLines),
  ].filter(
    (line, index, lines) =>
      lines.findIndex(
        (candidate) =>
          candidate.axis === line.axis && Math.abs(candidate.value - line.value) < 0.5,
      ) === index,
  );
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
  const contextMenuElementId =
    contextMenu?.target.kind === "element" ? contextMenu.target.elementId : null;
  const contextMenuElement = contextMenuElementId
    ? (elements.find((element) => element.elementId === contextMenuElementId) ?? null)
    : null;

  return (
    <>
      <div className="relative bg-transparent p-0 shadow-none">
        <div
          className="design-canvas-page relative overflow-visible bg-background touch-none"
          data-design-canvas
          style={{ width: page.width * scale, height: page.height * scale }}
          onPointerDown={onStagePointerDown}
          onContextMenu={(event) => {
            const elementNode = (event.target as HTMLElement).closest("[data-design-element-id]");
            const elementId = elementNode?.getAttribute("data-design-element-id");
            openContextMenu(
              event,
              elementId ? { kind: "element", elementId } : { kind: "canvas" },
            );
          }}
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
                  suppressElementIds={
                    editingTextId
                      ? elements.some(
                          (element) =>
                            element.elementId === editingTextId && element.kind === "text",
                        )
                        ? [editingTextId]
                        : []
                      : []
                  }
                  suppressShapeTextIds={
                    editingTextId
                      ? elements.some(
                          (element) =>
                            element.elementId === editingTextId && element.kind === "shape",
                        )
                        ? [editingTextId]
                        : []
                      : []
                  }
                  showGuides={false}
                  showGrid={showGrid}
                  gridSize={documentGridSize}
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
                  showCenter={false}
                />
              ) : null}

              {(showGuides || activeTransformKind !== null) ? activeSnapLines.map((line, index) => {
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
              }) : null}

              {(showGuides || activeTransformKind !== null) ? <SmartSpacing lines={spacingLines} scale={scale} /> : null}

              {elements
                .filter((element) => !element.hidden)
                .slice()
                .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                .map((element) => {
                  const selected = selectedIds.includes(element.elementId);
                  const primary = primaryId === element.elementId;
                  const isSnapTarget = activeSnapTargetIds.includes(element.elementId);
                  const isEditingText =
                    editingTextId === element.elementId &&
                    (element.kind === "text" || element.kind === "shape");
                  const isCropTarget =
                    cropTargetId === element.elementId && element.kind === "image";
                  const textEditorStyle =
                    element.kind === "text" || element.kind === "shape"
                      ? buildTextStyle(element.style, 1)
                      : undefined;
                  const visibleBounds =
                    element.kind === "text" || element.kind === "image" || element.kind === "shape";
                  const selectionLayerIndex = selectedIds.indexOf(element.elementId);
                  const hitLayerZIndex =
                    selected || primary
                      ? 1_000_000 + Math.max(selectionLayerIndex, 0)
                      : (element.zIndex ?? 0);
                  return (
                    <div
                      key={element.elementId}
                      data-design-element
                      data-design-element-id={element.elementId}
                      onDoubleClick={(event) => {
                        if (element.kind === "text" || element.kind === "shape") {
                          event.stopPropagation();
                          onStartTextEdit(element.elementId);
                        } else if (element.kind === "image") {
                          event.stopPropagation();
                          onStartImageCrop(element.elementId);
                        }
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
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
                        setActiveTransformKind("move");
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
                        const handlePointerMove = (moveEvent: PointerEvent) => {
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
                        const onEnd = () => {
                          scheduleMovePreview.flush();
                          if (latestMovePayload) onMoveElement(latestMovePayload);
                          onMoveCommit();
                          clearPreviewSnapState();
                          setActiveTransformKind(null);
                          window.requestAnimationFrame(() =>
                            resetPreviewMarkers(canvas, { restoreTransform: true }),
                          );
                        };
                        const onCancel = () => {
                          scheduleMovePreview.cancel();
                          onMoveCommit();
                          clearPreviewSnapState();
                          setActiveTransformKind(null);
                          window.requestAnimationFrame(() =>
                            resetPreviewMarkers(canvas, { restoreTransform: true }),
                          );
                        };
                        startPointerSession(event, {
                          onMove: handlePointerMove,
                          onEnd,
                          onCancel,
                        });
                      }}
                      style={{
                        position: "absolute",
                        left: element.x * scale,
                        top: element.y * scale,
                        width: element.width * scale,
                        height: element.height * scale,
                        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                        transformOrigin: "center",
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
                        boxShadow: selected ? "0 0 0 1px rgba(124,58,237,0.16)" : undefined,
                        zIndex: hitLayerZIndex,
                      }}
                    >
                      {visibleBounds && (selected || primary) && !isEditingText && !isCropTarget ? (
                        <>
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
                          className="absolute left-0 top-0 overflow-visible bg-transparent outline-none"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            const editor = event.currentTarget.querySelector<HTMLElement>(
                              "[data-rich-text-editor-id]",
                            );
                            if (editor && event.target === event.currentTarget) {
                              event.preventDefault();
                              editor.focus();
                            }
                          }}
                          style={{
                            width: element.width,
                            height: element.height,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: textVerticalFlexAlign(element.style),
                            transform: `scale(${scale})`,
                            transformOrigin: "left top",
                          }}
                        >
                          <div
                            ref={(el) => {
                              if (!el || el.dataset.init === "true") return;
                              el.dataset.init = "true";
                              el.innerHTML = richTextToHtml(
                                editingTextValue,
                                element.kind === "text" || element.kind === "shape"
                                  ? element.textRuns
                                  : undefined,
                                element.kind === "text" || element.kind === "shape"
                                  ? element.style
                                  : undefined,
                              );
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
                            data-rich-text-editor-id={element.elementId}
                            suppressContentEditableWarning
                            onBlur={(e) => {
                              const parsed = parseRichTextEditorContent(e.currentTarget);
                              onEditingTextValueChange(parsed.text);
                              onCommitTextEdit(parsed.text, parsed.textRuns);
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
                            className="w-full overflow-visible bg-transparent outline-none"
                            style={{
                              ...textEditorStyle,
                              width: "100%",
                              border: "none",
                              cursor: "text",
                              wordBreak: "break-word",
                              whiteSpace: "pre-wrap",
                            }}
                          />
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
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
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
                              setActiveTransformKind("resize");
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
                              const onMove = (moveEvent: PointerEvent) => {
                                scheduleRotate({
                                  clientX: moveEvent.clientX,
                                  clientY: moveEvent.clientY,
                                  shiftKey: moveEvent.shiftKey,
                                });
                              };
                              const onEnd = () => {
                                scheduleRotate.flush();
                                resetPreviewMarkers(canvas, { restoreTransform: true });
                                if (latestRotatePayload) onResize(latestRotatePayload);
                                onResizeCommit();
                                setActiveTransformKind(null);
                              };
                              const onCancel = () => {
                                scheduleRotate.cancel();
                                resetPreviewMarkers(canvas, { restoreTransform: true });
                                onResizeCommit();
                                setActiveTransformKind(null);
                              };
                              startPointerSession(event, { onMove, onEnd, onCancel });
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
                              boxShadow:
                                "0 0 0 1px rgba(124,58,237,0.16), 0 1px 4px rgba(15,23,42,0.14)",
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
                              onPointerDown={(event) => {
                                if (event.button !== 0) return;
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
                                setActiveTransformKind("resize");
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
                                const onMove = (moveEvent: PointerEvent) => {
                                  scheduleResize({
                                    clientX: moveEvent.clientX,
                                    clientY: moveEvent.clientY,
                                    shiftKey: moveEvent.shiftKey,
                                    altKey: moveEvent.altKey,
                                  });
                                };
                                const onEnd = () => {
                                  scheduleResize.flush();
                                  if (latestResizePayload) onResize(latestResizePayload);
                                  onResizeCommit();
                                  clearPreviewSnapState();
                                  setActiveTransformKind(null);
                                  window.requestAnimationFrame(() => resetPreviewMarkers(canvas));
                                };
                                const onCancel = () => {
                                  scheduleResize.cancel();
                                  onResizeCommit();
                                  clearPreviewSnapState();
                                  setActiveTransformKind(null);
                                  window.requestAnimationFrame(() => resetPreviewMarkers(canvas));
                                };
                                startPointerSession(event, { onMove, onEnd, onCancel });
                              }}
                              style={{
                                position: "absolute",
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                background: "#ffffff",
                                border: "1px solid rgba(124,58,237,0.9)",
                                boxShadow:
                                  "0 0 0 1px rgba(124,58,237,0.16), 0 1px 4px rgba(15,23,42,0.12)",
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
                    pointerEvents: "none",
                    zIndex: 1_100_000,
                  }}
                >
                  {RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle.key}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
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
                        setActiveTransformKind("resize");
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
                        const onMove = (moveEvent: PointerEvent) => {
                          scheduleMultiResize({
                            clientX: moveEvent.clientX,
                            clientY: moveEvent.clientY,
                            shiftKey: moveEvent.shiftKey,
                            altKey: moveEvent.altKey,
                          });
                        };
                        const onEnd = () => {
                          scheduleMultiResize.flush();
                          onResizeMany(latestMultiResizePayloads);
                          onResizeCommit();
                          setActiveTransformKind(null);
                          window.requestAnimationFrame(() => resetPreviewMarkers(canvas));
                        };
                        const onCancel = () => {
                          scheduleMultiResize.cancel();
                          onResizeCommit();
                          setActiveTransformKind(null);
                          window.requestAnimationFrame(() => resetPreviewMarkers(canvas));
                        };
                        startPointerSession(event, { onMove, onEnd, onCancel });
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
                        pointerEvents: "auto",
                        zIndex: 20,
                        ...handle.style,
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {/* Floating toolbar for selected text or shape element */}
              {(() => {
                const editableEl = primaryId
                  ? elements.find(
                      (e) =>
                        e.elementId === primaryId && (e.kind === "text" || e.kind === "shape"),
                    )
                  : null;
                if (
                  !editableEl ||
                  selectedIds.length !== 1 ||
                  (editableEl.kind !== "text" && editableEl.kind !== "shape")
                ) {
                  return null;
                }
                return (
                  <TextToolbar
                    element={editableEl}
                    availableFontFamilies={availableFontFamilies}
                    onUpdateStyle={(patch) => onUpdateElementStyle(editableEl.elementId, patch)}
                    onUpdateElement={(patch) => onUpdateElement(editableEl.elementId, patch)}
                    mode={editingTextId === editableEl.elementId ? "text" : "auto"}
                    onUpdateTextRunStyle={(range, patch) =>
                      onUpdateTextRunStyle(editableEl.elementId, range, patch)
                    }
                    onUpdateText={() => {}}
                  />
                );
              })()}

              {/* Opacity slider on selection */}
              {(() => {
                const primaryEl = primaryId
                  ? elements.find((e) => e.elementId === primaryId)
                  : null;
                if (
                  !primaryEl ||
                  !bounds ||
                  editingTextId ||
                  primaryEl.kind === "text" ||
                  primaryEl.kind === "shape"
                )
                  return null;
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
                    <span className="text-[10px] font-medium text-muted-foreground">Độ mờ</span>
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
      </div>

      <ContextMenu
        onOpenChange={(open) => {
          if (!open) closeContextMenu();
        }}
      >
        <ContextMenuTrigger asChild>
          <span
            ref={contextMenuTriggerRef}
            aria-hidden
            className="fixed z-[2147483646] h-px w-px"
            style={{
              left: -9999,
              top: -9999,
              pointerEvents: "none",
            }}
          />
        </ContextMenuTrigger>
        {contextMenu
          ? contextMenuElement
            ? renderElementContextMenu(contextMenuElement)
            : renderCanvasContextMenu()
          : null}
      </ContextMenu>
    </>
  );
}
