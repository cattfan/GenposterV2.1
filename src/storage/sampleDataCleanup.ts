import { db } from "./db";
import type { GenerationJob, ManualOverride, PackTemplate, PageTemplate } from "@/models";

const SEED_FLAG = "cpg_seeded_v1";
const CLEANUP_FLAG = "cpg_demo_data_removed_v1";

// Demo cleanup is OFF by default. Early builds seeded some demo entities whose
// names could collide with real user entities ("Cafe May Lang Thang", etc.);
// running this heuristic on user data risks destroying legitimate records, so
// we keep the function exported for explicit invocation but short-circuit by
// default. Set this flag to `true` (or call cleanupDemoData({ force: true }))
// only when you are sure the DB only holds demo seed content.
const DEMO_CLEANUP_ENABLED = false;

const DEMO_IMAGE_IDS = [
  "photo-1554118811-1e0d58224f24",
  "photo-1521017432531-fbd92d768814",
  "photo-1567620905732-2d1ec7ab7445",
  "photo-1565299624946-b28f40a0ae38",
  "photo-1546069901-ba9599a7e63c",
  "photo-1501785888041-af3ef285b470",
  "photo-1564013799919-ab600027ffc6",
  "photo-1502877338535-766e1452684a",
  "photo-1506905925346-21bda4d32df4",
  "photo-1464822759023-fed622ff2c3b",
  "photo-1540555700478-4be289fbecef",
  "photo-1469474968028-56623f02e42e",
  "photo-1500530855697-b586d89ba3ee",
];

const DEMO_ENTITY_SLUGS = new Set([
  "cafe may lang thang",
  "quan bun bo am",
  "banh trang nuong co hoa",
  "lau ga la e tao ngo",
  "homestay tren doi",
  "pine house homestay",
  "thue xe may an tam",
  "auto da lat thue xe tu lai",
  "doi che cau dat",
  "ho tuyen lam",
  "spa thu gian an yen",
  "cafe the wilder nest",
]);

const DEMO_PROJECT_SLUGS = new Set(["da lat demo pack"]);

const DEMO_PACK_SLUG_PREFIXES = ["pack da lat cuoi tuan", "lich trinh du lich linh hoat"];

const DEMO_PAGE_SLUG_PREFIXES = [
  "trang bia cover da lat",
  "lich trinh ngay 1 itinerary",
  "board mixed homestay thue xe spa",
  "cover lich trinh du lich",
  "tien ich di chuyen homestay khac",
];

export type DemoCleanupResult = {
  projects: number;
  entities: number;
  assets: number;
  pageTemplates: number;
  packTemplates: number;
  jobs: number;
  overrides: number;
  total: number;
};

function emptyResult(): DemoCleanupResult {
  return {
    projects: 0,
    entities: 0,
    assets: 0,
    pageTemplates: 0,
    packTemplates: 0,
    jobs: 0,
    overrides: 0,
    total: 0,
  };
}

