import JSZip from "jszip";
import { db, clearAll } from "./db";
import { getSettings } from "./settings";
import { importProjectJSON, type ProjectExport } from "./projectIO";
import type {
  AnalysisRecord,
  AppSettings,
  Asset,
  AssetItem,
  BlobRecord,
  BrandKit,
  DesignDocument,
  Entity,
  FontAsset,
  GenerateBindingPreset,
  GenerationJob,
  ManualOverride,
  PackTemplate,
  PageTemplate,
  Project,
} from "@/models";

export type SystemBackupImportMode = "replace" | "merge";

interface BackupBlobMeta {
  blobKey: string;
  mime: string;
  createdAt: number;
  path: string;
  size: number;
}

interface SystemBackupManifestV1 {
  app: "genposter";
  kind: "system-backup";
  version: 1;
  exportedAt: number;
  projects: Project[];
  entities: Entity[];
  assets: Asset[];
  assetLibrary: AssetItem[];
  brandKits: BrandKit[];
  designDocuments: DesignDocument[];
  fontAssets: FontAsset[];
  pageTemplates: PageTemplate[];
  packTemplates: PackTemplate[];
  jobs: GenerationJob[];
  overrides: ManualOverride[];
  generatePresets: GenerateBindingPreset[];
  analyses: AnalysisRecord[];
  settings: Array<AppSettings & { id: string }>;
  blobs: BackupBlobMeta[];
}

export interface SystemBackupImportResult {
  kind: "system-backup" | "legacy-json";
  message: string;
  warning?: string;
}

function stripSecretsFromSettings<T extends AppSettings>(settings: T): T {
  const { captionApiKey: _captionApiKey, ai, ...rest } = settings;
  const safeSettings = { ...rest } as T;
  if (ai) {
    const { apiKey: _apiKey, ...safeAi } = ai;
    safeSettings.ai = safeAi as T["ai"];
  }
  return safeSettings;
}

function blobPath(blobKey: string) {
  return `blobs/${encodeURIComponent(blobKey)}`;
}

function assertManifest(data: unknown): asserts data is SystemBackupManifestV1 {
  if (!data || typeof data !== "object") {
    throw new Error("Backup không hợp lệ.");
  }
  const manifest = data as Partial<SystemBackupManifestV1>;
  if (manifest.app !== "genposter" || manifest.kind !== "system-backup" || manifest.version !== 1) {
    throw new Error("File backup không đúng định dạng GenPoster.");
  }
  if (!Array.isArray(manifest.blobs)) {
    throw new Error("Backup thiếu danh sách ảnh.");
  }
}

async function readCurrentManifest(): Promise<{ manifest: SystemBackupManifestV1; blobRecords: BlobRecord[] }> {
  const [
    projects,
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
    generatePresets,
    analyses,
    blobRecords,
    settingsRecords,
  ] = await Promise.all([
    db.projects.toArray(),
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
    db.generatePresets.toArray(),
    db.analyses.toArray(),
    db.blobs.toArray(),
    db.settings.toArray(),
  ]);

  const settings =
    settingsRecords.length > 0
      ? settingsRecords.map((record) => stripSecretsFromSettings(record))
      : [{ id: "app", ...stripSecretsFromSettings(await getSettings()) }];

  const manifest: SystemBackupManifestV1 = {
    app: "genposter",
    kind: "system-backup",
    version: 1,
    exportedAt: Date.now(),
    projects,
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
    generatePresets,
    analyses,
    settings,
    blobs: blobRecords.map((record) => ({
      blobKey: record.blobKey,
      mime: record.mime,
      createdAt: record.createdAt,
      path: blobPath(record.blobKey),
      size: record.blob.size,
    })),
  };

  return { manifest, blobRecords };
}

export function getSystemBackupFileName(now = Date.now()) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  return `genposter-backup-${stamp}.zip`;
}

