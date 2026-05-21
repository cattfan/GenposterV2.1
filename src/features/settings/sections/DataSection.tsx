import { toast } from "sonner";
import { AlertTriangle, Image, Database, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/storage/useLiveQuery";
import { db } from "@/storage/db";
import type { Asset, BlobRecord, Entity } from "@/models";

const UNDO_TOAST_DURATION = 15_000;

function uniqueAssetBlobKeys(assets: Asset[]) {
  return Array.from(
    new Set(
      assets
        .map((asset) => asset.blobKey)
        .filter((blobKey): blobKey is string => Boolean(blobKey)),
    ),
  );
}

async function readAssetBlobs(assets: Asset[]): Promise<BlobRecord[]> {
  const blobKeys = uniqueAssetBlobKeys(assets);
  if (blobKeys.length === 0) return [];
  return db.blobs.where("blobKey").anyOf(blobKeys).toArray();
}

async function restoreImportedImages(assets: Asset[], blobs: BlobRecord[]) {
  await db.transaction("rw", [db.assets, db.blobs], async () => {
    if (blobs.length) await db.blobs.bulkPut(blobs);
    if (assets.length) await db.assets.bulkPut(assets);
  });
}

async function restoreImportedData(entities: Entity[], assets: Asset[], blobs: BlobRecord[]) {
  await db.transaction("rw", [db.entities, db.assets, db.blobs], async () => {
    if (entities.length) await db.entities.bulkPut(entities);
    if (blobs.length) await db.blobs.bulkPut(blobs);
    if (assets.length) await db.assets.bulkPut(assets);
  });
}

export function DataSection() {
  const entities = useLiveQuery(() => db.entities.toArray(), [], ["entities"]) ?? [];
  const assets = useLiveQuery(() => db.assets.toArray(), [], ["assets"]) ?? [];
  const packTemplatesCount =
    useLiveQuery(() => db.packTemplates.count(), [], ["packTemplates"]) ?? 0;
  const pageTemplatesCount =
    useLiveQuery(() => db.pageTemplates.count(), [], ["pageTemplates"]) ?? 0;
  const designDocsCount =
    useLiveQuery(() => db.designDocuments.count(), [], ["designDocuments"]) ?? 0;
  const jobsCount = useLiveQuery(() => db.jobs.count(), [], ["jobs"]) ?? 0;
  const generatePresetsCount =
    useLiveQuery(() => db.generatePresets.count(), [], ["generatePresets"]) ?? 0;
  const symbolsCount = useLiveQuery(() => db.symbols.count(), [], ["symbols"]) ?? 0;
  const localImageCount = assets.filter((asset) => asset.blobKey).length;

  const clearImportedImages = async () => {
    const snapshotAssets = await db.assets.toArray();
    const snapshotBlobs = await readAssetBlobs(snapshotAssets);

    await db.transaction("rw", [db.assets, db.blobs], async () => {
      await db.assets.clear();
      const blobKeys = uniqueAssetBlobKeys(snapshotAssets);
      if (blobKeys.length) await db.blobs.bulkDelete(blobKeys);
    });

    toast.success(`Đã xoá ${snapshotAssets.length} ảnh đã import`, {
      duration: UNDO_TOAST_DURATION,
      action:
        snapshotAssets.length || snapshotBlobs.length
          ? {
              label: "Khôi phục",
              onClick: () => {
                void restoreImportedImages(snapshotAssets, snapshotBlobs).then(() => {
                  toast.success("Đã khôi phục ảnh");
                });
              },
            }
          : undefined,
    });
  };

  const clearImportedData = async () => {
    const snapshotEntities = await db.entities.toArray();

    await db.transaction("rw", [db.entities], async () => {
      await db.entities.clear();
    });

    toast.success(`Đã xoá ${snapshotEntities.length} dòng dữ liệu đã import`, {
      duration: UNDO_TOAST_DURATION,
      action: snapshotEntities.length
        ? {
            label: "Khôi phục",
            onClick: () => {
              void db.entities.bulkPut(snapshotEntities).then(() => {
                toast.success("Đã khôi phục dữ liệu");
              });
            },
          }
        : undefined,
    });
  };

  const clearAllLocalData = async () => {
    const snapshotEntities = await db.entities.toArray();
    const snapshotAssets = await db.assets.toArray();
    const snapshotBlobs = await readAssetBlobs(snapshotAssets);

    await db.transaction("rw", [db.entities, db.assets, db.blobs], async () => {
      await db.entities.clear();
      await db.assets.clear();
      const blobKeys = uniqueAssetBlobKeys(snapshotAssets);
      if (blobKeys.length) await db.blobs.bulkDelete(blobKeys);
    });

    toast.success("Đã xoá tất cả dữ liệu local", {
      duration: UNDO_TOAST_DURATION,
      action:
        snapshotEntities.length || snapshotAssets.length || snapshotBlobs.length
          ? {
              label: "Khôi phục",
              onClick: () => {
                void restoreImportedData(snapshotEntities, snapshotAssets, snapshotBlobs).then(
                  () => {
                    toast.success("Đã khôi phục dữ liệu local");
                  },
                );
              },
            }
          : undefined,
    });
  };

  const clearAllTemplates = async () => {
    const [packs, pages, designs, jobs, presets, symbols, overrides] = await Promise.all([
      db.packTemplates.toArray(),
      db.pageTemplates.toArray(),
      db.designDocuments.toArray(),
      db.jobs.toArray(),
      db.generatePresets.toArray(),
      db.symbols.toArray(),
      db.overrides.toArray(),
    ]);
    const summary = `${packs.length} bộ · ${pages.length} trang · ${designs.length} design · ${jobs.length} lần tạo · ${presets.length} preset · ${symbols.length} symbol`;

    await db.transaction(
      "rw",
      [
        db.packTemplates,
        db.pageTemplates,
        db.designDocuments,
        db.jobs,
        db.generatePresets,
        db.symbols,
        db.overrides,
      ],
      async () => {
        await db.packTemplates.clear();
        await db.pageTemplates.clear();
        await db.designDocuments.clear();
        await db.jobs.clear();
        await db.generatePresets.clear();
        await db.symbols.clear();
        await db.overrides.clear();
      },
    );

    toast.success(`Đã xoá tất cả khuôn mẫu (${summary})`, {
      duration: UNDO_TOAST_DURATION,
      action: {
        label: "Khôi phục",
        onClick: () => {
          void db
            .transaction(
              "rw",
              [
                db.packTemplates,
                db.pageTemplates,
                db.designDocuments,
                db.jobs,
                db.generatePresets,
                db.symbols,
                db.overrides,
              ],
              async () => {
                if (packs.length) await db.packTemplates.bulkPut(packs);
                if (pages.length) await db.pageTemplates.bulkPut(pages);
                if (designs.length) await db.designDocuments.bulkPut(designs);
                if (jobs.length) await db.jobs.bulkPut(jobs);
                if (presets.length) await db.generatePresets.bulkPut(presets);
                if (symbols.length) await db.symbols.bulkPut(symbols);
                if (overrides.length) await db.overrides.bulkPut(overrides);
              },
            )
            .then(() => toast.success("Đã khôi phục khuôn mẫu"));
        },
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-semibold">Vùng nguy hiểm</div>
          <div className="text-xs">
            Các thao tác bên dưới xoá dữ liệu khỏi backend. Mỗi nút có cảnh báo và 15 giây undo
            qua toast — sau đó không khôi phục được.
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dữ liệu local</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Trash2 />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Tất cả (data)</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {entities.length} dòng, {assets.length} ảnh.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              className="mt-4 w-full"
              onClick={() => void clearAllLocalData()}
              disabled={entities.length === 0 && assets.length === 0}
            >
              Xoá tất cả
            </Button>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Image />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Ảnh</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {assets.length} asset, {localImageCount} ảnh local.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              className="mt-4 w-full"
              onClick={() => void clearImportedImages()}
              disabled={assets.length === 0}
            >
              Xoá ảnh
            </Button>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Database />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Dữ liệu sheet</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {entities.length} dòng dữ liệu.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              className="mt-4 w-full"
              onClick={() => void clearImportedData()}
              disabled={entities.length === 0 && assets.length === 0}
            >
              Xoá dữ liệu sheet
            </Button>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Trash2 />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Khuôn mẫu</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {packTemplatesCount} bộ, {pageTemplatesCount} trang, {designDocsCount} design,{" "}
                  {jobsCount} lần tạo, {generatePresetsCount} preset, {symbolsCount} symbol.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              className="mt-4 w-full"
              onClick={() => void clearAllTemplates()}
              disabled={
                packTemplatesCount === 0 &&
                pageTemplatesCount === 0 &&
                designDocsCount === 0 &&
                jobsCount === 0 &&
                generatePresetsCount === 0 &&
                symbolsCount === 0
              }
            >
              Xoá khuôn mẫu
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
