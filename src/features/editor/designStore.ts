import { useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import type { DesignDocument, DesignElement, DesignPage, EditorMode, ElementStyle } from "@/models";
import { cloneDesignDocument, createDesignPage } from "./designDocument";

const HISTORY_LIMIT = 50;

export interface SnapLine {
  axis: "x" | "y";
  value: number;
}

export interface DesignSelectionState {
  ids: string[];
  primaryId: string | null;
}

export interface DesignViewportState {
  zoom: number;
  panX: number;
  panY: number;
  snapLines: SnapLine[];
}

export interface DesignEditorState {
  designDocumentId: string;
  name: string;
  mode: EditorMode;
  createdAt: number;
  updatedAt: number;
  version: 1;
  brandKitId?: string;
  assetIds: string[];
  sourcePageTemplateId?: string;
  sourceJobId?: string;
  documentSettings: NonNullable<DesignDocument["documentSettings"]>;
  pageOrder: string[];
  pagesById: Record<string, DesignPage>;
  activePageId: string;
  elementOrderByPage: Record<string, string[]>;
  elementsById: Record<string, DesignElement>;
  selection: DesignSelectionState;
  viewport: DesignViewportState;
  clipboard: DesignElement[] | null;
  history: {
    past: DesignDocument[];
    future: DesignDocument[];
  };
}

type CommitOptions = {
  history?: boolean;
  nextSelection?: DesignSelectionState;
};

function defaultDocumentSettings(
  settings: DesignDocument["documentSettings"] | undefined,
): NonNullable<DesignDocument["documentSettings"]> {
  return {
    gridSize: settings?.gridSize ?? 8,
    snapToGrid: settings?.snapToGrid ?? false,
    showGrid: settings?.showGrid ?? false,
    showSafeZone: settings?.showSafeZone ?? false,
    showGuides: settings?.showGuides ?? false,
  };
}

export function normalizeDesignDocument(
  document: DesignDocument,
  extras?: Partial<Pick<DesignEditorState, "selection" | "viewport" | "clipboard" | "history">>,
): DesignEditorState {
  const pagesById = Object.fromEntries(document.pages.map((page) => [page.pageId, page]));
  const elementOrderByPage: Record<string, string[]> = {};
  for (const page of document.pages) {
    elementOrderByPage[page.pageId] = document.elements
      .filter((element) => element.pageId === page.pageId)
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      .map((element) => element.elementId);
  }
  const elementsById = Object.fromEntries(
    document.elements.map((element) => [element.elementId, element]),
  );
  const activePageId = document.activePageId ?? document.pages[0]?.pageId ?? "";
  const selection = extras?.selection ?? { ids: [], primaryId: null };
  const filteredSelectionIds = selection.ids.filter((id) => {
    const element = elementsById[id];
    return !!element && element.pageId === activePageId;
  });
  const primaryId =
    selection.primaryId && filteredSelectionIds.includes(selection.primaryId)
      ? selection.primaryId
      : (filteredSelectionIds.at(-1) ?? null);

  return {
    designDocumentId: document.designDocumentId,
    name: document.name,
    mode: document.mode,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    version: document.version,
    brandKitId: document.brandKitId,
    assetIds: document.assetIds ?? [],
    sourcePageTemplateId: document.sourcePageTemplateId,
    sourceJobId: document.sourceJobId,
    documentSettings: defaultDocumentSettings(document.documentSettings),
    pageOrder: document.pages.map((page) => page.pageId),
    pagesById,
    activePageId,
    elementOrderByPage,
    elementsById,
    selection: { ids: filteredSelectionIds, primaryId },
    viewport: extras?.viewport ?? {
      zoom: 0.45,
      panX: 0,
      panY: 0,
      snapLines: [],
    },
    clipboard: extras?.clipboard ?? null,
    history: extras?.history ?? { past: [], future: [] },
  };
}

export function materializeDesignDocument(state: DesignEditorState): DesignDocument {
  const pages = state.pageOrder.map((pageId) => state.pagesById[pageId]).filter(Boolean);
  const elements: DesignElement[] = pages.flatMap((page) => {
    const order = state.elementOrderByPage[page.pageId] ?? [];
    const pageElements: DesignElement[] = [];
    order.forEach((elementId, index) => {
      const element = state.elementsById[elementId];
      if (!element) return;
      pageElements.push({
        ...element,
        zIndex: index,
      });
    });
    return pageElements;
  });

  return {
    designDocumentId: state.designDocumentId,
    name: state.name,
    pages,
    elements,
    assetIds: state.assetIds,
    brandKitId: state.brandKitId,
    activePageId: state.activePageId,
    mode: state.mode,
    sourcePageTemplateId: state.sourcePageTemplateId,
    sourceJobId: state.sourceJobId,
    documentSettings: state.documentSettings,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    version: state.version,
  };
}

function updateStateFromDocument(
  prev: DesignEditorState,
  document: DesignDocument,
  options?: CommitOptions,
): DesignEditorState {
  const currentDocument = materializeDesignDocument(prev);
  const nextHistory =
    options?.history === false
      ? prev.history
      : {
          past: [...prev.history.past, cloneDesignDocument(currentDocument)].slice(-HISTORY_LIMIT),
          future: [],
        };

  return normalizeDesignDocument(
    {
      ...document,
      updatedAt: Date.now(),
    },
    {
      selection: options?.nextSelection ?? prev.selection,
      viewport: { ...prev.viewport, snapLines: [] },
      clipboard: prev.clipboard,
      history: nextHistory,
    },
  );
}

function createDuplicatedElement(element: DesignElement, offset: number): DesignElement {
  return {
    ...cloneDesignDocument({
      designDocumentId: "dup",
      name: "dup",
      pages: [],
      elements: [element],
      activePageId: undefined,
      mode: "design",
      createdAt: 0,
      updatedAt: 0,
      version: 1,
    }).elements[0],
    elementId: nanoid(),
    x: element.x + offset,
    y: element.y + offset,
  };
}

export function getDescendantIds(state: DesignEditorState, groupId: string): string[] {
  const visited = new Set<string>();
  const walk = (parentId: string) => {
    for (const element of Object.values(state.elementsById)) {
      if (element.parentId !== parentId || visited.has(element.elementId)) continue;
      visited.add(element.elementId);
      walk(element.elementId);
    }
  };
  walk(groupId);
  return Array.from(visited);
}

export function getPageElements(
  state: DesignEditorState,
  pageId = state.activePageId,
): DesignElement[] {
  return (state.elementOrderByPage[pageId] ?? [])
    .map((elementId) => state.elementsById[elementId])
    .filter((element): element is DesignElement => !!element);
}

function getSelectionElements(state: DesignEditorState): DesignElement[] {
  return state.selection.ids
    .map((id) => state.elementsById[id])
    .filter((element): element is DesignElement => !!element);
}

function selectionBounds(elements: DesignElement[]) {
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

function reorderIds(
  ids: string[],
  targetIds: string[],
  mode: "forward" | "backward" | "front" | "back",
) {
  const selected = ids.filter((id) => targetIds.includes(id));
  const rest = ids.filter((id) => !targetIds.includes(id));
  if (selected.length === 0) return ids;
  if (mode === "front") return [...rest, ...selected];
  if (mode === "back") return [...selected, ...rest];
  if (mode === "forward") {
    const next = ids.slice();
    for (const id of selected.slice().reverse()) {
      const index = next.indexOf(id);
      if (index < 0 || index === next.length - 1) continue;
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
    return next;
  }
  const next = ids.slice();
  for (const id of selected) {
    const index = next.indexOf(id);
    if (index <= 0) continue;
    [next[index], next[index - 1]] = [next[index - 1], next[index]];
  }
  return next;
}

export function useDesignEditor(document: DesignDocument) {
  const [state, setState] = useState<DesignEditorState>(() => normalizeDesignDocument(document));

  useEffect(() => {
    setState((prev) => {
      if (prev.designDocumentId === document.designDocumentId && prev.mode === document.mode) {
        return prev;
      }

      return normalizeDesignDocument(document, {
        viewport: prev.viewport,
        clipboard: prev.clipboard,
      });
    });
  }, [document]);

  const commitDocument = useCallback(
    (updater: (document: DesignDocument) => void, options?: CommitOptions) => {
      setState((prev) => {
        const nextDocument = cloneDesignDocument(materializeDesignDocument(prev));
        updater(nextDocument);
        return updateStateFromDocument(prev, nextDocument, options);
      });
    },
    [],
  );

  const reset = useCallback((nextDocument: DesignDocument) => {
    setState(normalizeDesignDocument(nextDocument));
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      const last = prev.history.past.at(-1);
      if (!last) return prev;
      const current = materializeDesignDocument(prev);
      return normalizeDesignDocument(last, {
        selection: prev.selection,
        viewport: prev.viewport,
        clipboard: prev.clipboard,
        history: {
          past: prev.history.past.slice(0, -1),
          future: [cloneDesignDocument(current), ...prev.history.future],
        },
      });
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const [next, ...rest] = prev.history.future;
      if (!next) return prev;
      const current = materializeDesignDocument(prev);
      return normalizeDesignDocument(next, {
        selection: prev.selection,
        viewport: prev.viewport,
        clipboard: prev.clipboard,
        history: {
          past: [...prev.history.past, cloneDesignDocument(current)].slice(-HISTORY_LIMIT),
          future: rest,
        },
      });
    });
  }, []);

  const setSelection = useCallback((ids: string[], primaryId?: string | null) => {
    setState((prev) => ({
      ...prev,
      selection: {
        ids,
        primaryId: primaryId ?? ids.at(-1) ?? null,
      },
    }));
  }, []);

  const setActivePage = useCallback((pageId: string) => {
    setState((prev) => ({
      ...prev,
      activePageId: pageId,
      selection: { ids: [], primaryId: null },
    }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setState((prev) => ({
      ...prev,
      viewport: {
        ...prev.viewport,
        zoom: Math.min(3, Math.max(0.1, zoom)),
      },
    }));
  }, []);

  const setPan = useCallback((panX: number, panY: number) => {
    setState((prev) => ({
      ...prev,
      viewport: {
        ...prev.viewport,
        panX,
        panY,
      },
    }));
  }, []);

  const setSnapLines = useCallback((snapLines: SnapLine[]) => {
    setState((prev) => ({
      ...prev,
      viewport: {
        ...prev.viewport,
        snapLines,
      },
    }));
  }, []);

  const setName = useCallback(
    (name: string) => {
      commitDocument(
        (next) => {
          next.name = name;
        },
        { history: false },
      );
    },
    [commitDocument],
  );

  const updateDocumentSettings = useCallback(
    (patch: Partial<NonNullable<DesignDocument["documentSettings"]>>) => {
      commitDocument(
        (next) => {
          next.documentSettings = {
            ...defaultDocumentSettings(next.documentSettings),
            ...patch,
          };
        },
        { history: false },
      );
    },
    [commitDocument],
  );

  const setBrandKit = useCallback(
    (brandKitId: string | undefined) => {
      commitDocument(
        (next) => {
          next.brandKitId = brandKitId;
        },
        { history: false },
      );
    },
    [commitDocument],
  );

  const setAssetIds = useCallback(
    (assetIds: string[]) => {
      commitDocument(
        (next) => {
          next.assetIds = assetIds;
        },
        { history: false },
      );
    },
    [commitDocument],
  );

  const insertElement = useCallback(
    (element: DesignElement) => {
      commitDocument(
        (next) => {
          next.elements.push(element);
        },
        {
          nextSelection: { ids: [element.elementId], primaryId: element.elementId },
        },
      );
    },
    [commitDocument],
  );

  const addPage = useCallback(
    (page?: Partial<DesignPage>) => {
      const pageId = page?.pageId ?? nanoid();
      commitDocument(
        (next) => {
          next.pages.push(
            createDesignPage({
              pageId,
              name: page?.name ?? `Page ${next.pages.length + 1}`,
              canvas: {
                width: page?.width ?? 1080,
                height: page?.height ?? 1350,
                background: page?.background ?? "#ffffff",
                backgroundImage: page?.backgroundImage,
              },
            }),
          );
          next.activePageId = pageId;
        },
        {
          nextSelection: { ids: [], primaryId: null },
        },
      );
    },
    [commitDocument],
  );

  const updatePage = useCallback(
    (pageId: string, patch: Partial<DesignPage>) => {
      commitDocument((next) => {
        const page = next.pages.find((item) => item.pageId === pageId);
        if (!page) return;
        Object.assign(page, patch);
      });
    },
    [commitDocument],
  );

  const duplicateActivePage = useCallback(() => {
    const activePage = state.pagesById[state.activePageId];
    if (!activePage) return;
    const newPageId = nanoid();
    commitDocument((next) => {
      const page = next.pages.find((item) => item.pageId === activePage.pageId);
      if (!page) return;
      const clonedPage: DesignPage = {
        ...cloneDesignDocument({
          designDocumentId: "dup",
          name: "dup",
          pages: [page],
          elements: [],
          mode: "design",
          createdAt: 0,
          updatedAt: 0,
          version: 1,
        }).pages[0],
        pageId: newPageId,
        name: `${page.name} copy`,
      };
      const index = next.pages.findIndex((item) => item.pageId === activePage.pageId);
      next.pages.splice(index + 1, 0, clonedPage);
      const clonedElements = next.elements
        .filter((element) => element.pageId === activePage.pageId)
        .map((element) => ({
          ...createDuplicatedElement(element, 0),
          pageId: newPageId,
          x: element.x,
          y: element.y,
        }));
      next.elements.push(...clonedElements);
      next.activePageId = newPageId;
    });
  }, [commitDocument, state.activePageId, state.pagesById]);

  const movePage = useCallback(
    (pageId: string, direction: -1 | 1) => {
      commitDocument((next) => {
        const index = next.pages.findIndex((page) => page.pageId === pageId);
        if (index < 0) return;
        const target = index + direction;
        if (target < 0 || target >= next.pages.length) return;
        const [page] = next.pages.splice(index, 1);
        next.pages.splice(target, 0, page);
      });
    },
    [commitDocument],
  );

  const removePage = useCallback(
    (pageId: string) => {
      if (state.pageOrder.length <= 1) return;
      commitDocument((next) => {
        next.pages = next.pages.filter((page) => page.pageId !== pageId);
        next.elements = next.elements.filter((element) => element.pageId !== pageId);
        if (next.activePageId === pageId) {
          next.activePageId = next.pages[0]?.pageId;
        }
      });
    },
    [commitDocument, state.pageOrder.length],
  );

  const updateElements = useCallback(
    (
      elementIds: string[],
      patch: Partial<DesignElement> | ((element: DesignElement) => Partial<DesignElement>),
      options?: CommitOptions,
    ) => {
      if (options?.history === false) {
        const targetIds = new Set(elementIds);
        setState((prev) => {
          let changed = false;
          const nextElementsById = { ...prev.elementsById };

          for (const elementId of targetIds) {
            const element = prev.elementsById[elementId];
            if (!element) continue;
            const nextPatch = typeof patch === "function" ? patch(element) : patch;
            nextElementsById[elementId] = {
              ...element,
              ...nextPatch,
              style:
                "style" in nextPatch && nextPatch.style
                  ? ({
                      ...(element.style ?? {}),
                      ...(nextPatch.style as ElementStyle),
                    } as ElementStyle)
                  : element.style,
            } as DesignElement;
            changed = true;
          }

          if (!changed) return prev;

          return {
            ...prev,
            updatedAt: Date.now(),
            elementsById: nextElementsById,
            selection: options.nextSelection ?? prev.selection,
          };
        });
        return;
      }

      commitDocument((next) => {
        const targetIds = new Set(elementIds);
        next.elements = next.elements.map((element) => {
          if (!targetIds.has(element.elementId)) return element;
          const nextPatch = typeof patch === "function" ? patch(element) : patch;
          return {
            ...element,
            ...nextPatch,
            style:
              "style" in nextPatch && nextPatch.style
                ? ({
                    ...(element.style ?? {}),
                    ...(nextPatch.style as ElementStyle),
                  } as ElementStyle)
                : element.style,
          } as DesignElement;
        });
      }, options);
    },
    [commitDocument],
  );

  const updateSelectedElements = useCallback(
    (
      patch: Partial<DesignElement> | ((element: DesignElement) => Partial<DesignElement>),
      options?: CommitOptions,
    ) => {
      if (state.selection.ids.length === 0) return;
      updateElements(state.selection.ids, patch, options);
    },
    [state.selection.ids, updateElements],
  );

  const copySelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      clipboard: getSelectionElements(prev).map(
        (element) =>
          cloneDesignDocument({
            designDocumentId: "copy",
            name: "copy",
            pages: [],
            elements: [element],
            mode: "design",
            createdAt: 0,
            updatedAt: 0,
            version: 1,
          }).elements[0],
      ),
    }));
  }, []);

  const deleteSelection = useCallback(() => {
    if (state.selection.ids.length === 0) return;
    const idsToRemove = new Set<string>();
    state.selection.ids.forEach((id) => {
      idsToRemove.add(id);
      getDescendantIds(state, id).forEach((descendantId) => idsToRemove.add(descendantId));
    });
    commitDocument(
      (next) => {
        next.elements = next.elements.filter((element) => !idsToRemove.has(element.elementId));
      },
      {
        nextSelection: { ids: [], primaryId: null },
      },
    );
  }, [commitDocument, state]);

  const duplicateSelection = useCallback(
    (offset = 24) => {
      const selected = getSelectionElements(state);
      if (selected.length === 0) return;
      const duplicates = selected.map((element) => createDuplicatedElement(element, offset));
      commitDocument(
        (next) => {
          next.elements.push(...duplicates);
        },
        {
          nextSelection: {
            ids: duplicates.map((element) => element.elementId),
            primaryId: duplicates.at(-1)?.elementId ?? null,
          },
        },
      );
    },
    [commitDocument, state],
  );

  const pasteClipboard = useCallback(
    (offset = 24) => {
      if (!state.clipboard || state.clipboard.length === 0) return;
      const duplicates = state.clipboard.map((element) => ({
        ...createDuplicatedElement(element, offset),
        pageId: state.activePageId,
      }));
      commitDocument(
        (next) => {
          next.elements.push(...duplicates);
        },
        {
          nextSelection: {
            ids: duplicates.map((element) => element.elementId),
            primaryId: duplicates.at(-1)?.elementId ?? null,
          },
        },
      );
    },
    [commitDocument, state.activePageId, state.clipboard],
  );

  const orderSelection = useCallback(
    (mode: "forward" | "backward" | "front" | "back") => {
      if (state.selection.ids.length === 0) return;
      setState((prev) => {
        const current = materializeDesignDocument(prev);
        const next = cloneDesignDocument(current);
        const activePage = next.activePageId ?? prev.activePageId;
        const orderedIds = next.elements
          .filter((element) => element.pageId === activePage)
          .slice()
          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
          .map((element) => element.elementId);
        const reordered = reorderIds(orderedIds, prev.selection.ids, mode);
        let zIndex = 0;
        next.elements = next.elements.map((element) => {
          if (element.pageId !== activePage) return element;
          const nextIndex = reordered.indexOf(element.elementId);
          return {
            ...element,
            zIndex: nextIndex >= 0 ? nextIndex : zIndex++,
          };
        });
        return updateStateFromDocument(prev, next);
      });
    },
    [state.selection.ids],
  );

  const alignSelection = useCallback(
    (mode: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
      const selected = getSelectionElements(state);
      const bounds = selectionBounds(selected);
      if (!bounds || selected.length < 2) return;
      updateSelectedElements((element) => {
        if (mode === "left") return { x: bounds.x };
        if (mode === "center")
          return { x: Math.round(bounds.x + bounds.width / 2 - element.width / 2) };
        if (mode === "right") return { x: Math.round(bounds.x + bounds.width - element.width) };
        if (mode === "top") return { y: bounds.y };
        if (mode === "middle")
          return { y: Math.round(bounds.y + bounds.height / 2 - element.height / 2) };
        return { y: Math.round(bounds.y + bounds.height - element.height) };
      });
    },
    [state, updateSelectedElements],
  );

  const distributeSelection = useCallback(
    (axis: "horizontal" | "vertical") => {
      const selected = getSelectionElements(state)
        .slice()
        .sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
      if (selected.length < 3) return;
      const first = selected[0];
      const last = selected[selected.length - 1];
      const occupied = selected
        .slice(1, -1)
        .reduce(
          (sum, element) => sum + (axis === "horizontal" ? element.width : element.height),
          0,
        );
      const total =
        axis === "horizontal"
          ? last.x - (first.x + first.width)
          : last.y - (first.y + first.height);
      const gap = (total - occupied) / Math.max(selected.length - 1, 1);
      let cursor =
        axis === "horizontal" ? first.x + first.width + gap : first.y + first.height + gap;
      const patches = selected.slice(1, -1).map((element) => {
        const patch = axis === "horizontal" ? { x: Math.round(cursor) } : { y: Math.round(cursor) };
        cursor += (axis === "horizontal" ? element.width : element.height) + gap;
        return {
          elementId: element.elementId,
          patch,
        };
      });
      updateElements(
        patches.map((item) => item.elementId),
        (element) => patches.find((item) => item.elementId === element.elementId)?.patch ?? {},
      );
    },
    [state, updateElements],
  );

  const groupSelection = useCallback(() => {
    const selected = getSelectionElements(state);
    const bounds = selectionBounds(selected);
    if (!bounds || selected.length < 2) return;
    const groupId = nanoid();
    const groupElement: DesignElement = {
      elementId: groupId,
      pageId: state.activePageId,
      kind: "group",
      name: "Group",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      zIndex: Math.max(...selected.map((element) => element.zIndex ?? 0)) + 1,
      children: selected.map((element) => element.elementId),
    };
    commitDocument(
      (next) => {
        next.elements = next.elements.map((element) =>
          state.selection.ids.includes(element.elementId)
            ? {
                ...element,
                parentId: groupId,
              }
            : element,
        );
        next.elements.push(groupElement);
      },
      {
        nextSelection: { ids: [groupId], primaryId: groupId },
      },
    );
  }, [commitDocument, state]);

  const ungroupSelection = useCallback(() => {
    const groupIds = getSelectionElements(state)
      .filter((element) => element.kind === "group")
      .map((element) => element.elementId);
    if (groupIds.length === 0) return;
    commitDocument(
      (next) => {
        next.elements = next.elements
          .map((element) =>
            groupIds.includes(element.parentId ?? "")
              ? {
                  ...element,
                  parentId: undefined,
                }
              : element,
          )
          .filter((element) => !groupIds.includes(element.elementId));
      },
      {
        nextSelection: { ids: [], primaryId: null },
      },
    );
  }, [commitDocument, state]);

  const documentValue = useMemo(() => materializeDesignDocument(state), [state]);
  const activePage = state.pagesById[state.activePageId];
  const activeElements = useMemo(() => getPageElements(state, state.activePageId), [state]);
  const selectedElements = useMemo(() => getSelectionElements(state), [state]);

  return {
    state,
    document: documentValue,
    activePage,
    activeElements,
    selectedElements,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    reset,
    undo,
    redo,
    setName,
    setSelection,
    setActivePage,
    setZoom,
    setPan,
    setSnapLines,
    updateDocumentSettings,
    setBrandKit,
    setAssetIds,
    insertElement,
    addPage,
    updatePage,
    duplicateActivePage,
    movePage,
    removePage,
    updateElements,
    updateSelectedElements,
    copySelection,
    pasteClipboard,
    deleteSelection,
    duplicateSelection,
    orderSelection,
    alignSelection,
    distributeSelection,
    groupSelection,
    ungroupSelection,
  };
}
