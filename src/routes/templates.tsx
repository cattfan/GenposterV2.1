import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { Button } from "@/components/ui/button";
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
import { useEffect, useMemo, useRef, useState } from "react";
import type { PackTemplate, PageTemplate } from "@/models";
import {
  aiGenerateTemplateFromImage,
  aiGenerateComboFromImages,
  type LayoutFidelity,
} from "@/features/ai/aiFeatures";
import { aiLayoutToTemplateWithQuality } from "@/features/ai/templateFromImage";
import { buildComboFromAiResult, persistCombo } from "@/features/ai/comboFromImages";
import { PageContainer } from "@/components/PageHeader";
import { PackBuilder } from "@/features/packs/PackBuilder";
import { PackPagePreview } from "@/features/packs/PackPagePreview";
import { cn } from "@/lib/utils";
import {
  appendPageToPack,
  createBlankPageTemplate,
  createPackTemplate,
  duplicatePageTemplate,
} from "@/features/packs/packTemplateUtils";

export const Route = createFileRoute("/templates")({
  component: TemplatesPage,
});

const UNDO_TOAST_DURATION = 10_000;

function clonePackTemplate(pack: PackTemplate): PackTemplate {
  return structuredClone(pack);
}

function clonePageTemplate(template: PageTemplate): PageTemplate {
  return structuredClone(template);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function PackPreviewThumb({
  template,
  className,
}: {
  template?: PageTemplate;
  className?: string;
}) {
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-md border bg-background", className)}
      style={{
        aspectRatio: template ? `${template.canvas.width} / ${template.canvas.height}` : "4 / 5",
      }}
    >
      {template ? (
        <PackPagePreview tpl={template} />
      ) : (
        <div className="grid size-full place-items-center text-[10px] text-muted-foreground">
          Mất
        </div>
      )}
    </div>
  );
}

