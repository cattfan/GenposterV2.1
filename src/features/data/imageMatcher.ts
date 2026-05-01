// Fuzzy match tên file ảnh ↔ tên quán (entity)
// Hỗ trợ tiếng Việt có/không dấu, slug, suffix -1 -2, ignore extension

import type { Entity } from "@/models";
import { getEntityImageReferences } from "./imageReferences";

/** Bỏ dấu tiếng Việt + lowercase + chỉ giữ a-z 0-9 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Bỏ extension và suffix kiểu -1, _2, (3) */
export function cleanFileName(fileName: string): string {
  const noExt = fileName.replace(/\.[a-z0-9]+$/i, "");
  const noSuffix = noExt
    .replace(/[-_\s]*\(?\d+\)?$/g, "") // -1, _2, (3)
    .trim();
  return noSuffix || noExt;
}

/** Levenshtein distance (cho fuzzy match khi không exact) */
function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array(n + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

export interface MatchResult {
  fileName: string;
  relativePath?: string;
  matchedEntityId: string | null;
  matchedEntityName: string | null;
  score: number; // 0-100
  reason: "exact" | "contains" | "fuzzy" | "no_match";
  autoAssign: boolean;
  needsReview: boolean;
}

export interface MatchOptions {
  /** Ngưỡng similarity 0..1 cho fuzzy match (mặc định 0.78) */
  fuzzyThreshold?: number;
}

export interface MatchInputFile {
  fileName: string;
  relativePath?: string;
}

function normalizeInput(input: string | MatchInputFile): MatchInputFile {
  if (typeof input === "string") return { fileName: input };
  return input;
}

function pathParts(relativePath?: string): string[] {
  if (!relativePath) return [];
  return relativePath
    .split(/[\\/]/)
    .slice(0, -1)
    .map((part) => slugify(part))
    .filter(Boolean);
}

function pathContextSlug(relativePath?: string): string {
  return pathParts(relativePath).join(" ");
}

function exactFolderEntityMatch(relativePath: string | undefined, entitySlugs: string[]): boolean {
  const parts = pathParts(relativePath);
  const parent = parts[parts.length - 1];
  if (!parent) return false;
  return entitySlugs.includes(parent);
}

function exactFolderSheetMatch(relativePath: string | undefined, entity: Entity): boolean {
  const parts = pathParts(relativePath);
  const sheetFolder = parts[parts.length - 2];
  if (!sheetFolder || !entity.sheetName) return false;
  const sheetSlug = slugify(entity.sheetName);
  return (
    sheetFolder === sheetSlug ||
    sheetFolder.includes(sheetSlug) ||
    sheetSlug.includes(sheetFolder)
  );
}

function entityContextScore(fileContext: string, entity: Entity): number {
  if (!fileContext) return 0;
  let score = 0;
  const category = slugify(entity.categoryMain ?? "");
  const sub = slugify(entity.categorySub ?? "");
  const sheet = slugify(entity.sheetName ?? "");
  if (category && fileContext.includes(category)) score += 0.08;
  if (sub && fileContext.includes(sub)) score += 0.05;
  if (sheet && fileContext.includes(sheet)) score += 0.08;
  return score;
}

/**
 * Match danh sách file với danh sách entity.
 * Ưu tiên: exact slug → contains → fuzzy (Levenshtein normalized).
 */
export function matchFilesToEntities(
  fileNames: Array<string | MatchInputFile>,
  entities: Entity[],
  opts: MatchOptions = {},
): MatchResult[] {
  const threshold = opts.fuzzyThreshold ?? 0.78;
  const entitySlugs = entities.map((e) => {
    const slug = slugify(e.name);
    const referenceSlugs = getEntityImageReferences(e).map(slugify).filter(Boolean);
    return {
      entity: e,
      slug,
      slugs: [...new Set([slug, ...referenceSlugs].filter(Boolean))],
    };
  });
  const entityBySlug = new Map<string, Array<(typeof entitySlugs)[number]>>();
  for (const item of entitySlugs) {
    for (const slug of item.slugs) {
      const bucket = entityBySlug.get(slug) ?? [];
      bucket.push(item);
      entityBySlug.set(slug, bucket);
    }
  }

  return fileNames.map((entry) => {
    const normalizedInput = normalizeInput(entry);
    const fn = normalizedInput.fileName;
    const cleaned = cleanFileName(fn);
    const fileSlug = slugify(cleaned);
    const contextSlug = pathContextSlug(normalizedInput.relativePath);

    const folderSlug = pathParts(normalizedInput.relativePath).at(-1);
    const exactFolderCandidates = folderSlug ? entityBySlug.get(folderSlug) ?? [] : [];
    const exactFolderMatch = exactFolderCandidates.find((es) => {
      const parentMatch = exactFolderEntityMatch(normalizedInput.relativePath, es.slugs);
      const sheetMatch =
        !es.entity.sheetName || exactFolderSheetMatch(normalizedInput.relativePath, es.entity);
      return parentMatch && sheetMatch;
    });
    if (exactFolderMatch) {
      return {
        fileName: fn,
        relativePath: normalizedInput.relativePath,
        matchedEntityId: exactFolderMatch.entity.entityId,
        matchedEntityName: exactFolderMatch.entity.name,
        score: 100,
        reason: "exact",
        autoAssign: true,
        needsReview: false,
      };
    }

    // 1. Exact match
    const exact =
      (entityBySlug.get(fileSlug) ?? []).find(
        (es) => !es.entity.sheetName || exactFolderSheetMatch(normalizedInput.relativePath, es.entity),
      ) ??
      entitySlugs.find((es) => contextSlug && es.slugs.some((slug) => contextSlug.includes(slug)));
    if (exact) {
      return {
        fileName: fn,
        relativePath: normalizedInput.relativePath,
        matchedEntityId: exact.entity.entityId,
        matchedEntityName: exact.entity.name,
        score: 100,
        reason: "exact",
        autoAssign: true,
        needsReview: false,
      };
    }

    // 2. Contains (file slug chứa entity slug hoặc ngược lại)
    let bestContain: { e: typeof entitySlugs[0]; score: number } | null = null;
    for (const es of entitySlugs) {
      if (es.slugs.length === 0) continue;
      const nameOverlap = Math.max(
        ...es.slugs.map((slug) =>
          fileSlug.includes(slug) || slug.includes(fileSlug)
            ? Math.min(fileSlug.length, slug.length) / Math.max(fileSlug.length, slug.length)
            : 0,
        ),
      );
      const overlap = nameOverlap + entityContextScore(contextSlug, es.entity);
      if (nameOverlap > 0 || overlap > 0.12) {
        if (!bestContain || overlap > bestContain.score) {
          bestContain = { e: es, score: overlap };
        }
      }
    }
    if (bestContain && bestContain.score >= 0.5) {
      const containScore = Math.min(99, Math.round(82 + bestContain.score * 12));
      return {
        fileName: fn,
        relativePath: normalizedInput.relativePath,
        matchedEntityId: bestContain.e.entity.entityId,
        matchedEntityName: bestContain.e.entity.name,
        score: containScore,
        reason: "contains",
        autoAssign: containScore >= 92,
        needsReview: containScore < 92,
      };
    }

    // 3. Fuzzy via Levenshtein
    let bestFuzzy: { e: typeof entitySlugs[0]; sim: number } | null = null;
    for (const es of entitySlugs) {
      if (es.slugs.length === 0) continue;
      const bestSlugSim = Math.max(
        ...es.slugs.map((slug) => {
          const dist = lev(fileSlug, slug);
          return 1 - dist / Math.max(fileSlug.length, slug.length);
        }),
      );
      const sim = bestSlugSim + entityContextScore(contextSlug, es.entity);
      if (!bestFuzzy || sim > bestFuzzy.sim) {
        bestFuzzy = { e: es, sim };
      }
    }
    if (bestFuzzy && bestFuzzy.sim >= threshold) {
      const fuzzyScore = Math.min(95, Math.round(bestFuzzy.sim * 80));
      return {
        fileName: fn,
        relativePath: normalizedInput.relativePath,
        matchedEntityId: bestFuzzy.e.entity.entityId,
        matchedEntityName: bestFuzzy.e.entity.name,
        score: fuzzyScore,
        reason: "fuzzy",
        autoAssign: fuzzyScore >= 90,
        needsReview: true,
      };
    }

    return {
      fileName: fn,
      relativePath: normalizedInput.relativePath,
      matchedEntityId: null,
      matchedEntityName: null,
      score: 0,
      reason: "no_match",
      autoAssign: false,
      needsReview: true,
    };
  });
}
