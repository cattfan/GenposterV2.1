import type {
  Asset,
  Entity,
  GenerationJob as Job,
  PackDraftState,
  PackTemplate,
  PageTemplate,
} from "@/models";
import {
  getEntityImageReferencesWithAssets,
  getImageReferenceEntityIds,
  isUsableImageAsset,
} from "@/features/data/imageReferences";

export interface DashboardIssue {
  label: string;
  detail: string;
  to: string;
  search?: { tab: "images" };
  tone: "good" | "warning" | "danger" | "neutral";
}

export type NextActionId =
  | "no-data"
  | "no-template"
  | "download-images"
  | "incomplete-pack"
  | "warnings"
  | "ai"
  | "ready";

export interface NextAction {
  id: NextActionId;
  title: string;
  detail: string;
  to: string;
  search?: { tab: "images" } | Record<string, string>;
  tone: "danger" | "warning" | "neutral" | "success";
}

export interface DashboardPackRef {
  packTemplateId: string;
  packName: string;
  boundCount: number;
  totalBindable: number;
  lastOpenedAt: number;
}

export interface DashboardJobRow {
  jobId: string;
  name: string;
  pageCount: number;
  warningCount: number;
  createdAt: number;
  status: "draft" | "generated" | "exported";
}

export interface DashboardSummaryInput {
  packTemplates: PackTemplate[];
  pageTemplates: PageTemplate[];
  entities: Entity[];
  assets: Asset[];
  jobs: Job[];
  blobCount: number;
  presetCount: number;
  analysisCount: number;
  aiConfigured: boolean;
  packDrafts: PackDraftState[];
}

function countBindableSlots(pack: PackTemplate, pageTemplates: PageTemplate[]): number {
  const byId = new Map(pageTemplates.map((p) => [p.pageTemplateId, p]));
  let total = 0;
  for (const id of pack.orderedPages ?? []) {
    const tpl = byId.get(id);
    if (!tpl) continue;
    for (const slot of tpl.slots ?? []) {
      if (slot.kind === "text" || slot.kind === "image" || slot.kind === "shape") total += 1;
    }
  }
  return total;
}

function countBoundSlots(packOv: PackDraftState["packOv"]): number {
  let total = 0;
  for (const page of Object.values(packOv ?? {})) {
    for (const value of Object.values(page ?? {})) {
      if (value) total += 1;
    }
  }
  return total;
}

function pickIncompletePack(
  packDrafts: PackDraftState[],
  packs: PackTemplate[],
  pageTemplates: PageTemplate[],
): DashboardPackRef | undefined {
  const packById = new Map(packs.map((p) => [p.packTemplateId, p]));
  const candidates: DashboardPackRef[] = [];
  for (const draft of packDrafts) {
    const pack = packById.get(draft.packTemplateId);
    if (!pack) continue;
    const bindable = countBindableSlots(pack, pageTemplates);
    const bound = countBoundSlots(draft.packOv);
    if (bound === 0 || bindable === 0 || bound >= bindable) continue;
    candidates.push({
      packTemplateId: draft.packTemplateId,
      packName: pack.name,
      boundCount: bound,
      totalBindable: bindable,
      lastOpenedAt: draft.lastOpenedAt,
    });
  }
  candidates.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return candidates[0];
}

function pickRecentPack(
  packDrafts: PackDraftState[],
  packs: PackTemplate[],
  pageTemplates: PageTemplate[],
  jobs: Job[],
  excludeId: string | undefined,
): DashboardPackRef | undefined {
  const packById = new Map(packs.map((p) => [p.packTemplateId, p]));
  const latestJobByPack = new Map<string, number>();
  for (const job of jobs) {
    const previous = latestJobByPack.get(job.packTemplateId) ?? 0;
    if (job.createdAt > previous) latestJobByPack.set(job.packTemplateId, job.createdAt);
  }
  const candidates: DashboardPackRef[] = [];
  for (const draft of packDrafts) {
    if (draft.packTemplateId === excludeId) continue;
    const pack = packById.get(draft.packTemplateId);
    if (!pack) continue;
    const latestJobAt = latestJobByPack.get(draft.packTemplateId) ?? 0;
    if (draft.lastOpenedAt <= latestJobAt) continue;
    const bindable = countBindableSlots(pack, pageTemplates);
    const bound = countBoundSlots(draft.packOv);
    candidates.push({
      packTemplateId: draft.packTemplateId,
      packName: pack.name,
      boundCount: bound,
      totalBindable: bindable,
      lastOpenedAt: draft.lastOpenedAt,
    });
  }
  candidates.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return candidates[0];
}

function buildRecentJobs(jobs: Job[]): DashboardJobRow[] {
  return jobs.slice(0, 5).map((job) => ({
    jobId: job.jobId,
    name: job.packTemplateName,
    pageCount: job.pages.length,
    warningCount: job.pages.reduce((sum, page) => sum + page.warnings.length, 0),
    createdAt: job.createdAt,
    status: job.status,
  }));
}

