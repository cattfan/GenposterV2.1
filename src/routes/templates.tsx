import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Sparkles, Loader2, Layers, Package, X } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import type { PackTemplate, PageTemplate } from "@/models";
import {
  aiGenerateTemplateFromImage,
  aiGenerateComboFromImages,
  type LayoutFidelity,
} from "@/features/ai/aiFeatures";
import { aiLayoutToTemplateWithQuality } from "@/features/ai/templateFromImage";
import { buildComboFromAiResult, persistCombo } from "@/features/ai/comboFromImages";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { PackBuilder } from "@/features/packs/PackBuilder";
import {
  appendPageToPack,
  createBlankPageTemplate,
  createPackTemplate,
  duplicatePageTemplate,
  ensureOrphanTemplatesInDefaultPack,
} from "@/features/packs/packTemplateUtils";

export const Route = createFileRoute("/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeSearch = location.search as { open?: unknown };
  const openPackId = typeof routeSearch.open === "string" ? routeSearch.open : undefined;
  const packs = useLiveQuery(() => db.packTemplates.orderBy("updatedAt").reverse().toArray(), []);
  const tpls = useLiveQuery(() => db.pageTemplates.orderBy("updatedAt").reverse().toArray(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const comboFileRef = useRef<HTMLInputElement>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleFileName, setSingleFileName] = useState("");
  const [singlePreview, setSinglePreview] = useState("");
  const [singleTemplateName, setSingleTemplateName] = useState("");
  const [singleFidelity, setSingleFidelity] = useState<LayoutFidelity>("strict");
  const [singleInstructions, setSingleInstructions] = useState("");
  const [singlePreferVisibleLines, setSinglePreferVisibleLines] = useState(true);

  // Combo state
  const [comboOpen, setComboOpen] = useState(false);
  const [comboFiles, setComboFiles] = useState<File[]>([]);
  const [comboPreviews, setComboPreviews] = useState<string[]>([]);
  const [comboPackName, setComboPackName] = useState("");
  const [comboFidelity, setComboFidelity] = useState<LayoutFidelity>("strict");
  const [comboInstructions, setComboInstructions] = useState("");
  const [comboPreferVisibleLines, setComboPreferVisibleLines] = useState(true);
  const [comboBusy, setComboBusy] = useState(false);
  const [comboStep, setComboStep] = useState("");
  const [comboProgress, setComboProgress] = useState(0);
  const [editing, setEditing] = useState<PackTemplate | null>(null);

  useEffect(() => {
    void ensureOrphanTemplatesInDefaultPack()
      .then((result) => {
        if (result.added > 0) {
          toast.info(`Đã gom ${result.added} template lẻ vào pack mặc định`);
        }
      })
      .catch((error) => {
        toast.error(
          "Không thể migrate template lẻ: " +
            (error instanceof Error ? error.message : String(error)),
        );
      });
  }, []);

  useEffect(() => {
    if (!packs) return;
    if (packs.length === 0) {
      setEditing(null);
      return;
    }
    const bySearch = openPackId
      ? packs.find((pack) => pack.packTemplateId === openPackId)
      : undefined;
    const current = editing
      ? packs.find((pack) => pack.packTemplateId === editing.packTemplateId)
      : undefined;
    const next = bySearch ?? current ?? packs[0];
    if (!next) return;
    if (
      !editing ||
      editing.packTemplateId !== next.packTemplateId ||
      editing.updatedAt !== next.updatedAt
    ) {
      setEditing({ ...next });
    }
  }, [packs, openPackId, editing]);

  if (location.pathname !== "/templates") {
    return <Outlet />;
  }

  const createNewPack = async () => {
    const pack = createPackTemplate();
    await db.packTemplates.put(pack);
    setEditing(pack);
    toast.success("Đã tạo pack mới");
    navigate({ to: "/templates", search: { open: pack.packTemplateId } });
  };

  const openEdit = (id: string, packId = editing?.packTemplateId) => {
    navigate({ to: "/templates/$id/edit", params: { id }, search: { packId } });
  };

  const ensureActivePack = async (name?: string) => {
    if (editing) return editing;
    const pack = createPackTemplate({ name });
    await db.packTemplates.put(pack);
    setEditing(pack);
    navigate({ to: "/templates", search: { open: pack.packTemplateId } });
    return pack;
  };

  const savePack = async () => {
    if (!editing) return;
    const nextPack = { ...editing, updatedAt: Date.now() };
    await db.packTemplates.put(nextPack);
    setEditing(nextPack);
    toast.success("Đã lưu pack");
  };

  const duplicatePack = async () => {
    if (!editing) return;
    const dup: PackTemplate = {
      ...editing,
      packTemplateId: nanoid(),
      name: editing.name + " (copy)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.packTemplates.put(dup);
    setEditing(dup);
    toast.success("Đã duplicate pack");
    navigate({ to: "/templates", search: { open: dup.packTemplateId } });
  };

  const createPageInPack = async () => {
    const pack = await ensureActivePack();
    const page = createBlankPageTemplate();
    const nextPack = appendPageToPack(pack, page.pageTemplateId);
    await db.transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
      await db.pageTemplates.put(page);
      await db.packTemplates.put(nextPack);
    });
    setEditing(nextPack);
    toast.success("Đã tạo page trong pack");
    openEdit(page.pageTemplateId, nextPack.packTemplateId);
  };

  const duplicatePageInPack = async (template: PageTemplate) => {
    if (!editing) return;
    const dup = duplicatePageTemplate(template);
    const nextPack = appendPageToPack(editing, dup.pageTemplateId);
    await db.transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
      await db.pageTemplates.put(dup);
      await db.packTemplates.put(nextPack);
    });
    setEditing(nextPack);
    toast.success("Đã duplicate page vào pack");
  };

  const deletePageFromPack = async (template: PageTemplate) => {
    if (!confirm(`Xóa page "${template.name}" khỏi toàn bộ project?`)) return;
    const allPacks = await db.packTemplates.toArray();
    await db.transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
      await db.pageTemplates.delete(template.pageTemplateId);
      for (const pack of allPacks) {
        if (!pack.orderedPages.includes(template.pageTemplateId)) continue;
        await db.packTemplates.put({
          ...pack,
          orderedPages: pack.orderedPages.filter((id) => id !== template.pageTemplateId),
          requiredPages: pack.requiredPages.filter((id) => id !== template.pageTemplateId),
          optionalPages: pack.optionalPages.filter((id) => id !== template.pageTemplateId),
          updatedAt: Date.now(),
        });
      }
    });
    if (editing) {
      setEditing({
        ...editing,
        orderedPages: editing.orderedPages.filter((id) => id !== template.pageTemplateId),
        requiredPages: editing.requiredPages.filter((id) => id !== template.pageTemplateId),
        optionalPages: editing.optionalPages.filter((id) => id !== template.pageTemplateId),
        updatedAt: Date.now(),
      });
    }
    toast.success("Đã xóa page");
  };

  // === AI gen template từ ảnh ===
  const onPickAiImage = () => fileRef.current?.click();

  const onAiImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 6_000_000) return toast.error("Ảnh > 6MB. Resize trước nhé.");
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("Đọc ảnh lỗi"));
        r.readAsDataURL(f);
      });
      setSingleFileName(f.name);
      setSinglePreview(dataUrl);
      setSingleTemplateName("AI: " + f.name.replace(/\.[^.]+$/, ""));
      setSingleFidelity("strict");
      setSingleInstructions("");
      setSinglePreferVisibleLines(true);
      setSingleOpen(true);
    } catch (err) {
      toast.error("AI lỗi: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const startSingleImageGeneration = async () => {
    if (!singlePreview) return;
    setAiBusy(true);
    try {
      const out = await aiGenerateTemplateFromImage({
        imageDataUrl: singlePreview,
        fidelity: singleFidelity,
        customInstructions: singleInstructions,
        preferVisibleLines: singlePreferVisibleLines,
      });
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      const layout = JSON.parse(out.layoutJson);
      const { template: tpl, quality } = aiLayoutToTemplateWithQuality(
        layout,
        singleTemplateName.trim() || "AI: " + singleFileName.replace(/\.[^.]+$/, ""),
      );
      if (quality.warnings.length > 0) {
        toast.warning(`${quality.warnings.length} cảnh báo blueprint — kiểm tra validationRules.`);
      }
      const pack = await ensureActivePack(singleTemplateName.trim() || "Pack mới");
      const nextPack = appendPageToPack(pack, tpl.pageTemplateId);
      await db.transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
        await db.pageTemplates.put(tpl);
        await db.packTemplates.put(nextPack);
      });
      setEditing(nextPack);
      toast.success("AI dựng xong — đã thêm page vào pack");
      setSingleOpen(false);
      setSinglePreview("");
      setSingleFileName("");
      setSingleTemplateName("");
      setSingleInstructions("");
      setSinglePreferVisibleLines(true);
      openEdit(tpl.pageTemplateId, nextPack.packTemplateId);
    } catch (err) {
      toast.error("AI lỗi: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAiBusy(false);
    }
  };

  // === AI dựng combo từ nhiều ảnh ===
  const onPickComboImages = () => comboFileRef.current?.click();

  const onComboFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length === 0) return;
    // Validate
    const oversize = list.find((f) => f.size > 6_000_000);
    if (oversize) {
      toast.error(`Ảnh "${oversize.name}" > 6MB. Resize trước nhé.`);
      return;
    }
    const totalSize = list.reduce((a, f) => a + f.size, 0);
    if (totalSize > 25_000_000) {
      toast.error("Tổng dung lượng > 25MB. Bớt ảnh hoặc nén.");
      return;
    }
    const previews = await Promise.all(
      list.map(
        (f) =>
          new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = () => rej(new Error("Đọc " + f.name + " lỗi"));
            r.readAsDataURL(f);
          }),
      ),
    );
    setComboFiles(list);
    setComboPreviews(previews);
    setComboPackName("");
    setComboFidelity("strict");
    setComboInstructions("");
    setComboPreferVisibleLines(true);
    setComboOpen(true);
  };

  const removeComboImage = (idx: number) => {
    setComboFiles((arr) => arr.filter((_, i) => i !== idx));
    setComboPreviews((arr) => arr.filter((_, i) => i !== idx));
  };

  const startCombo = async () => {
    if (comboPreviews.length === 0) return;
    setComboBusy(true);
    setComboStep(`Phân loại ${comboPreviews.length} ảnh...`);
    setComboProgress(10);
    try {
      const out = await aiGenerateComboFromImages({
        images: comboPreviews.map((dataUrl) => ({ dataUrl })),
        packNameHint: comboPackName.trim() || undefined,
        layoutFidelity: comboFidelity,
        customInstructions: comboInstructions.trim() || undefined,
        preferVisibleLines: comboPreferVisibleLines,
        onProgress: (step, progress) => {
          setComboStep(step);
          setComboProgress(progress);
        },
      });
      if (!out.ok) {
        toast.error(out.error);
        return;
      }
      setComboStep(`Dựng ${out.pages.length} page → tạo pack...`);
      setComboProgress(80);
      const built = buildComboFromAiResult(
        { pages: out.pages, packMeta: out.packMeta },
        comboPackName,
      );
      const packId = await persistCombo(built);
      setComboProgress(100);
      if (out.warnings && out.warnings.length > 0) {
        toast.warning(`Có ${out.warnings.length} page lỗi — pack vẫn tạo được`);
      } else {
        toast.success(`Đã tạo pack "${built.pack.name}" (${built.pages.length} page)`);
      }
      setComboOpen(false);
      setComboFiles([]);
      setComboPreviews([]);
      setComboInstructions("");
      setComboPreferVisibleLines(true);
      navigate({ to: "/templates", search: { open: packId } });
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setComboBusy(false);
      setComboStep("");
      setComboProgress(0);
    }
  };

  return (
    <PageContainer>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAiImageChange} />
      <input
        ref={comboFileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onComboFilesChange}
      />
      <PageHeader
        icon={<Package className="size-5" />}
        title="Pack Templates"
        description="Tạo pack trước, sau đó thêm nhiều page template và chỉnh từng page trong editor."
        actions={
          <>
            <Button variant="outline" onClick={onPickAiImage} disabled={aiBusy}>
              {aiBusy ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="size-4 mr-2" />
              )}
              AI thêm page từ ảnh
            </Button>
            <Button variant="outline" onClick={onPickComboImages} disabled={aiBusy}>
              <Layers className="size-4 mr-2" /> AI dựng combo
            </Button>
            <Button onClick={createNewPack}>
              <Plus className="size-4 mr-2" /> Tạo pack mới
            </Button>
          </>
        }
      />

      <Dialog open={singleOpen} onOpenChange={(o) => !aiBusy && setSingleOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI dựng template từ ảnh</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {singlePreview && (
              <div className="overflow-hidden rounded-lg border bg-muted">
                <img
                  src={singlePreview}
                  alt={singleFileName}
                  className="max-h-[420px] w-full object-contain"
                />
              </div>
            )}

            <div>
              <Label>Tên template</Label>
              <Input
                value={singleTemplateName}
                onChange={(e) => setSingleTemplateName(e.target.value)}
                placeholder="AI: Ten-template"
                disabled={aiBusy}
              />
            </div>

            <div>
              <Label>Mức bám sát mẫu</Label>
              <Select
                value={singleFidelity}
                onValueChange={(value) => setSingleFidelity(value as LayoutFidelity)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">Bám sát mẫu</SelectItem>
                  <SelectItem value="balanced">Cân bằng</SelectItem>
                  <SelectItem value="creative">Sáng tạo nhẹ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ghi chú cho AI</Label>
              <Textarea
                value={singleInstructions}
                onChange={(e) => setSingleInstructions(e.target.value)}
                placeholder="Ví dụ: giữ nền tối, title vàng nổi, ảnh bo góc đặt hai bên, chia danh sách thành nhiều cụm giống ảnh mẫu."
                className="mt-2 min-h-[110px]"
                disabled={aiBusy}
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={singlePreferVisibleLines}
                onCheckedChange={(checked) => setSinglePreferVisibleLines(checked === true)}
                disabled={aiBusy}
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">Ưu tiên số dòng thật</div>
                <div className="text-xs text-muted-foreground">
                  Nếu ảnh mẫu nhìn thấy nhiều dòng item riêng biệt, AI sẽ cố giữ từng dòng thay vì
                  gom thành block lớn.
                </div>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleOpen(false)} disabled={aiBusy}>
              Huỷ
            </Button>
            <Button onClick={startSingleImageGeneration} disabled={aiBusy || !singlePreview}>
              {aiBusy ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="size-4 mr-2" />
              )}
              Dựng template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={comboOpen} onOpenChange={(o) => !comboBusy && setComboOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI dựng combo từ {comboPreviews.length} ảnh</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tên pack (để trống → AI tự đặt)</Label>
              <Input
                value={comboPackName}
                onChange={(e) => setComboPackName(e.target.value)}
                placeholder="Vd: Đà Lạt 4N3Đ"
                disabled={comboBusy}
              />
            </div>
            <div>
              <Label>Mức bám sát mẫu</Label>
              <Select
                value={comboFidelity}
                onValueChange={(value) => setComboFidelity(value as LayoutFidelity)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">Bám sát mẫu</SelectItem>
                  <SelectItem value="balanced">Cân bằng</SelectItem>
                  <SelectItem value="creative">Sáng tạo nhẹ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ghi chú cho AI</Label>
              <Textarea
                value={comboInstructions}
                onChange={(e) => setComboInstructions(e.target.value)}
                placeholder="Ví dụ: giữ đúng kiểu poster nền tối, title vàng nổi, 3-4 ảnh bo góc floating quanh canvas, danh sách bullet chia nhiều cụm như ảnh mẫu."
                className="mt-2 min-h-[110px]"
                disabled={comboBusy}
              />
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                checked={comboPreferVisibleLines}
                onCheckedChange={(checked) => setComboPreferVisibleLines(checked === true)}
                disabled={comboBusy}
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">Ưu tiên số dòng thật</div>
                <div className="text-xs text-muted-foreground">
                  Khi bộ ảnh là poster bullet-list, AI sẽ giữ line-level rõ hơn để draft không bị
                  rơi về item-group generic.
                </div>
              </div>
            </label>
            <div>
              <Label>Ảnh đã chọn</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2 max-h-[300px] overflow-y-auto">
                {comboPreviews.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative group aspect-[4/5] rounded overflow-hidden border bg-muted"
                  >
                    <img src={src} alt={`page-${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 text-[10px] bg-black/60 text-white rounded px-1">
                      #{idx + 1}
                    </div>
                    {!comboBusy && (
                      <button
                        onClick={() => removeComboImage(idx)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {comboBusy && (
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">{comboStep}</div>
                <Progress value={comboProgress} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComboOpen(false)} disabled={comboBusy}>
              Huỷ
            </Button>
            <Button onClick={startCombo} disabled={comboBusy || comboPreviews.length === 0}>
              {comboBusy ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="size-4 mr-2" />
              )}
              Bắt đầu dựng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Danh sách pack
          </h2>
          <div className="space-y-2">
            {packs?.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Chưa có pack. Bấm "Tạo pack mới" để bắt đầu.
                </CardContent>
              </Card>
            )}
            {packs?.map((pack) => (
              <Card
                key={pack.packTemplateId}
                className={`cursor-pointer border-border/70 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-sm ${
                  editing?.packTemplateId === pack.packTemplateId
                    ? "border-primary bg-accent/40"
                    : ""
                }`}
                onClick={() => {
                  setEditing({ ...pack });
                  navigate({ to: "/templates", search: { open: pack.packTemplateId } });
                }}
              >
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{pack.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {pack.orderedPages.length} page
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async (event) => {
                      event.stopPropagation();
                      if (
                        !confirm(`Xóa pack "${pack.name}"? Page sẽ được gom lại vào pack mặc định.`)
                      )
                        return;
                      await db.packTemplates.delete(pack.packTemplateId);
                      if (editing?.packTemplateId === pack.packTemplateId) setEditing(null);
                      await ensureOrphanTemplatesInDefaultPack();
                      toast.success("Đã xóa pack");
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          {!editing && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
                  <Package className="size-5" />
                </span>
                Chọn một pack để sửa hoặc tạo pack mới.
              </CardContent>
            </Card>
          )}
          {editing && (
            <PackBuilder
              pack={editing}
              allTemplates={tpls ?? []}
              onChange={setEditing}
              onSave={savePack}
              onDuplicate={duplicatePack}
              onCreatePage={createPageInPack}
              onCreateAiPage={onPickAiImage}
              onDuplicatePage={duplicatePageInPack}
              onDeletePage={deletePageFromPack}
            />
          )}
        </div>
      </div>
    </PageContainer>
  );
}
