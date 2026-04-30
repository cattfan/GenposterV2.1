import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getSettings, saveSettings } from "@/storage/settings";
import { db } from "@/storage/db";
import type {
  AiProviderConfig,
  AiProviderPreset,
  AppSettings,
  Asset,
  BlobRecord,
  Entity,
} from "@/models";
import { toast } from "sonner";
import { AI_PRESETS, defaultAiConfig, testAiConfig } from "@/features/ai/aiClient";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Settings as SettingsIcon,
  Image,
  Database,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const UNDO_TOAST_DURATION = 15_000;

function uniqueAssetBlobKeys(assets: Asset[]) {
  return Array.from(
    new Set(
      assets.map((asset) => asset.blobKey).filter((blobKey): blobKey is string => Boolean(blobKey)),
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

function SettingsPage() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const entities = useLiveQuery(() => db.entities.toArray(), []) ?? [];
  const assets = useLiveQuery(() => db.assets.toArray(), []) ?? [];
  const localImageCount = assets.filter((asset) => asset.blobKey).length;

  useEffect(() => {
    getSettings().then((loaded) => {
      // Đảm bảo có ai config mặc định
      if (!loaded.ai) loaded.ai = defaultAiConfig("deepseek");
      setS(loaded);
    });
  }, []);

  if (!s) return <div className="p-8">Đang tải...</div>;

  const ai = s.ai ?? defaultAiConfig("deepseek");
  const presetSpec = AI_PRESETS[ai.preset];

  const setAi = (next: AiProviderConfig) => setS({ ...s, ai: next });

  const onPresetChange = (preset: AiProviderPreset) => {
    if (preset === ai.preset) return;
    const fresh = defaultAiConfig(preset);
    // Giữ lại apiKey cũ nếu có (user thường dùng chung 1 key)
    if (ai.apiKey) fresh.apiKey = ai.apiKey;
    setAi(fresh);
    setTestResult(null);
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testAiConfig(ai);
      if (r.ok) {
        setTestResult({
          ok: true,
          msg: `Provider OK. Trả về: "${(r.content ?? "").slice(0, 40)}"`,
        });
      } else {
        setTestResult({ ok: false, msg: r.error });
      }
    } finally {
      setTesting(false);
    }
  };

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
    const snapshotAssets = await db.assets.toArray();
    const snapshotBlobs = await readAssetBlobs(snapshotAssets);

    await db.transaction("rw", [db.entities, db.assets, db.blobs], async () => {
      await db.entities.clear();
      await db.assets.clear();
      const blobKeys = uniqueAssetBlobKeys(snapshotAssets);
      if (blobKeys.length) await db.blobs.bulkDelete(blobKeys);
    });

    toast.success(`Đã xoá ${snapshotEntities.length} dòng dữ liệu đã import`, {
      duration: UNDO_TOAST_DURATION,
      action:
        snapshotEntities.length || snapshotAssets.length || snapshotBlobs.length
          ? {
              label: "Khôi phục",
              onClick: () => {
                void restoreImportedData(snapshotEntities, snapshotAssets, snapshotBlobs).then(
                  () => {
                    toast.success("Đã khôi phục dữ liệu");
                  },
                );
              },
            }
          : undefined,
    });
  };

  return (
    <PageContainer className="max-w-3xl space-y-6">
      <PageHeader
        icon={<SettingsIcon className="size-5" />}
        title="Cài đặt"
        description="Cấu hình AI provider và quản lý dữ liệu local."
      />

      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tất cả tính năng AI (dựng template từ ảnh, gợi ý bind, caption, combo) sẽ gọi qua
            endpoint OpenAI-compatible này. Request gửi <strong>trực tiếp từ browser</strong> nên hỗ
            trợ cả URL local (vd <code>http://localhost:20128/v1</code>).
          </p>

          <div>
            <Label>Preset</Label>
            <Select value={ai.preset} onValueChange={(v) => onPresetChange(v as AiProviderPreset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AI_PRESETS) as AiProviderPreset[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {AI_PRESETS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{presetSpec.hint}</p>
          </div>

          <div>
            <Label>Base URL</Label>
            <Input
              value={ai.baseUrl}
              onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
              placeholder="https://api.deepseek.com/v1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Model</Label>
              <Input
                value={ai.model}
                onChange={(e) => setAi({ ...ai, model: e.target.value })}
                placeholder="deepseek-chat"
              />
            </div>
            <div>
              <Label>Vision model (tùy chọn)</Label>
              <Input
                value={ai.visionModel ?? ""}
                onChange={(e) => setAi({ ...ai, visionModel: e.target.value || undefined })}
                placeholder="bỏ trống → dùng cùng Model"
              />
            </div>
          </div>

          <div>
            <Label>API key {presetSpec.needsApiKey ? "" : "(tùy chọn)"}</Label>
            <Input
              type="password"
              value={ai.apiKey ?? ""}
              onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
              placeholder={presetSpec.needsApiKey ? "sk-..." : "(không cần với local LLM)"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lưu local trong IndexedDB của trình duyệt, không gửi lên server.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onTest} disabled={testing}>
              {testing ? <Loader2 className="size-4 mr-2 animate-spin" /> : "Test kết nối"}
            </Button>
            {testResult && (
              <span
                className={`flex items-center gap-1 text-sm ${
                  testResult.ok ? "text-green-600" : "text-destructive"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <XCircle className="size-4" />
                )}
                <span className="truncate">{testResult.msg}</span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Khổ ảnh mặc định</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <div>
            <Label>Width</Label>
            <Input
              type="number"
              value={s.defaultCanvas.width}
              onChange={(e) =>
                setS({
                  ...s,
                  defaultCanvas: { ...s.defaultCanvas, width: Number(e.target.value) || 1080 },
                })
              }
            />
          </div>
          <div>
            <Label>Height</Label>
            <Input
              type="number"
              value={s.defaultCanvas.height}
              onChange={(e) =>
                setS({
                  ...s,
                  defaultCanvas: { ...s.defaultCanvas, height: Number(e.target.value) || 1350 },
                })
              }
            />
          </div>
          <div>
            <Label>Export scale</Label>
            <Input
              type="number"
              min={1}
              max={4}
              value={s.exportScale}
              onChange={(e) => setS({ ...s, exportScale: Number(e.target.value) || 2 })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dữ liệu local</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Image />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Ảnh đã import</div>
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
                <div className="font-medium">Dữ liệu đã import</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {entities.length} quán/entity. Xoá kèm ảnh đang gắn với dữ liệu này.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              className="mt-4 w-full"
              onClick={() => void clearImportedData()}
              disabled={entities.length === 0 && assets.length === 0}
            >
              Xoá dữ liệu import
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={async () => {
          await saveSettings(s);
          toast.success("Đã lưu cài đặt");
        }}
      >
        Lưu cài đặt
      </Button>
    </PageContainer>
  );
}
