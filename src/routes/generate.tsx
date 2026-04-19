import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { generatePackJob } from "@/engines/selection/generate";
import { useJobStore } from "@/features/generate/jobStore";
import { PageRenderer } from "@/features/render/PageRenderer";
import { nodeToPngBlob, downloadPng, downloadZip } from "@/features/render/exportPng";
import { Sparkles, Download, Package, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/generate")({
  component: GeneratePage,
});

function GeneratePage() {
  const packs = useLiveQuery(() => db.packTemplates.toArray(), []);
  const tpls = useLiveQuery(() => db.pageTemplates.toArray(), []);
  const entities = useLiveQuery(() => db.entities.toArray(), []);
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const overrides = useLiveQuery(() => db.overrides.toArray(), []);

  const [packId, setPackId] = useState<string | undefined>(undefined);
  const [debug, setDebug] = useState(false);
  const [filter, setFilter] = useState<"all" | "selected" | "errors" | "partner">("all");
  const { currentJob, setJob, toggleSelected, setSelectedAll } = useJobStore();
  const renderRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const selectedPack = packs?.find((p) => p.packTemplateId === packId);

  const onGenerate = () => {
    if (!selectedPack || !tpls || !entities || !assets) return;
    const job = generatePackJob({
      pack: selectedPack,
      pageTemplates: tpls,
      entities,
      assets,
      overrides: overrides ?? [],
    });
    setJob(job);
    toast.success(`Đã tạo ${job.pages.length} page`);
  };

  const exportZip = async () => {
    if (!currentJob || !tpls || !entities || !assets) return;
    const sel = currentJob.pages.filter((p) => p.selected);
    if (sel.length === 0) return toast.error("Chưa chọn page nào");
    toast.info(`Đang export ${sel.length} page...`);
    const files: Array<{ name: string; blob: Blob }> = [];
    for (const p of sel) {
      const node = renderRefs.current.get(p.pageIndex);
      if (!node) continue;
      const blob = await nodeToPngBlob(node, 2);
      files.push({ name: p.pageFile, blob });
    }
    await downloadZip(files, `${currentJob.packTemplateName}.zip`);
    // Lưu job vào history
    await db.jobs.put({ ...currentJob, status: "exported" });
    toast.success("Đã export ZIP & lưu job");
  };

  const filteredPages = currentJob?.pages.filter((p) => {
    if (filter === "selected") return p.selected;
    if (filter === "errors") return p.warnings.length > 0 || p.state === "rejected";
    if (filter === "partner") return p.items.some((i) => i.partnerFlag);
    return true;
  });

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-3xl font-bold mb-6">Tạo nội dung</h1>

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs text-muted-foreground">Pack template</label>
            <Select value={packId} onValueChange={setPackId}>
              <SelectTrigger><SelectValue placeholder="Chọn pack..." /></SelectTrigger>
              <SelectContent>
                {packs?.map((p) => (
                  <SelectItem key={p.packTemplateId} value={p.packTemplateId}>
                    {p.name} ({p.orderedPages.length} page)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onGenerate} disabled={!packId}>
            <Sparkles className="size-4 mr-2" /> Generate
          </Button>
          <Button variant="outline" onClick={() => setDebug((d) => !d)}>
            {debug ? <EyeOff className="size-4 mr-2" /> : <Eye className="size-4 mr-2" />}
            {debug ? "Tắt debug" : "Bật debug"}
          </Button>
        </CardContent>
      </Card>

      {currentJob && (
        <>
          <Card className="mb-4">
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Badge variant="outline">{currentJob.pages.length} page</Badge>
              <Badge variant="secondary">{currentJob.pages.filter((p) => p.selected).length} đã chọn</Badge>
              <div className="flex-1" />
              <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="selected">Đang chọn</SelectItem>
                  <SelectItem value="errors">Có cảnh báo</SelectItem>
                  <SelectItem value="partner">Có đối tác</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setSelectedAll(true)}>Chọn hết</Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedAll(false)}>Bỏ chọn hết</Button>
              <Button onClick={exportZip}>
                <Package className="size-4 mr-2" /> Export ZIP
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPages?.map((p) => {
              const tpl = tpls?.find((t) => t.pageTemplateId === p.pageTemplateId);
              if (!tpl) return null;
              const previewScale = 320 / tpl.canvas.width;
              return (
                <Card key={p.pageIndex} className={p.selected ? "border-primary" : ""}>
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <Checkbox checked={p.selected} onCheckedChange={() => toggleSelected(p.pageIndex)} />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{tpl.name}</div>
                          <div className="text-xs text-muted-foreground">{p.pageFile}</div>
                        </div>
                      </div>
                      <Badge variant={p.healthScore >= 80 ? "default" : p.healthScore >= 50 ? "secondary" : "destructive"}>
                        {p.healthScore}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-2">
                    <div className="overflow-hidden rounded border bg-muted/30">
                      <div ref={(el) => { if (el) renderRefs.current.set(p.pageIndex, el); }}>
                        <PageRenderer
                          template={tpl}
                          page={p}
                          entities={entities ?? []}
                          assets={assets ?? []}
                          scale={previewScale}
                          debug={debug}
                        />
                      </div>
                    </div>
                    {p.warnings.length > 0 && (
                      <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 p-2 rounded space-y-0.5">
                        {p.warnings.slice(0, 3).map((w, i) => <div key={i}>⚠ {w}</div>)}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={async () => {
                        const node = renderRefs.current.get(p.pageIndex);
                        if (!node) return;
                        await downloadPng(node, p.pageFile, 2);
                      }}
                    >
                      <Download className="size-3 mr-1" /> Export PNG
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!currentJob && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Chọn 1 pack rồi bấm Generate để xem preview các page.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