function localStore(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function slugify(value = ""): string {
  return value
    .replace(/\u0110/g, "D")
    .replace(/\u0111/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasDemoImage(sourceValue?: string): boolean {
  return Boolean(sourceValue && DEMO_IMAGE_IDS.some((id) => sourceValue.includes(id)));
}

function isDemoPack(pack: PackTemplate): boolean {
  const packSlug = slugify(pack.name);
  return DEMO_PACK_SLUG_PREFIXES.some((prefix) => packSlug.startsWith(prefix));
}

function isDemoPage(page: PageTemplate): boolean {
  const pageSlug = slugify(page.name);
  return (
    DEMO_PAGE_SLUG_PREFIXES.some((prefix) => pageSlug.startsWith(prefix)) ||
    /^ngay \d+ zigzag/.test(pageSlug) ||
    page.slots.some((slot) => hasDemoImage(slot.staticImage))
  );
}

function isDemoJob(job: GenerationJob, demoPackIds: Set<string>, demoPageIds: Set<string>) {
  return (
    demoPackIds.has(job.packTemplateId) ||
    job.pages.some((page) => demoPageIds.has(page.pageTemplateId))
  );
}

function isDemoOverride(
  override: ManualOverride,
  demoPackIds: Set<string>,
  demoPageIds: Set<string>,
  demoEntityIds: Set<string>,
  demoAssetIds: Set<string>,
) {
  return (
    demoPackIds.has(override.packTemplateId) ||
    (override.pageTemplateId ? demoPageIds.has(override.pageTemplateId) : false) ||
    (override.pinEntityId ? demoEntityIds.has(override.pinEntityId) : false) ||
    (override.pinAssetId ? demoAssetIds.has(override.pinAssetId) : false) ||
    (override.excludeEntityIds ?? []).some((id) => demoEntityIds.has(id)) ||
    (override.excludeAssetIds ?? []).some((id) => demoAssetIds.has(id))
  );
}

function needsPackReferenceUpdate(pack: PackTemplate, demoPageIds: Set<string>): boolean {
  return (
    pack.orderedPages.some((id) => demoPageIds.has(id)) ||
    pack.requiredPages.some((id) => demoPageIds.has(id)) ||
    pack.optionalPages.some((id) => demoPageIds.has(id))
  );
}

function stripDemoPageRefs(pack: PackTemplate, demoPageIds: Set<string>): PackTemplate {
  return {
    ...pack,
    orderedPages: pack.orderedPages.filter((id) => !demoPageIds.has(id)),
    requiredPages: pack.requiredPages.filter((id) => !demoPageIds.has(id)),
    optionalPages: pack.optionalPages.filter((id) => !demoPageIds.has(id)),
    updatedAt: Date.now(),
  };
}

async function bulkDelete<T extends string>(ids: T[], deleteFn: (ids: T[]) => Promise<unknown>) {
  if (ids.length > 0) await deleteFn(ids);
}

export async function cleanupDemoData(options?: { force?: boolean }): Promise<DemoCleanupResult> {
  const storage = localStore();
  if (!options?.force && !DEMO_CLEANUP_ENABLED) {
    // Mark as done so the app stops re-checking on every load.
    storage?.setItem(CLEANUP_FLAG, "1");
    return emptyResult();
  }
  if (storage?.getItem(CLEANUP_FLAG) === "1") return emptyResult();

  const [projects, entities, assets, pages, packs, jobs, overrides] = await Promise.all([
    db.projects.toArray(),
    db.entities.toArray(),
    db.assets.toArray(),
    db.pageTemplates.toArray(),
    db.packTemplates.toArray(),
    db.jobs.toArray(),
    db.overrides.toArray(),
  ]);

  const demoEntityIds = new Set<string>(
    entities
      .filter((entity) => DEMO_ENTITY_SLUGS.has(slugify(entity.name)))
      .map((entity) => entity.entityId),
  );

  const demoAssetIds = new Set<string>();
  for (const asset of assets) {
    if (hasDemoImage(asset.sourceValue)) {
      demoAssetIds.add(asset.assetId);
      demoEntityIds.add(asset.entityId);
    }
  }
  for (const asset of assets) {
    if (demoEntityIds.has(asset.entityId)) demoAssetIds.add(asset.assetId);
  }

  const demoPageIds = new Set<string>(
    pages.filter((page) => isDemoPage(page)).map((page) => page.pageTemplateId),
  );

  const demoPackIds = new Set<string>(
    packs.filter((pack) => isDemoPack(pack)).map((pack) => pack.packTemplateId),
  );
  for (const pack of packs) {
    if (!demoPackIds.has(pack.packTemplateId)) continue;
    pack.orderedPages.forEach((pageId) => demoPageIds.add(pageId));
  }

  const projectIds = projects
    .filter((project) => DEMO_PROJECT_SLUGS.has(slugify(project.name)))
    .map((project) => project.projectId);
  const entityIds = [...demoEntityIds];
  const assetIds = [...demoAssetIds];
  const pageIds = [...demoPageIds];
  const packIds = [...demoPackIds];
  const jobIds = jobs
    .filter((job) => isDemoJob(job, demoPackIds, demoPageIds))
    .map((job) => job.jobId);
  const overrideIds = overrides
    .filter((override) =>
      isDemoOverride(override, demoPackIds, demoPageIds, demoEntityIds, demoAssetIds),
    )
    .map((override) => override.overrideId);
  const packsToUpdate = packs
    .filter((pack) => !demoPackIds.has(pack.packTemplateId))
    .filter((pack) => needsPackReferenceUpdate(pack, demoPageIds))
    .map((pack) => stripDemoPageRefs(pack, demoPageIds));

  await db.transaction(
    "rw",
    [
      db.projects,
      db.entities,
      db.assets,
      db.pageTemplates,
      db.packTemplates,
      db.jobs,
      db.overrides,
    ],
    async () => {
      await bulkDelete(projectIds, (ids) => db.projects.bulkDelete(ids));
      await bulkDelete(entityIds, (ids) => db.entities.bulkDelete(ids));
      await bulkDelete(assetIds, (ids) => db.assets.bulkDelete(ids));
      await bulkDelete(pageIds, (ids) => db.pageTemplates.bulkDelete(ids));
      await bulkDelete(packIds, (ids) => db.packTemplates.bulkDelete(ids));
      await bulkDelete(jobIds, (ids) => db.jobs.bulkDelete(ids));
      await bulkDelete(overrideIds, (ids) => db.overrides.bulkDelete(ids));
      if (packsToUpdate.length > 0) await db.packTemplates.bulkPut(packsToUpdate);
    },
  );

  storage?.removeItem(SEED_FLAG);
  storage?.setItem(CLEANUP_FLAG, "1");

  const result = {
    projects: projectIds.length,
    entities: entityIds.length,
    assets: assetIds.length,
    pageTemplates: pageIds.length,
    packTemplates: packIds.length,
    jobs: jobIds.length,
    overrides: overrideIds.length,
    total:
      projectIds.length +
      entityIds.length +
      assetIds.length +
      pageIds.length +
      packIds.length +
      jobIds.length +
      overrideIds.length,
  };

  return result;
}
