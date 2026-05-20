import type { Entity, GeneratePageConfig } from "@/models";
import type { ResolvedGeneratePageConfig } from "@/features/generate/generatePanelProps";

export const ALL_VALUE = "__all__";

export function normalizeCount(value: number | undefined, fallback: number): number {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue)) return Math.max(1, fallback);
  return Math.max(1, Math.floor(numberValue));
}

export function resolveGeneratePageConfig(
  globalConfig: ResolvedGeneratePageConfig,
  pageConfig: GeneratePageConfig | undefined,
): ResolvedGeneratePageConfig {
  const onlyPartner = pageConfig?.onlyPartner ?? globalConfig.onlyPartner;
  return {
    selectedSheet: pageConfig?.selectedSheet ?? globalConfig.selectedSheet,
    filterMoHinh: pageConfig?.filterMoHinh ?? globalConfig.filterMoHinh,
    filterPhongCach: pageConfig?.filterPhongCach ?? globalConfig.filterPhongCach,
    prioritizePartner: pageConfig?.prioritizePartner ?? globalConfig.prioritizePartner,
    onlyPartner,
    partnerQuotaPerPage: onlyPartner
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, Math.floor(pageConfig?.partnerQuotaPerPage ?? globalConfig.partnerQuotaPerPage)),
    maxEntities: normalizeCount(pageConfig?.maxEntities, globalConfig.maxEntities),
  };
}

function entityMatchesGenerateSource(entity: Entity, config: ResolvedGeneratePageConfig): boolean {
  if (entity.status !== "active") return false;
  if (config.selectedSheet !== ALL_VALUE && entity.sheetName !== config.selectedSheet) return false;
  if (config.filterMoHinh !== ALL_VALUE && entity.categoryMain !== config.filterMoHinh) return false;
  if (config.filterPhongCach !== ALL_VALUE && entity.categorySub !== config.filterPhongCach) {
    return false;
  }
  return true;
}

export function buildSourceFilteredEntities(
  entities: Entity[],
  config: ResolvedGeneratePageConfig,
): Entity[] {
  return entities.filter((entity) => entityMatchesGenerateSource(entity, config));
}

export function buildConfiguredEntityPool(
  source: Entity[],
  config: ResolvedGeneratePageConfig,
): Entity[] {
  const list = source.filter((entity) => !config.onlyPartner || entity.partnerFlag);
  list.sort((a, b) => {
    if (config.prioritizePartner) {
      if (!!b.partnerFlag !== !!a.partnerFlag) return b.partnerFlag ? 1 : -1;
      if ((b.partnerPriority ?? 0) !== (a.partnerPriority ?? 0)) {
        return (b.partnerPriority ?? 0) - (a.partnerPriority ?? 0);
      }
    }
    return a.name.localeCompare(b.name, "vi");
  });
  return list;
}
