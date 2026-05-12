// Symbol / component-reuse helpers.
//
// A symbol is a named bundle of DesignElements persisted in Dexie. Users can:
//   - "Save selection as symbol" → create/update a SymbolDefinition
//   - Browse the symbol library and drop an instance onto any page
//   - Re-apply latest symbol onto existing instances to resync edits
//
// Instances are plain DesignElements with `meta.symbolId` + `meta.symbolVersion`
// tags, so they still participate in regular selection/move/delete flows.

import { nanoid } from "nanoid";
import type {
  DesignElement,
  DesignGroupElement,
  SymbolDefinition,
} from "@/models";
import { db } from "@/storage/db";

/**
 * Strip page-scoped + ephemeral state so the elements are portable. Called when
 * saving a symbol definition.
 */
function sanitizeForSymbol(elements: DesignElement[]): DesignElement[] {
  return elements.map((element) => {
    const copy = structuredClone(element);
    (copy as Partial<DesignElement>).pageId = undefined;
    return copy;
  });
}

function computeBounds(elements: DesignElement[]) {
  if (elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...elements.map((e) => e.x));
  const minY = Math.min(...elements.map((e) => e.y));
  const maxX = Math.max(...elements.map((e) => e.x + e.width));
  const maxY = Math.max(...elements.map((e) => e.y + e.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function sanitizeAndCaptureBounds(elements: DesignElement[]) {
  const bounds = computeBounds(elements);
  const clone = sanitizeForSymbol(elements);
  // Offset elements so the bundle starts at (0,0) for portability.
  const offsetX = bounds.x;
  const offsetY = bounds.y;
  for (const element of clone) {
    element.x -= offsetX;
    element.y -= offsetY;
  }
  return { elements: clone, width: bounds.width, height: bounds.height };
}

export interface SaveSymbolInput {
  name: string;
  description?: string;
  tags?: string[];
  elements: DesignElement[];
  /** When updating an existing symbol, pass its id + its current version. */
  symbolId?: string;
  currentVersion?: number;
  thumbnail?: string;
}

export async function saveSymbol(input: SaveSymbolInput): Promise<SymbolDefinition> {
  const { elements, width, height } = sanitizeAndCaptureBounds(input.elements);
  const now = Date.now();
  const symbolId = input.symbolId ?? nanoid();
  const nextVersion = (input.currentVersion ?? 0) + 1;
  const existing = input.symbolId ? await db.symbols.get(input.symbolId) : undefined;
  const symbol: SymbolDefinition = {
    symbolId,
    name: input.name.trim() || "Symbol",
    description: input.description?.trim() || undefined,
    elements,
    width,
    height,
    version: input.symbolId && existing ? existing.version + 1 : nextVersion,
    thumbnail: input.thumbnail,
    tags: input.tags?.filter(Boolean),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.symbols.put(symbol);
  return symbol;
}

export async function deleteSymbol(symbolId: string): Promise<void> {
  await db.symbols.delete(symbolId);
}

/**
 * Build a fresh set of DesignElements ready to insert on a page, tagged with
 * `meta.symbolId` + `meta.symbolVersion` so future syncs can find them.
 * `pageId` and relationships (`parentId`, `children`) are remapped to new ids.
 */
export function instantiateSymbolElements(
  symbol: SymbolDefinition,
  params: {
    pageId: string;
    offsetX?: number;
    offsetY?: number;
    zIndexStart?: number;
  },
): DesignElement[] {
  const idMap = new Map<string, string>();
  for (const element of symbol.elements) {
    idMap.set(element.elementId, nanoid());
  }
  const offsetX = params.offsetX ?? 0;
  const offsetY = params.offsetY ?? 0;
  return symbol.elements.map((element, index) => {
    const copy = structuredClone(element);
    copy.elementId = idMap.get(element.elementId)!;
    copy.pageId = params.pageId;
    copy.x = element.x + offsetX;
    copy.y = element.y + offsetY;
    if (copy.parentId) copy.parentId = idMap.get(copy.parentId) ?? undefined;
    if (copy.children) {
      copy.children = copy.children.map((childId) => idMap.get(childId) ?? childId);
    }
    copy.meta = {
      ...(copy.meta ?? {}),
      symbolId: symbol.symbolId,
      symbolVersion: symbol.version,
    };
    if (params.zIndexStart != null) {
      copy.zIndex = params.zIndexStart + index;
    }
    return copy;
  });
}

/**
 * Wrap the selected elements in a group so they behave like a single symbol
 * instance. Returns the group root + all child ids. Caller must persist via
 * editor.insertElement / updateElements.
 */
export function buildSymbolInstanceGroup(
  elements: DesignElement[],
  symbol: SymbolDefinition,
  pageId: string,
): { group: DesignGroupElement; children: DesignElement[] } {
  const bounds = computeBounds(elements);
  const groupId = nanoid();
  const children = elements.map((element) => ({
    ...element,
    parentId: groupId,
  }));
  const group: DesignGroupElement = {
    elementId: groupId,
    pageId,
    kind: "group",
    name: symbol.name,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    children: children.map((c) => c.elementId),
    meta: {
      symbolId: symbol.symbolId,
      symbolVersion: symbol.version,
    },
  };
  return { group, children };
}

/** Find all symbol instance root elements on the current page. */
export function findSymbolInstances(elements: DesignElement[]): DesignElement[] {
  return elements.filter((element) => {
    const meta = element.meta as Record<string, unknown> | undefined;
    return typeof meta?.symbolId === "string";
  });
}

/** Return true when an instance is behind the latest version of its symbol. */
export function isInstanceOutdated(
  element: DesignElement,
  symbol: SymbolDefinition | undefined,
): boolean {
  const meta = element.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta.symbolId !== "string") return false;
  if (!symbol || meta.symbolId !== symbol.symbolId) return false;
  const instanceVersion = typeof meta.symbolVersion === "number" ? meta.symbolVersion : 0;
  return instanceVersion < symbol.version;
}
