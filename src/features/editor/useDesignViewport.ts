import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { DesignPage } from "@/models";
import type { useDesignEditor } from "./designStore";
import {
  createRafScheduler,
  getCenteredPagePan,
  getDesignCanvasElement,
  getFitPageZoom,
  getNextZoom,
  getStageClientPoint,
  getToolCursor,
  getZoomPanAtClientPoint,
  isPanToolActive,
  type DesignTool,
  type RafScheduler,
  type StagePoint,
} from "./designCanvasInteraction";

type DesignEditor = ReturnType<typeof useDesignEditor>;

export function useDesignViewport({
  editor,
  activePage,
  stageWrapRef,
  stagePanLayerRef,
  tool,
  spacePressed,
}: {
  editor: DesignEditor;
  activePage: DesignPage | undefined;
  stageWrapRef: RefObject<HTMLDivElement | null>;
  stagePanLayerRef: RefObject<HTMLDivElement | null>;
  tool: DesignTool;
  spacePressed: boolean;
}) {
  const lastStagePointerRef = useRef<StagePoint | null>(null);
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

  const zoom = editor.state.viewport.zoom;
  const viewportPanX = editor.state.viewport.panX;
  const viewportPanY = editor.state.viewport.panY;
  const setEditorPan = editor.setPan;
  const setEditorZoom = editor.setZoom;

  const handleZoomStep = useCallback(
    (direction: 1 | -1) => {
      const container = stageWrapRef.current;
      const page = activePage;
      if (!container || !page) {
        editor.setZoom(getNextZoom(zoom, direction));
        return;
      }
      const currentZoom = zoom;
      const nextZoom = getNextZoom(currentZoom, direction);
      const point = getStageClientPoint(container, lastStagePointerRef.current);
      const nextPan = getZoomPanAtClientPoint({
        container,
        canvas: getDesignCanvasElement(container),
        page,
        currentZoom,
        nextZoom,
        panX: viewportPanX,
        panY: viewportPanY,
        clientX: point.clientX,
        clientY: point.clientY,
      });
      editor.setPan(nextPan.panX, nextPan.panY);
      editor.setZoom(nextZoom);
    },
    [activePage, editor, stageWrapRef, viewportPanX, viewportPanY, zoom],
  );

  const handleResetZoom = useCallback(() => {
    const page = activePage;
    const container = stageWrapRef.current;
    if (!page || !container) {
      editor.setZoom(1);
      return;
    }
    const nextZoom = getFitPageZoom(page, container, 1);
    const nextPan = getCenteredPagePan(page, container, nextZoom);
    editor.setZoom(nextZoom);
    editor.setPan(nextPan.panX, nextPan.panY);
  }, [activePage, editor, stageWrapRef]);

  const handleCanvasWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const container = stageWrapRef.current;
      const page = activePage;
      if (!container || !page) return;
      const currentZoom = zoom;
      const nextZoom = getNextZoom(currentZoom, event.deltaY < 0 ? 1 : -1);
      const wrapRect = container.getBoundingClientRect();
      lastStagePointerRef.current = {
        x: event.clientX - wrapRect.left,
        y: event.clientY - wrapRect.top,
      };
      const nextPan = getZoomPanAtClientPoint({
        container,
        canvas: getDesignCanvasElement(container),
        page,
        currentZoom,
        nextZoom,
        panX: viewportPanX,
        panY: viewportPanY,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      setEditorPan(nextPan.panX, nextPan.panY);
      setEditorZoom(nextZoom);
    },
    [activePage, setEditorPan, setEditorZoom, stageWrapRef, viewportPanX, viewportPanY, zoom],
  );

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const wrap = stageWrapRef.current;
      if (!wrap || !(event.target instanceof Node) || !wrap.contains(event.target)) return;
      handleCanvasWheel(event);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, [handleCanvasWheel, stageWrapRef]);

  useEffect(() => {
    if (!stageWrapRef.current) return;
    stageWrapRef.current.style.cursor = isPanning ? "grabbing" : getToolCursor(tool, spacePressed);
  }, [isPanning, spacePressed, stageWrapRef, tool]);

  useEffect(() => {
    if (!spacePressed) return;
    setPanCursor("grab");
  }, [spacePressed]);

  const beginPan = useCallback(
    (clientX: number, clientY: number) => {
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
    },
    [editor.state.viewport.panX, editor.state.viewport.panY, stagePanLayerRef],
  );

  const updatePan = useCallback(
    (clientX: number, clientY: number) => {
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
    },
    [editor],
  );

  const endPan = useCallback(() => {
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
  }, [editor, stagePanLayerRef]);

  const handleStageWrapMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      lastStagePointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    [],
  );

  const resetPanInteraction = useCallback(() => {
    setIsPanning(false);
    setPanCursor("grab");
    setViewportDrag(null);
  }, []);

  return {
    handleZoomStep,
    handleResetZoom,
    beginPan,
    updatePan,
    endPan,
    isPanning,
    panCursor,
    setPanCursor,
    resetPanInteraction,
    handleStageWrapMouseMove,
    lastStagePointerRef: lastStagePointerRef as MutableRefObject<StagePoint | null>,
  };
}