export function buildDashboardSummary(input: DashboardSummaryInput) {
  const {
    packTemplates,
    pageTemplates,
    entities,
    assets,
    jobs,
    blobCount,
    presetCount,
    analysisCount,
    aiConfigured,
  } = input;

  const sheetNames = Array.from(
    new Set(entities.map((entity) => entity.sheetName).filter((sheetName): sheetName is string => Boolean(sheetName))),
  );
  const activeEntities = entities.filter((entity) => entity.status === "active").length;
  const partnerEntities = entities.filter((entity) => entity.partnerFlag).length;
  const usableAssets = assets.filter(isUsableImageAsset);
  const localAssets = usableAssets.filter((asset) => asset.blobKey).length;
  const linkAssets = usableAssets.filter((asset) => !asset.blobKey && asset.sourceValue).length;
  const brokenAssets = assets.filter((asset) => asset.status === "broken").length;
  const missingAssets = assets.filter((asset) => asset.status === "missing" || !asset.sourceValue).length;
  const assetEntityIds = new Set(usableAssets.map((asset) => asset.entityId).filter(Boolean));
  const assetsByEntityId = new Map<string, Asset[]>();
  for (const asset of assets) {
    const group = assetsByEntityId.get(asset.entityId) ?? [];
    group.push(asset);
    assetsByEntityId.set(asset.entityId, group);
  }
  const imageReferenceEntityIds = getImageReferenceEntityIds(entities, assets);
  const entitiesWithoutAssets = entities.filter((entity) => !assetEntityIds.has(entity.entityId)).length;
  const entitiesWithReferenceOnly = entities.filter(
    (entity) => !assetEntityIds.has(entity.entityId) && imageReferenceEntityIds.has(entity.entityId),
  ).length;
  const entitiesWithoutAnyImageSource = entities.filter(
    (entity) => !assetEntityIds.has(entity.entityId) && !imageReferenceEntityIds.has(entity.entityId),
  ).length;
  const driveDownloadCandidateCount = entities.filter(
    (entity) =>
      !assetEntityIds.has(entity.entityId) &&
      getEntityImageReferencesWithAssets(entity, assetsByEntityId.get(entity.entityId) ?? []).length > 0,
  ).length;
  const latestJob = jobs[0] ?? null;
  const renderedPages = jobs.reduce((sum, job) => sum + job.pages.length, 0);
  const exportedJobs = jobs.filter((job) => job.status === "exported").length;
  const latestJobWarnings = latestJob?.pages.reduce((sum, page) => sum + page.warnings.length, 0) ?? 0;
  const totalSlots = pageTemplates.reduce((sum, template) => sum + template.slots.length, 0);
  const mappedSlots = pageTemplates.reduce(
    (sum, template) =>
      sum +
      template.slots.filter(
        (slot) => Boolean(slot.bindingPath) || slot.fieldParts?.some((part) => part.kind === "field" && part.bindingPath),
      ).length,
    0,
  );

  const issues: DashboardIssue[] = [];
  if (entities.length === 0) {
    issues.push({
      label: "Chưa có dữ liệu",
      detail: "Nhập XLSX/CSV hoặc Google Sheet trước khi tạo nội dung.",
      to: "/data",
      tone: "danger",
    });
  }
  if (packTemplates.length === 0 || pageTemplates.length === 0) {
    issues.push({
      label: "Chưa có khuôn mẫu",
      detail: "Cần bộ khuôn và trang khuôn để tạo nội dung.",
      to: "/templates",
      tone: "danger",
    });
  }
  if (assets.length === 0) {
    issues.push({
      label: driveDownloadCandidateCount > 0 ? "Chưa ghép/tải ảnh" : "Chưa có ảnh",
      detail:
        driveDownloadCandidateCount > 0
          ? `Có ${driveDownloadCandidateCount} dòng có tên folder/link trong sheet; cần tải ảnh về data/images.`
          : "Dữ liệu có thể đã nhập nhưng chưa có ảnh.",
      to: "/data",
      search: driveDownloadCandidateCount > 0 ? { tab: "images" } : undefined,
      tone: "danger",
    });
  } else if (linkAssets > 0) {
    issues.push({
      label: "Ảnh link chưa tải về",
      detail: `${linkAssets} ảnh đang là đường dẫn, nên tải về để sao lưu đủ ảnh.`,
      to: "/data",
      tone: "warning",
    });
  }
  if (entitiesWithoutAssets > 0) {
    issues.push({
      label: entitiesWithReferenceOnly > 0 ? "Có folder/link nhưng chưa ghép ảnh" : "Dòng chưa có ảnh",
      detail:
        entitiesWithReferenceOnly > 0
          ? `${entitiesWithReferenceOnly} dòng đã có tên folder/link nhưng chưa có ảnh đọc được.`
          : `${entitiesWithoutAssets} dòng chưa có ảnh đọc được.`,
      to: "/data",
      search: driveDownloadCandidateCount > 0 ? { tab: "images" } : undefined,
      tone: assets.length === 0 ? "danger" : "warning",
    });
  }
  if (brokenAssets > 0 || missingAssets > 0) {
    issues.push({
      label: "Ảnh lỗi",
      detail: `${brokenAssets + missingAssets} ảnh đang lỗi hoặc thiếu nguồn.`,
      to: "/data",
      tone: "danger",
    });
  }
  if (!aiConfigured) {
    issues.push({
      label: "AI chưa cấu hình",
      detail: "Thiết lập base URL và model để dùng các tính năng AI.",
      to: "/settings",
      tone: "warning",
    });
  }
  if (latestJobWarnings > 0) {
    issues.push({
      label: "Lần tạo gần nhất có cảnh báo",
      detail: `${latestJobWarnings} cảnh báo trong lần tạo gần nhất.`,
      to: "/history",
      tone: "warning",
    });
  }

  return {
    packTemplates: packTemplates.length,
    pageTemplates: pageTemplates.length,
    entities: entities.length,
    activeEntities,
    partnerEntities,
    sheetCount: sheetNames.length,
    sheetNames,
    assets: assets.length,
    localAssets,
    linkAssets,
    driveDownloadCandidateCount,
    entitiesWithReferenceOnly,
    entitiesWithoutAnyImageSource,
    blobCount,
    brokenAssets,
    missingAssets,
    entitiesWithoutAssets,
    jobs: jobs.length,
    renderedPages,
    exportedJobs,
    latestJobWarnings,
    presetCount,
    analysisCount,
    totalSlots,
    mappedSlots,
    aiConfigured,
    issues,
  };
}