function PackSummaryCard({
  pack,
  templateMap,
  active,
  onSelect,
  onDelete,
}: {
  pack: PackTemplate;
  templateMap: Map<string, PageTemplate>;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const pageItems = pack.orderedPages.map((id) => ({ id, template: templateMap.get(id) }));

  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm transition-colors",
        active ? "border-primary/60 bg-accent/20" : "hover:border-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="truncate text-lg font-semibold">{pack.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {pack.orderedPages.length} page trong pack
          </div>
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Xóa pack"
          aria-label="Xóa pack"
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>

      <button type="button" className="block w-full p-4 text-left" onClick={onSelect}>
        {pageItems.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Pack chưa có page.
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-full gap-3">
              {pageItems.map(({ id, template }, index) => (
                <div
                  key={`${id}-${index}`}
                  className="w-[150px] shrink-0 rounded-lg border bg-background p-2 shadow-sm sm:w-[170px]"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="grid size-7 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </div>
                    <div className="min-w-0 truncate text-sm font-medium">
                      {template?.name ?? "Template không tồn tại"}
                    </div>
                  </div>
                  <PackPreviewThumb template={template} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

function TemplatesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeSearch = location.search as { open?: unknown };
  const openPackId = typeof routeSearch.open === "string" ? routeSearch.open : undefined;
  const packs = useLiveQuery(() => db.packTemplates.orderBy("updatedAt").reverse().toArray(), []);
  const tpls = useLiveQuery(() => db.pageTemplates.orderBy("updatedAt").reverse().toArray(), []);
  const templateMap = useMemo(
    () => new Map((tpls ?? []).map((template) => [template.pageTemplateId, template])),
    [tpls],
  );
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
    if (!packs) return;
    if (packs.length === 0) {
      setEditing(null);
      return;
    }

    if (!openPackId) {
      if (editing) setEditing(null);
      return;
    }

    const bySearch = packs.find((pack) => pack.packTemplateId === openPackId);
    if (!bySearch) {
      setEditing(null);
      return;
    }
    if (
      !editing ||
      editing.packTemplateId !== bySearch.packTemplateId ||
      editing.updatedAt !== bySearch.updatedAt
    ) {
      setEditing({ ...bySearch });
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

  const selectPack = (pack: PackTemplate) => {
    setEditing({ ...pack });
    navigate({ to: "/templates", search: { open: pack.packTemplateId } });
  };

  const collapsePack = () => {
    setEditing(null);
    navigate({ to: "/templates", search: { open: undefined } });
  };

  const deletePack = async (pack: PackTemplate) => {
    const deletedPack = clonePackTemplate(pack);
    const wasActive = editing?.packTemplateId === pack.packTemplateId;
    await db.packTemplates.delete(pack.packTemplateId);
    if (wasActive) {
      setEditing(null);
      navigate({ to: "/templates", search: { open: undefined } });
    }
    toast.success("Đã xóa pack", {
      description: `"${pack.name}" có thể khôi phục trong vài giây.`,
      duration: UNDO_TOAST_DURATION,
      action: {
        label: "Khôi phục",
        onClick: () => {
          void db.packTemplates
            .put(deletedPack)
            .then(() => {
              if (wasActive) {
                setEditing(deletedPack);
                navigate({ to: "/templates", search: { open: deletedPack.packTemplateId } });
              }
              toast.success("Đã khôi phục pack");
            })
            .catch((error) => {
              toast.error("Không thể khôi phục pack: " + errorMessage(error));
            });
        },
      },
    });
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
    const pageNumber = pack.orderedPages.length + 1;
    const page = createBlankPageTemplate({ name: `Page mới ${pageNumber}` });
    const nextPack = appendPageToPack(pack, page.pageTemplateId);
    await db.transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
      await db.pageTemplates.put(page);
      await db.packTemplates.put(nextPack);
    });
    setEditing(nextPack);
    toast.success(`Đã tạo ${page.name}`);
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
    const deletedTemplate = clonePageTemplate(template);
    const activePackId = editing?.packTemplateId;
    const allPacks = await db.packTemplates.toArray();
    const affectedPacks = allPacks
      .filter((pack) => pack.orderedPages.includes(template.pageTemplateId))
      .map(clonePackTemplate);
    const updatedAt = Date.now();
    const nextEditing =
      editing && editing.orderedPages.includes(template.pageTemplateId)
        ? {
            ...editing,
            orderedPages: editing.orderedPages.filter((id) => id !== template.pageTemplateId),
            requiredPages: editing.requiredPages.filter((id) => id !== template.pageTemplateId),
            optionalPages: editing.optionalPages.filter((id) => id !== template.pageTemplateId),
            updatedAt,
          }
        : editing;

    await db.transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
      await db.pageTemplates.delete(template.pageTemplateId);
      for (const pack of allPacks) {
        if (!pack.orderedPages.includes(template.pageTemplateId)) continue;
        await db.packTemplates.put({
          ...pack,
          orderedPages: pack.orderedPages.filter((id) => id !== template.pageTemplateId),
          requiredPages: pack.requiredPages.filter((id) => id !== template.pageTemplateId),
          optionalPages: pack.optionalPages.filter((id) => id !== template.pageTemplateId),
          updatedAt,
        });
      }
    });
    if (nextEditing) {
      setEditing(nextEditing);
    }
    toast.success("Đã xóa page", {
      description: `"${template.name}" có thể khôi phục trong vài giây.`,
      duration: UNDO_TOAST_DURATION,
      action: {
        label: "Khôi phục",
        onClick: () => {
          void db
            .transaction("rw", [db.pageTemplates, db.packTemplates], async () => {
              await db.pageTemplates.put(deletedTemplate);
              for (const pack of affectedPacks) {
                await db.packTemplates.put(pack);
              }
            })
            .then(() => {
              const restoredActivePack = activePackId
                ? affectedPacks.find((pack) => pack.packTemplateId === activePackId)
                : undefined;
              if (restoredActivePack) {
                setEditing(restoredActivePack);
                navigate({ to: "/templates", search: { open: restoredActivePack.packTemplateId } });
              }
              toast.success("Đã khôi phục page");
            })
            .catch((error) => {
              toast.error("Không thể khôi phục page: " + errorMessage(error));
            });
        },
      },
    });
  };

  const renamePageTemplate = async (template: PageTemplate, name: string) => {
    const nextName = name.trim();
    if (!nextName || nextName === template.name) return;
    await db.pageTemplates.update(template.pageTemplateId, {
      name: nextName,
      updatedAt: Date.now(),
    });
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
    <PageContainer className="max-w-[1500px]">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAiImageChange} />
      <input
        ref={comboFileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onComboFilesChange}
      />
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Package className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Pack Templates</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
          <Button variant="outline" onClick={onPickComboImages} disabled={aiBusy}>
            <Layers className="size-4 mr-2" /> AI Gen
          </Button>
          <Button onClick={createNewPack}>
            <Plus className="size-4 mr-2" /> Tạo pack mới
          </Button>
        </div>
      </div>

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

      <div className="flex flex-col gap-4">
        {packs?.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-accent text-primary">
              <Package className="size-5" />
            </span>
            Chưa có pack. Bấm "Tạo pack mới" để bắt đầu.
          </div>
        ) : null}

        {packs?.map((pack) => {
          const active = editing?.packTemplateId === pack.packTemplateId;
          if (active && editing) {
            return (
              <PackBuilder
                key={pack.packTemplateId}
                pack={editing}
                allTemplates={tpls ?? []}
                onChange={setEditing}
                onSave={savePack}
                onDuplicate={duplicatePack}
                onCreatePage={createPageInPack}
                onCreateAiPage={onPickAiImage}
                onDuplicatePage={duplicatePageInPack}
                onDeletePage={deletePageFromPack}
                onRenamePage={renamePageTemplate}
                onDeletePack={() => deletePack(pack)}
                onCollapse={collapsePack}
              />
            );
          }

          return (
            <PackSummaryCard
              key={pack.packTemplateId}
              pack={pack}
              templateMap={templateMap}
              active={active}
              onSelect={() => selectPack(pack)}
              onDelete={() => deletePack(pack)}
            />
          );
        })}
      </div>
    </PageContainer>
  );
}
