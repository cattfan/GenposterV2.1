import type { Entity, RenderedItem } from "@/models";
import { buildEntityBindingTargets } from "@/engines/binding/cardRepeater";
import type { PageTemplate } from "@/models";

export interface EntityBindBatchState {
  usedEntityIds: Set<string>;
  usedEntityKeys?: Set<string>;
}

export interface AllocateEntityBindingsResult {
  items: RenderedItem[];
  assignedEntities: Entity[];
  warnings: string[];
}

function sortByName(entities: Entity[]): Entity[] {
  return entities.slice().sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function createSeededRandom(seed: string): () => number {
  let state = stableHash(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const next = items.slice();
  const random = createSeededRandom(seed);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function sortPartnersByPriority(entities: Entity[], seed?: string): Entity[] {
  const buckets = new Map<number, Entity[]>();
  for (const entity of entities) {
    const priority = Number(entity.partnerPriority ?? 0);
    const bucket = buckets.get(priority) ?? [];
    bucket.push(entity);
    buckets.set(priority, bucket);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0])
    .flatMap(([priority, bucket]) =>
      seed ? shuffleWithSeed(bucket, `${seed}:partner:${priority}`) : sortByName(bucket),
    );
}

function normalizeEntityKeyPart(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function entityContentKey(entity: Entity): string {
  const name = normalizeEntityKeyPart(entity.name);
  const address = normalizeEntityKeyPart(entity.address ?? entity.metadata?.address);
  const sheet = normalizeEntityKeyPart(entity.sheetName);
  if (name) return `${sheet}|${name}`;
  if (address) return `${sheet}|address:${address}`;
  return entity.entityId;
}

/**
 * Returns entities in allocation order.
 * - `prioritizePartner: true` → partners first (by descending priority, randomised within bucket), then others randomised.
 * - `prioritizePartner: false` → all entities mixed and randomised.
 * - `seed` omitted → legacy deterministic alphabetical order (kept for tests/backwards compat).
 */
export function buildEntityAllocationOrder(
  entities: Entity[],
  prioritizePartner: boolean,
  seed?: string,
): Entity[] {
  const partners = entities.filter((entity) => entity.partnerFlag);
  const others = entities.filter((entity) => !entity.partnerFlag);

  if (!seed) {
    const partnersSorted = sortPartnersByPriority(partners);
    const othersSorted = sortByName(others);
    return prioritizePartner
      ? [...partnersSorted, ...othersSorted]
      : sortByName([...partnersSorted, ...othersSorted]);
  }

  const partnersOrdered = prioritizePartner
    ? sortPartnersByPriority(partners, seed)
    : shuffleWithSeed(partners, `${seed}:partners`);
  const othersOrdered = shuffleWithSeed(others, `${seed}:others`);
  return prioritizePartner
    ? [...partnersOrdered, ...othersOrdered]
    : shuffleWithSeed([...partnersOrdered, ...othersOrdered], `${seed}:combined`);
}

function pickEntityFromList(
  candidates: Entity[],
  pageUsedKeys: Set<string>,
  batchState: EntityBindBatchState,
): Entity | undefined {
  const batchUsedKeys = batchState.usedEntityKeys;
  const filtered = candidates.filter((entity) => !pageUsedKeys.has(entityContentKey(entity)));
  return filtered.find(
    (entity) =>
      !batchState.usedEntityIds.has(entity.entityId) &&
      !batchUsedKeys?.has(entityContentKey(entity)),
  );
}

function pickEntityByPartnerMode(params: {
  candidates: Entity[];
  pageUsedKeys: Set<string>;
  batchState: EntityBindBatchState;
  partnerMode: "partner" | "non-partner" | "any";
}): Entity | undefined {
  const { candidates, pageUsedKeys, batchState, partnerMode } = params;
  const pool =
    partnerMode === "partner"
      ? candidates.filter((entity) => entity.partnerFlag)
      : partnerMode === "non-partner"
        ? candidates.filter((entity) => !entity.partnerFlag)
        : candidates;

  return pickEntityFromList(pool, pageUsedKeys, batchState);
}

export function allocateEntityBindingsForTemplate(params: {
  template: PageTemplate;
  orderedEntities: Entity[];
  pageOwner?: Entity;
  partnerQuota: number;
  prioritizePartner: boolean;
  batchState: EntityBindBatchState;
  /** targetId → entityId: giữ assignment preview khi chỉnh nhóm/trường khác. */
  pinnedAssignments?: Map<string, string>;
}): AllocateEntityBindingsResult {
  const { template, orderedEntities, pageOwner, partnerQuota, batchState, pinnedAssignments } =
    params;
  const targets = buildEntityBindingTargets(template, orderedEntities);
  const warnings: string[] = [];

  if (targets.length === 0) {
    return { items: [], assignedEntities: [], warnings };
  }

  const clampedQuota = Math.max(0, Math.min(Math.floor(partnerQuota || 0), targets.length));
  const pageUsedIds = new Set<string>();
  const pageUsedKeys = new Set<string>();
  const assignments = new Map<string, Entity | null>();
  let remainingPartnerQuota = clampedQuota;

  if (pageOwner) {
    const ownerTarget = targets.find((target) =>
      target.candidateEntities.some((entity) => entity.entityId === pageOwner.entityId),
    );
    const canAssignOwnerWithoutBreakingQuota = pageOwner.partnerFlag
      ? remainingPartnerQuota > 0
      : targets.length - 1 >= remainingPartnerQuota;

    if (ownerTarget && canAssignOwnerWithoutBreakingQuota) {
      assignments.set(ownerTarget.targetId, pageOwner);
      pageUsedIds.add(pageOwner.entityId);
      pageUsedKeys.add(entityContentKey(pageOwner));
      if (pageOwner.partnerFlag) remainingPartnerQuota -= 1;
    }
  }

  if (pinnedAssignments?.size) {
    for (const target of targets) {
      if (assignments.has(target.targetId)) continue;
      const pinnedId = pinnedAssignments.get(target.targetId);
      if (!pinnedId) continue;
      const pinned = target.candidateEntities.find((entity) => entity.entityId === pinnedId);
      if (!pinned) continue;
      assignments.set(target.targetId, pinned);
      pageUsedIds.add(pinned.entityId);
      pageUsedKeys.add(entityContentKey(pinned));
      if (pinned.partnerFlag && remainingPartnerQuota > 0) {
        remainingPartnerQuota -= 1;
      }
    }
  }

  const unassignedTargets = () => targets.filter((target) => !assignments.has(target.targetId));

  while (unassignedTargets().length > 0) {
    const remainingTargets = unassignedTargets();
    const target = remainingTargets[0];

    let chosen = pickEntityByPartnerMode({
      candidates: target.candidateEntities,
      pageUsedKeys,
      batchState,
      partnerMode: remainingPartnerQuota > 0 ? "partner" : "any",
    });

    if (!chosen && remainingPartnerQuota > 0) {
      warnings.push(
        `Page "${template.name}": khong du doi tac de dat quota ${clampedQuota}/trang.`,
      );
      chosen = pickEntityByPartnerMode({
        candidates: target.candidateEntities,
        pageUsedKeys,
        batchState,
        partnerMode: "any",
      });
    }

    if (!chosen) {
      warnings.push(
        `Page "${template.name}": khong du entity de gan du lieu.`,
      );
      assignments.set(target.targetId, null);
      continue;
    }

    assignments.set(target.targetId, chosen);
    pageUsedIds.add(chosen.entityId);
    pageUsedKeys.add(entityContentKey(chosen));
    if (chosen.partnerFlag && remainingPartnerQuota > 0) {
      remainingPartnerQuota -= 1;
    }
  }

  const items: RenderedItem[] = [];
  const assignedEntities: Entity[] = [];

  for (const target of targets) {
    const entity = assignments.get(target.targetId);
    if (!entity) continue;

    assignedEntities.push(entity);
    for (const slotId of target.slotIds) {
      items.push({
        slotId,
        entityId: entity.entityId,
        partnerFlag: entity.partnerFlag,
        partnerPriority: entity.partnerPriority,
        reasonCodes: [`entity_bind:${target.targetId}`],
      });
    }
  }

  for (const entityId of pageUsedIds) {
    batchState.usedEntityIds.add(entityId);
  }
  if (!batchState.usedEntityKeys) batchState.usedEntityKeys = new Set<string>();
  for (const entityKey of pageUsedKeys) {
    batchState.usedEntityKeys.add(entityKey);
  }

  return { items, assignedEntities, warnings };
}
