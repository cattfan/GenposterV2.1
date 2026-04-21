import type { Entity, RenderedItem } from "@/models";
import { buildEntityBindingTargets } from "@/engines/binding/cardRepeater";
import type { PageTemplate } from "@/models";

export interface EntityBindBatchState {
  usedEntityIds: Set<string>;
}

export interface AllocateEntityBindingsResult {
  items: RenderedItem[];
  assignedEntities: Entity[];
  warnings: string[];
}

function shuffleEntities(entities: Entity[]): Entity[] {
  const next = entities.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function buildEntityAllocationOrder(
  entities: Entity[],
  prioritizePartner: boolean,
): Entity[] {
  const partners = shuffleEntities(entities.filter((entity) => entity.partnerFlag));
  const others = shuffleEntities(entities.filter((entity) => !entity.partnerFlag));
  return prioritizePartner ? [...partners, ...others] : shuffleEntities([...partners, ...others]);
}

function pickEntityFromList(
  candidates: Entity[],
  pageUsedIds: Set<string>,
  batchState: EntityBindBatchState,
  unusedFirst: boolean,
): Entity | undefined {
  const filtered = candidates.filter((entity) => !pageUsedIds.has(entity.entityId));
  if (unusedFirst) {
    return filtered.find((entity) => !batchState.usedEntityIds.has(entity.entityId));
  }
  return filtered[0];
}

function selectEntityForTarget(params: {
  candidates: Entity[];
  pageUsedIds: Set<string>;
  batchState: EntityBindBatchState;
  preferPartner: boolean;
}): Entity | undefined {
  const { candidates, pageUsedIds, batchState, preferPartner } = params;
  const partners = candidates.filter((entity) => entity.partnerFlag);
  const others = candidates.filter((entity) => !entity.partnerFlag);
  const preferred = preferPartner ? partners : others;
  const fallback = preferPartner ? others : partners;

  return (
    pickEntityFromList(preferred, pageUsedIds, batchState, true) ??
    pickEntityFromList(preferred, pageUsedIds, batchState, false) ??
    pickEntityFromList(fallback, pageUsedIds, batchState, true) ??
    pickEntityFromList(fallback, pageUsedIds, batchState, false)
  );
}

export function allocateEntityBindingsForTemplate(params: {
  template: PageTemplate;
  orderedEntities: Entity[];
  pageOwner?: Entity;
  partnerQuota: number;
  prioritizePartner: boolean;
  batchState: EntityBindBatchState;
}): AllocateEntityBindingsResult {
  const { template, orderedEntities, pageOwner, partnerQuota, prioritizePartner, batchState } =
    params;
  const targets = buildEntityBindingTargets(template, orderedEntities);
  const warnings: string[] = [];

  if (targets.length === 0) {
    return { items: [], assignedEntities: [], warnings };
  }

  const clampedQuota = Math.max(0, Math.min(partnerQuota, targets.length));
  const pageUsedIds = new Set<string>();
  const assignments = new Map<string, Entity | null>();
  let remainingPartnerQuota = clampedQuota;

  if (pageOwner) {
    const ownerTarget = targets.find((target) =>
      target.candidateEntities.some((entity) => entity.entityId === pageOwner.entityId),
    );
    if (ownerTarget) {
      assignments.set(ownerTarget.targetId, pageOwner);
      pageUsedIds.add(pageOwner.entityId);
      if (pageOwner.partnerFlag && remainingPartnerQuota > 0) remainingPartnerQuota -= 1;
    }
  }

  const unassignedTargets = () => targets.filter((target) => !assignments.has(target.targetId));

  while (unassignedTargets().length > 0) {
    const remainingTargets = unassignedTargets();
    const target = remainingTargets[0];
    const preferPartner = clampedQuota > 0 ? remainingPartnerQuota > 0 : prioritizePartner;

    const chosen = selectEntityForTarget({
      candidates: target.candidateEntities,
      pageUsedIds,
      batchState,
      preferPartner,
    });

    if (!chosen) {
      warnings.push(`Page "${template.name}": không đủ entity khác nhau để fill toàn bộ block.`);
      assignments.set(target.targetId, null);
      continue;
    }

    assignments.set(target.targetId, chosen);
    pageUsedIds.add(chosen.entityId);
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

  return { items, assignedEntities, warnings };
}
