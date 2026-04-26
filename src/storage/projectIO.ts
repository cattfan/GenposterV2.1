import { db } from "./db";
import type {
  Asset,
  AssetItem,
  BrandKit,
  DesignDocument,
  Entity,
  FontAsset,
  GenerationJob,
  ManualOverride,
  PackTemplate,
  PageTemplate,
  Project,
} from "@/models";

export interface ProjectExportV1 {
  version: 1;
  exportedAt: number;
  project: Project | null;
  entities: Entity[];
  assets: Asset[];
  pageTemplates: PageTemplate[];
  packTemplates: PackTemplate[];
  jobs: GenerationJob[];
  overrides: ManualOverride[];
}

export interface ProjectExportV2 extends Omit<ProjectExportV1, "version"> {
  version: 2;
  designDocuments: DesignDocument[];
  assetLibrary: AssetItem[];
  brandKits: BrandKit[];
  fontAssets: FontAsset[];
}

export type ProjectExport = ProjectExportV1 | ProjectExportV2;

export async function exportProjectJSON(): Promise<ProjectExportV2> {
  const [
    project,
    entities,
    assets,
    assetLibrary,
    brandKits,
    designDocuments,
    fontAssets,
    pageTemplates,
    packTemplates,
    jobs,
    overrides,
  ] = await Promise.all([
    db.projects.toCollection().first(),
    db.entities.toArray(),
    db.assets.toArray(),
    db.assetLibrary.toArray(),
    db.brandKits.toArray(),
    db.designDocuments.toArray(),
    db.fontAssets.toArray(),
    db.pageTemplates.toArray(),
    db.packTemplates.toArray(),
    db.jobs.toArray(),
    db.overrides.toArray(),
  ]);

  return {
    version: 2,
    exportedAt: Date.now(),
    project: project ?? null,
    entities,
    assets,
    assetLibrary,
    brandKits,
    designDocuments,
    fontAssets,
    pageTemplates,
    packTemplates,
    jobs,
    overrides,
  };
}

export async function importProjectJSON(data: ProjectExport): Promise<void> {
  if (data.version !== 1 && data.version !== 2) {
    throw new Error("Phiên bản project export không hỗ trợ");
  }

  const assetLibrary = data.version === 2 ? data.assetLibrary : [];
  const brandKits = data.version === 2 ? data.brandKits : [];
  const designDocuments = data.version === 2 ? data.designDocuments : [];
  const fontAssets = data.version === 2 ? data.fontAssets : [];

  await db.transaction(
    "rw",
    [
      db.projects,
      db.entities,
      db.assets,
      db.assetLibrary,
      db.brandKits,
      db.designDocuments,
      db.fontAssets,
      db.pageTemplates,
      db.packTemplates,
      db.jobs,
      db.overrides,
    ],
    async () => {
      if (data.project) await db.projects.put(data.project);
      await db.entities.bulkPut(data.entities);
      await db.assets.bulkPut(data.assets);
      await db.assetLibrary.bulkPut(assetLibrary);
      await db.brandKits.bulkPut(brandKits);
      await db.designDocuments.bulkPut(designDocuments);
      await db.fontAssets.bulkPut(fontAssets);
      await db.pageTemplates.bulkPut(data.pageTemplates);
      await db.packTemplates.bulkPut(data.packTemplates);
      await db.jobs.bulkPut(data.jobs);
      await db.overrides.bulkPut(data.overrides);
    },
  );
}
