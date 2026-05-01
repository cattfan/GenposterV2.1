import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  ImagePlus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { entityHasImageSource, getAssetEntityIds } from "@/features/data/imageReferences";
import { matchFilesToEntities, type MatchResult } from "@/features/data/imageMatcher";
import type { Asset, Entity } from "@/models";
import { db, saveBlob } from "@/storage/db";
import { makeIdbSrc } from "@/storage/imageSrc";

interface PendingFile {
  file: File;
  relativePath?: string;
  match: MatchResult;
  manualEntityId?: string | null;
  role: Asset["role"];
}

const PREVIEW_PAGE_SIZE = 80;
const PREVIEW_INCREMENT = 80;
const EMPTY_ENTITIES: Entity[] = [];
const EMPTY_ASSETS: Asset[] = [];

function pendingKey(item: PendingFile): string {
  const path = item.relativePath || item.file.name;
  return `${path}::${item.file.size}::${item.file.lastModified}`;
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
}

async function yieldToBrowser(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function collectDirectoryFiles(
  directoryHandle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<Array<{ file: File; relativePath: string }>> {
  const out: Array<{ file: File; relativePath: string }> = [];
  const entries = directoryHandle as FileSystemDirectoryHandle & {
    values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  };

  for await (const entry of entries.values()) {
    if (entry.kind === "file") {
      const file = await entry.getFile();
      if (!isImageFile(file)) continue;
      out.push({
        file,
        relativePath: prefix ? `${prefix}/${entry.name}` : entry.name,
      });
      continue;
    }

    const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    out.push(...(await collectDirectoryFiles(entry, childPrefix)));
  }

  return out;
}

async function buildPendingFiles(
  items: Array<{ file: File; relativePath?: string }>,
  entities: Entity[],
  threshold: number,
): Promise<PendingFile[]> {
  const results: PendingFile[] = [];
  const chunkSize = 80;

  for (let start = 0; start < items.length; start += chunkSize) {
    const chunk = items.slice(start, start + chunkSize);
    const matches = matchFilesToEntities(
      chunk.map((item) => ({
        fileName: item.file.name,
        relativePath:
          item.relativePath ??
          ("webkitRelativePath" in item.file && typeof item.file.webkitRelativePath === "string"
            ? item.file.webkitRelativePath || undefined
            : undefined),
      })),
      entities,
      { fuzzyThreshold: threshold },
    );

    results.push(
      ...chunk.map((item, index) => ({
        file: item.file,
        relativePath: item.relativePath,
        match: matches[index],
        manualEntityId: matches[index].autoAssign ? matches[index].matchedEntityId : null,
        role: "cover" as const,
      })),
    );

    await yieldToBrowser();
  }

  return results;
}

export function BulkImageUpload() {
  const entities = useLiveQuery(() => db.entities.toArray(), []) ?? EMPTY_ENTITIES;
  const allAssets = useLiveQuery(() => db.assets.toArray(), []) ?? EMPTY_ASSETS;
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [threshold, setThreshold] = useState(0.78);
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PREVIEW_PAGE_SIZE);
  const [, setPreviewVersion] = useState(0);
  const previewUrlsRef = useRef(new Map<string, string>());

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
      for (const url of previewUrls.values()) {
        URL.revokeObjectURL(url);
      }
      previewUrls.clear();
    };
  }, []);

  const visiblePending = useMemo(() => pending.slice(0, visibleCount), [pending, visibleCount]);

  useEffect(() => {
    const validKeys = new Set(pending.map(pendingKey));
    for (const [key, url] of previewUrlsRef.current.entries()) {
      if (!validKeys.has(key)) {
        URL.revokeObjectURL(url);
        previewUrlsRef.current.delete(key);
      }
    }

    let changed = false;
    for (const item of visiblePending) {
      const key = pendingKey(item);
      if (!previewUrlsRef.current.has(key)) {
        previewUrlsRef.current.set(key, URL.createObjectURL(item.file));
        changed = true;
      }
    }
    if (changed) setPreviewVersion((value) => value + 1);
  }, [pending, visiblePending]);

  const finishImportPrep = (next: PendingFile[]) => {
    setPending(next);
    setVisibleCount(Math.min(PREVIEW_PAGE_SIZE, next.length));
    const matched = next.filter((item) => item.manualEntityId).length;
    const needsReview = next.filter((item) => item.match.needsReview).length;
    toast.success(
      `${next.length} ảnh, khớp tự động ${matched}/${next.length}, cần review ${needsReview}`,
    );
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (entities.length === 0) {
      toast.error("Chưa có quán nào. Hãy import dữ liệu trước.");
      return;
    }

    setMatching(true);
    try {
      await yieldToBrowser();
      const items = Array.from(files)
        .filter(isImageFile)
        .map((file) => ({
          file,
          relativePath:
            "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
              ? file.webkitRelativePath || undefined
              : undefined,
        }));
      const next = await buildPendingFiles(items, entities, threshold);
      finishImportPrep(next);
    } finally {
      setMatching(false);
    }
  };

  const onPickDirectory = async () => {
    if (entities.length === 0) {
      toast.error("Chưa có quán nào. Hãy import dữ liệu trước.");
      return;
    }

    if (!("showDirectoryPicker" in window)) {
      folderInputRef.current?.click();
      return;
    }

    setMatching(true);
    try {
      const picker = window as Window & {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      };
      const handle = await picker.showDirectoryPicker();
      const files = await collectDirectoryFiles(handle, handle.name);
      const next = await buildPendingFiles(files, entities, threshold);
      finishImportPrep(next);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(
        "Không đọc được thư mục ảnh: " + (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setMatching(false);
    }
  };

  const rerunMatch = () => {
    if (pending.length === 0) return;
    const matchInputs = pending.map((item) => ({
      fileName: item.file.name,
      relativePath:
        "webkitRelativePath" in item.file && typeof item.file.webkitRelativePath === "string"
          ? item.file.webkitRelativePath || undefined
          : undefined,
    }));
    const matches = matchFilesToEntities(matchInputs, entities, { fuzzyThreshold: threshold });
    setPending(
      pending.map((item, index) => ({
        ...item,
        match: matches[index],
        manualEntityId: matches[index].autoAssign ? matches[index].matchedEntityId : null,
      })),
    );
    const matched = matches.filter((match) => match.autoAssign && match.matchedEntityId).length;
    const needsReview = matches.filter((match) => match.needsReview).length;
    toast.success(`Đã match lại: ${matched}/${matches.length}, cần review ${needsReview}`);
  };

  const setManual = (idx: number, entityId: string | null) => {
    const next = [...pending];
    next[idx] = { ...next[idx], manualEntityId: entityId };
    setPending(next);
  };

  const setRole = (idx: number, role: Asset["role"]) => {
    const next = [...pending];
    next[idx] = { ...next[idx], role };
    setPending(next);
  };

  const removeRow = (idx: number) => {
    setPending(pending.filter((_, index) => index !== idx));
  };

  const importAll = async () => {
    const ready = pending.filter((item) => item.manualEntityId);
    if (ready.length === 0) {
      toast.error("Không có ảnh nào đã được gán quán");
      return;
    }

    setBusy(true);
    try {
      const newAssets: Asset[] = [];
      const coverCount: Record<string, number> = {};
      const existing = await db.assets.toArray();
      for (const asset of existing) {
        if (asset.isCover) coverCount[asset.entityId] = (coverCount[asset.entityId] ?? 0) + 1;
      }

      for (const item of ready) {
        const entityId = item.manualEntityId!;
        const blobKey = await saveBlob(item.file);
        const isCover = item.role === "cover" && (coverCount[entityId] ?? 0) === 0;
        if (isCover) coverCount[entityId] = (coverCount[entityId] ?? 0) + 1;
        newAssets.push({
          assetId: nanoid(),
          entityId,
          sourceType: "local",
          sourceValue: makeIdbSrc(blobKey),
          blobKey,
          role: item.role,
          isCover,
          qualityScore: 80,
          status: "ok",
        });
      }

      await db.assets.bulkPut(newAssets);
      toast.success(
        `Đã import ${newAssets.length} ảnh vào ${new Set(newAssets.map((asset) => asset.entityId)).size} quán`,
      );
      setPending([]);
    } catch (error) {
      toast.error("Lỗi khi import: " + (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const matchedCount = pending.filter((item) => item.manualEntityId).length;
  const assetEntityIds = useMemo(() => getAssetEntityIds(allAssets), [allAssets]);
  const entitiesWithoutImage = useMemo(
    () => entities.filter((entity) => !entityHasImageSource(entity, assetEntityIds)),
    [assetEntityIds, entities],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Ghép ảnh vào quán</CardTitle>
            <CardDescription>
              Match theo tên thư mục hoặc tên file, sau đó review nhanh trước khi import.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <input
              ref={(node) => {
                folderInputRef.current = node;
              }}
              type="file"
              accept="image/*"
              multiple
              hidden
              {...({
                webkitdirectory: "true",
                directory: "true",
              } as unknown as InputHTMLAttributes<HTMLInputElement>)}
              onChange={(event) => {
                void onFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative inline-flex">
                <Button type="button" disabled={matching}>
                  <ImagePlus /> Chọn ảnh
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={matching}
                  aria-label="Chọn ảnh"
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:pointer-events-none"
                  onChange={(event) => {
                    void onFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <Button type="button" variant="outline" onClick={onPickDirectory} disabled={matching}>
                <FolderOpen /> Chọn thư mục
              </Button>
              <Button
                variant="outline"
                onClick={rerunMatch}
                disabled={pending.length === 0 || matching}
              >
                <RefreshCw /> Match lại
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Độ khớp tên</div>
                  <div className="text-xs text-muted-foreground">
                    Cao hơn thì ít match sai hơn, nhưng cần review nhiều hơn.
                  </div>
                </div>
                <Badge variant="secondary">{Math.round(threshold * 100)}%</Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Thoáng</span>
                <div className="min-w-32 flex-1">
                  <Slider
                    value={[threshold * 100]}
                    min={50}
                    max={95}
                    step={1}
                    onValueChange={(value) => setThreshold(value[0] / 100)}
                  />
                </div>
                <span className="text-xs text-muted-foreground">Chặt</span>
              </div>
            </div>

            {matching && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Đang đọc và match ảnh. Folder lớn có thể mất một lúc.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Tình trạng ảnh</CardTitle>
            <CardDescription>{entities.length} quán trong dữ liệu hiện tại</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-semibold">{allAssets.length}</div>
              <div className="text-sm text-muted-foreground">Ảnh đã import</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-semibold">{entitiesWithoutImage.length}</div>
                {entitiesWithoutImage.length === 0 ? (
                  <CheckCircle2 className="text-primary" />
                ) : (
                  <AlertTriangle className="text-destructive" />
                )}
              </div>
              <div className="text-sm text-muted-foreground">Thiếu nguồn ảnh</div>
            </div>
            {pending.length > 0 ? (
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-semibold">
                  {matchedCount}/{pending.length}
                </div>
                <div className="text-sm text-muted-foreground">Ảnh đã gán quán</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Review trước khi import</CardTitle>
              <CardDescription>
                {pending.length} file, {matchedCount} đã gán, {pending.length - matchedCount} chưa
                gán.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Hiển thị {Math.min(visibleCount, pending.length)}/{pending.length}
              </Badge>
              {visibleCount < pending.length && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setVisibleCount((count) => Math.min(count + PREVIEW_INCREMENT, pending.length))
                  }
                >
                  Xem thêm {Math.min(PREVIEW_INCREMENT, pending.length - visibleCount)}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setPending([])}>
                Bỏ danh sách
              </Button>
              <Button size="sm" onClick={importAll} disabled={busy || matchedCount === 0}>
                <Upload /> Import {matchedCount} ảnh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr>
                    <th className="p-3 text-left font-medium text-muted-foreground">Ảnh</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">File</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Match</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Quán</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Vai trò</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePending.map((item, idx) => (
                    <tr key={pendingKey(item)} className="border-t">
                      <td className="p-3">
                        <img
                          src={previewUrlsRef.current.get(pendingKey(item))}
                          alt=""
                          className="size-12 rounded-md object-cover"
                        />
                      </td>
                      <td className="max-w-64 p-3">
                        <div className="truncate font-medium">{item.file.name}</div>
                        {item.match.relativePath ? (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {item.match.relativePath}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={
                              item.match.reason === "exact"
                                ? "default"
                                : item.match.reason === "no_match"
                                  ? "destructive"
                                  : item.match.needsReview
                                    ? "outline"
                                    : "secondary"
                            }
                            className="w-fit"
                          >
                            {item.match.reason === "exact" && "Khớp 100%"}
                            {item.match.reason === "contains" && `Chứa ${item.match.score}%`}
                            {item.match.reason === "fuzzy" && `Gần đúng ${item.match.score}%`}
                            {item.match.reason === "no_match" && "Không khớp"}
                          </Badge>
                          {item.match.needsReview ? (
                            <span className="text-[11px] text-muted-foreground">Cần review</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3">
                        <Select
                          value={item.manualEntityId ?? "__none__"}
                          onValueChange={(value) =>
                            setManual(idx, value === "__none__" ? null : value)
                          }
                        >
                          <SelectTrigger className="h-8 w-60 text-xs">
                            <SelectValue placeholder="Chọn quán" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Bỏ qua</SelectItem>
                            {entities.map((entity) => (
                              <SelectItem key={entity.entityId} value={entity.entityId}>
                                {entity.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <Select
                          value={item.role}
                          onValueChange={(value) => setRole(idx, value as Asset["role"])}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cover">cover</SelectItem>
                            <SelectItem value="facade">facade</SelectItem>
                            <SelectItem value="food_closeup">food_closeup</SelectItem>
                            <SelectItem value="space">space</SelectItem>
                            <SelectItem value="portrait">portrait</SelectItem>
                            <SelectItem value="square_thumb">square_thumb</SelectItem>
                            <SelectItem value="section_image">section_image</SelectItem>
                            <SelectItem value="generic">generic</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeRow(idx)}
                          aria-label="Bỏ ảnh khỏi danh sách import"
                        >
                          <X />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Quán thiếu nguồn ảnh</CardTitle>
            <Badge variant={entitiesWithoutImage.length === 0 ? "default" : "destructive"}>
              {entitiesWithoutImage.length}/{entities.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {entitiesWithoutImage.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tất cả quán đã có asset hoặc link/folder ảnh.
            </p>
          ) : (
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto text-sm md:grid-cols-2 xl:grid-cols-3">
              {entitiesWithoutImage.map((entity) => (
                <div
                  key={entity.entityId}
                  className="flex min-w-0 items-center gap-2 rounded-md border p-2"
                >
                  <span className="size-2 shrink-0 rounded-full bg-destructive" />
                  <span className="truncate">{entity.name}</span>
                  {entity.partnerFlag && (
                    <Badge variant="outline" className="ml-auto">
                      Đối tác
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