export async function createSystemBackupZip(): Promise<Blob> {
  const { manifest, blobRecords } = await readCurrentManifest();
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const record of blobRecords) {
    zip.file(blobPath(record.blobKey), record.blob);
  }
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/zip",
  });
}

async function readBackupZip(file: File): Promise<{
  manifest: SystemBackupManifestV1;
  blobRecords: BlobRecord[];
}> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Backup thiếu manifest.json.");
  }
  const manifest = JSON.parse(await manifestFile.async("text")) as unknown;
  assertManifest(manifest);

  const blobRecords: BlobRecord[] = [];
  for (const meta of manifest.blobs) {
    const zipBlob = zip.file(meta.path);
    if (!zipBlob) {
      throw new Error(`Backup thiếu ảnh: ${meta.blobKey}`);
    }
    const blob = await zipBlob.async("blob");
    blobRecords.push({
      blobKey: meta.blobKey,
      blob: new Blob([blob], { type: meta.mime || blob.type }),
      mime: meta.mime || blob.type,
      createdAt: meta.createdAt,
    });
  }

  return { manifest, blobRecords };
}

async function putIfAny<T>(table: { bulkPut(rows: T[]): Promise<unknown> }, rows: T[]) {
  if (rows.length) await table.bulkPut(rows);
}

async function restoreSystemBackup(
  manifest: SystemBackupManifestV1,
  blobRecords: BlobRecord[],
  mode: SystemBackupImportMode,
) {
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
      db.blobs,
      db.generatePresets,
      db.analyses,
      db.settings,
    ],
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.projects.clear(),
          db.entities.clear(),
          db.assets.clear(),
          db.assetLibrary.clear(),
          db.brandKits.clear(),
          db.designDocuments.clear(),
          db.fontAssets.clear(),
          db.pageTemplates.clear(),
          db.packTemplates.clear(),
          db.jobs.clear(),
          db.overrides.clear(),
          db.blobs.clear(),
          db.generatePresets.clear(),
          db.analyses.clear(),
          db.settings.clear(),
        ]);
      }

      await putIfAny(db.projects, manifest.projects);
      await putIfAny(db.entities, manifest.entities);
      await putIfAny(db.assets, manifest.assets);
      await putIfAny(db.assetLibrary, manifest.assetLibrary);
      await putIfAny(db.brandKits, manifest.brandKits);
      await putIfAny(db.designDocuments, manifest.designDocuments);
      await putIfAny(db.fontAssets, manifest.fontAssets);
      await putIfAny(db.pageTemplates, manifest.pageTemplates);
      await putIfAny(db.packTemplates, manifest.packTemplates);
      await putIfAny(db.jobs, manifest.jobs);
      await putIfAny(db.overrides, manifest.overrides);
      await putIfAny(db.blobs, blobRecords);
      await putIfAny(db.generatePresets, manifest.generatePresets);
      await putIfAny(db.analyses, manifest.analyses);
      await putIfAny(db.settings, manifest.settings);
    },
  );
}

async function importLegacyJson(file: File, mode: SystemBackupImportMode): Promise<SystemBackupImportResult> {
  const data = JSON.parse(await file.text()) as ProjectExport;
  if (mode === "replace") {
    await clearAll();
  }
  await importProjectJSON(data);
  return {
    kind: "legacy-json",
    message: "Đã import JSON cũ.",
    warning: "JSON cũ không chứa ảnh local, settings, preset generate hoặc lịch sử phân tích.",
  };
}

export async function importSystemBackupFile(
  file: File,
  mode: SystemBackupImportMode,
): Promise<SystemBackupImportResult> {
  if (/\.json$/i.test(file.name) || file.type === "application/json") {
    return importLegacyJson(file, mode);
  }

  const { manifest, blobRecords } = await readBackupZip(file);
  await restoreSystemBackup(manifest, blobRecords, mode);
  return {
    kind: "system-backup",
    message: `Đã khôi phục backup gồm ${manifest.entities.length} dòng dữ liệu, ${manifest.assets.length} asset và ${blobRecords.length} ảnh.`,
  };
}
