import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import { db, saveBlob } from "@/storage/db";
import { matchFilesToEntities, type MatchResult } from "@/features/data/imageMatcher";
import { makeIdbSrc } from "@/storage/imageSrc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import type { Asset, Entity } from "@/models";

interface PendingFile {
  file: File;
  relativePath?: string;
  match: MatchResult;
  manualEntityId?: string | null; // override
  role: Asset["role"];
}

const PREVIEW_PAGE_SIZE = 80;
const PREVIEW_INCREMENT = 80;

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
  const entities = useLiveQuery(() => db.entities.toArray(), []) ?? [];
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [threshold, setThreshold] = useState(0.78);
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PREVIEW_PAGE_SIZE);
  const [, setPreviewVersion] = useState(0);
  const previewUrlsRef = useRef(new Map<string, string>());

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current.clear();
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
    if (changed) {
      setPreviewVersion((value) => value + 1);
    }
  }, [pending, visiblePending]);

  const finishImportPrep = (next: PendingFile[]) => {
    setPending(next);
    setVisibleCount(Math.min(PREVIEW_PAGE_SIZE, next.length));
    const matched = next.filter((p) => p.manualEntityId).length;
    const needsReview = next.filter((p) => p.match.needsReview).length;
    toast.success(
      `${next.length} ảnh • Khớp tự động: ${matched}/${next.length} • Cần review: ${needsReview}`,
    );
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (entities.length === 0) {
      toast.error("Chưa có quán nào. Hãy import dữ liệu CSV/Sheet trước.");
      return;
    }
    setMatching(true);
    try {
      await yieldToBrowser();
      const arr = Array.from(files)
        .filter(isImageFile)
        .map((file) => ({
          file,
          relativePath:
            "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
              ? file.webkitRelativePath || undefined
              : undefined,
        }));
      const next = await buildPendingFiles(arr, entities, threshold);
      finishImportPrep(next);
    } finally {
      setMatching(false);
    }
  };

  const onPickDirectory = async () => {
    if (entities.length === 0) {
      toast.error("Chưa có quán nào. Hãy import dữ liệu CSV/Sheet trước.");
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
    const matchInputs = pending.map((p) => ({
      fileName: p.file.name,
      relativePath:
        "webkitRelativePath" in p.file && typeof p.file.webkitRelativePath === "string"
          ? p.file.webkitRelativePath || undefined
          : undefined,
    }));
    const matches = matchFilesToEntities(matchInputs, entities, { fuzzyThreshold: threshold });
    setPending(
      pending.map((p, i) => ({
        ...p,
        match: matches[i],
        manualEntityId: matches[i].autoAssign ? matches[i].matchedEntityId : null,
      })),
    );
    const matched = matches.filter((m) => m.autoAssign && m.matchedEntityId).length;
    const needsReview = matches.filter((m) => m.needsReview).length;
    toast.success(`Đã match lại: ${matched}/${matches.length} • Cần review: ${needsReview}`);
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
    setPending(pending.filter((_, i) => i !== idx));
  };

  const importAll = async () => {
    const ready = pending.filter((p) => p.manualEntityId);
    if (ready.length === 0) {
      toast.error("Không có ảnh nào đã được gán quán");
      return;
    }
    setBusy(true);
    try {
      const newAssets: Asset[] = [];
      // Đếm sẵn cover hiện tại của từng entity để không tạo trùng cover
      const coverCount: Record<string, number> = {};
      const existing = await db.assets.toArray();
      for (const a of existing) {
        if (a.isCover) coverCount[a.entityId] = (coverCount[a.entityId] ?? 0) + 1;
      }

      for (const p of ready) {
        const entityId = p.manualEntityId!;
        const blobKey = await saveBlob(p.file);
        const isCover = p.role === "cover" && (coverCount[entityId] ?? 0) === 0;
        if (isCover) coverCount[entityId] = (coverCount[entityId] ?? 0) + 1;
        newAssets.push({
          assetId: nanoid(),
          entityId,
          sourceType: "local",
          sourceValue: makeIdbSrc(blobKey),
          blobKey,
          role: p.role,
          isCover,
          qualityScore: 80,
          status: "ok",
        });
      }
      await db.assets.bulkPut(newAssets);
      toast.success(
        `Đã import ${newAssets.length} ảnh local vào ${new Set(newAssets.map((a) => a.entityId)).size} quán`,
      );
      setPending([]);
    } catch (e) {
      toast.error("Lỗi khi import: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const matchedCount = pending.filter((p) => p.manualEntityId).length;

  // Báo cáo: quán nào còn thiếu ảnh
  const allAssets = useLiveQuery(() => db.assets.toArray(), []) ?? [];
  const entitiesWithoutImage = entities.filter(
    (e) => !allAssets.some((a) => a.entityId === e.entityId),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Upload ảnh local hàng loạt + Auto-match theo tên quán</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              1. Đặt tên file ảnh theo tên quán (có thể bỏ dấu, dùng <code>-1</code>,{" "}
              <code>-2</code> cho ảnh phụ).
            </p>
            <p>
              2. Có thể chọn nhiều ảnh hoặc chọn cả thư mục ảnh quán. App sẽ tự gán ảnh vào đúng
              quán nếu confidence đủ mạnh.
            </p>
            <p>
              3. Các match yếu sẽ để trống và gắn nhãn cần review để bạn kiểm tra trước khi Import.
            </p>
            <p>
              Gợi ý chuẩn hoá lâu dài: <code>Tên-sheet/Tên-quán/ảnh-1.jpg</code>,{" "}
              <code>Tên-sheet/Tên-quán/ảnh-2.jpg</code>. App sẽ ưu tiên match theo tên thư mục quán,
              rồi mới fallback sang tên file.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onFiles(e.target.files)}
              className="text-sm"
            />
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
              onChange={(e) => {
                onFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={onPickDirectory}>
              Chọn thư mục ảnh
            </Button>
            <div className="flex items-center gap-2 text-xs">
              <span>Ngưỡng fuzzy:</span>
              <div className="w-32">
                <Slider
                  value={[threshold * 100]}
                  min={50}
                  max={95}
                  step={1}
                  onValueChange={(v) => setThreshold(v[0] / 100)}
                />
              </div>
              <span className="font-mono">{Math.round(threshold * 100)}%</span>
              <Button
                size="sm"
                variant="outline"
                onClick={rerunMatch}
                disabled={pending.length === 0}
              >
                Match lại
              </Button>
            </div>
          </div>

          {matching && (
            <div className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
              Đang đọc và match thư mục ảnh. Với folder lớn vài trăm ảnh, bước này có thể mất một
              lúc.
            </div>
          )}

          {pending.length > 0 && (
            <div className="border rounded">
              <div className="flex items-center justify-between p-2 bg-muted text-sm">
                <span>
                  {pending.length} file • Đã gán: <strong>{matchedCount}</strong> • Chưa gán:{" "}
                  <strong>{pending.length - matchedCount}</strong>
                </span>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    Hiển thị {Math.min(visibleCount, pending.length)}/{pending.length}
                  </Badge>
                  {visibleCount < pending.length && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setVisibleCount((count) =>
                          Math.min(count + PREVIEW_INCREMENT, pending.length),
                        )
                      }
                    >
                      Xem thêm {Math.min(PREVIEW_INCREMENT, pending.length - visibleCount)}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPending([])}>
                    Xoá hết
                  </Button>
                  <Button size="sm" onClick={importAll} disabled={busy || matchedCount === 0}>
                    Import {matchedCount} ảnh
                  </Button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Preview</th>
                      <th className="text-left p-2">Tên file</th>
                      <th className="text-left p-2">Match</th>
                      <th className="text-left p-2">Quán (chỉnh tay nếu sai)</th>
                      <th className="text-left p-2">Vai trò</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePending.map((p, idx) => (
                      <tr key={pendingKey(p)} className="border-t">
                        <td className="p-2">
                          <img
                            src={previewUrlsRef.current.get(pendingKey(p))}
                            alt=""
                            className="w-12 h-12 object-cover rounded"
                          />
                        </td>
                        <td className="p-2 font-mono max-w-48 truncate">{p.file.name}</td>
                        <td className="p-2">
                          <div className="space-y-1">
                            <Badge
                              variant={
                                p.match.reason === "exact"
                                  ? "default"
                                  : p.match.reason === "no_match"
                                    ? "destructive"
                                    : p.match.needsReview
                                      ? "outline"
                                      : "secondary"
                              }
                            >
                              {p.match.reason === "exact" && "Khớp 100%"}
                              {p.match.reason === "contains" && `Chứa ${p.match.score}%`}
                              {p.match.reason === "fuzzy" && `Gần đúng ${p.match.score}%`}
                              {p.match.reason === "no_match" && "Không khớp"}
                            </Badge>
                            {p.match.needsReview && (
                              <div className="text-[10px] text-amber-600">Cần review</div>
                            )}
                            {p.match.relativePath && (
                              <div className="max-w-40 truncate text-[10px] text-muted-foreground">
                                {p.match.relativePath}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <Select
                            value={p.manualEntityId ?? "__none__"}
                            onValueChange={(v) => setManual(idx, v === "__none__" ? null : v)}
                          >
                            <SelectTrigger className="h-7 w-56 text-xs">
                              <SelectValue placeholder="-- chọn quán --" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Bỏ qua —</SelectItem>
                              {entities.map((e) => (
                                <SelectItem key={e.entityId} value={e.entityId}>
                                  {e.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Select
                            value={p.role}
                            onValueChange={(v) => setRole(idx, v as Asset["role"])}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
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
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => removeRow(idx)}>
                            ✕
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Quán còn thiếu ảnh{" "}
            <Badge variant={entitiesWithoutImage.length === 0 ? "default" : "destructive"}>
              {entitiesWithoutImage.length}/{entities.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entitiesWithoutImage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tất cả quán đã có ít nhất 1 ảnh ✅</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs max-h-64 overflow-y-auto">
              {entitiesWithoutImage.map((e) => (
                <div key={e.entityId} className="flex items-center gap-2 p-1 bg-muted/50 rounded">
                  <span className="font-mono text-muted-foreground">·</span>
                  <span className="truncate">{e.name}</span>
                  {e.partnerFlag && (
                    <Badge variant="outline" className="text-[10px]">
                      P
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
