import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { useJobStore } from "@/features/generate/jobStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  buildFinalManifest,
  buildPartnersDetailedCsv,
  buildPartnersSummaryTxt,
  buildRenderManifest,
} from "@/engines/reports/reports";
import { downloadJSON, downloadText } from "@/features/render/exportPng";
import { generateCaptions } from "@/engines/captions/generator";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import type { CaptionMode, CaptionVariant } from "@/models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { currentJob } = useJobStore();
  const entities = useLiveQuery(() => db.entities.toArray(), []) ?? [];
  const tpls = useLiveQuery(() => db.pageTemplates.toArray(), []) ?? [];
  const packs = useLiveQuery(() => db.packTemplates.toArray(), []) ?? [];
  const [mode, setMode] = useState<CaptionMode>("save_post");

  const captions: CaptionVariant[] = useMemo(() => {
    if (!currentJob) return [];
    const pack = packs.find((p) => p.packTemplateId === currentJob.packTemplateId);
    if (!pack) return [];
    return generateCaptions({ job: currentJob, pack, entities, mode, count: 4 });
  }, [currentJob, packs, entities, mode]);

  if (!currentJob) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Báo cáo & Caption</h1>
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          Chưa có job. Mở "Tạo nội dung" và generate trước.
        </CardContent></Card>
      </div>
    );
  }

  const partnersTxt = buildPartnersSummaryTxt(currentJob, entities, true);
  const partnersTxtPreview = buildPartnersSummaryTxt(currentJob, entities, false);
  const csvFinal = buildPartnersDetailedCsv(
    { ...currentJob, pages: currentJob.pages.filter((p) => p.selected) },
    entities,
    tpls,
  );
  const csvAll = buildPartnersDetailedCsv(currentJob, entities, tpls);
  const finalManifest = buildFinalManifest(currentJob);
  const previewManifest = buildRenderManifest(currentJob);

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <h1 className="text-3xl font-bold">Báo cáo & Caption</h1>

      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners">Đối tác</TabsTrigger>
          <TabsTrigger value="manifest">Manifest</TabsTrigger>
          <TabsTrigger value="captions">Captions</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Final exposure (page đã chọn export)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="text-xs bg-muted p-3 rounded max-h-64 overflow-y-auto whitespace-pre-wrap">{partnersTxt}</pre>
              <div className="flex gap-2">
                <Button onClick={() => downloadText(partnersTxt, "partners_summary.txt")}>Download TXT</Button>
                <Button variant="outline" onClick={() => downloadText(csvFinal, "partners_detailed.csv", "text/csv")}>Download CSV</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Preview exposure (toàn bộ page generated)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="text-xs bg-muted p-3 rounded max-h-64 overflow-y-auto whitespace-pre-wrap">{partnersTxtPreview}</pre>
              <Button variant="outline" onClick={() => downloadText(csvAll, "partners_preview.csv", "text/csv")}>Download CSV preview</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manifest" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>final_export_manifest.json</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <pre className="text-xs bg-muted p-3 rounded max-h-80 overflow-auto">{JSON.stringify(finalManifest, null, 2)}</pre>
              <Button onClick={() => downloadJSON(finalManifest, "final_export_manifest.json")}>Download</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>render_manifest.json (preview)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" onClick={() => downloadJSON(previewManifest, "render_manifest.json")}>Download</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="captions" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <span className="text-sm">Mode:</span>
              <Select value={mode} onValueChange={(v) => setMode(v as CaptionMode)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="save_post">save_post</SelectItem>
                  <SelectItem value="newbie_guide">newbie_guide</SelectItem>
                  <SelectItem value="review_pack">review_pack</SelectItem>
                  <SelectItem value="partner_soft">partner_soft</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                Caption sinh từ FINAL EXPORT manifest, không từ raw data.
              </span>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {captions.map((c) => {
              const full = `${c.headline}\n\n${c.body}\n\n${c.hashtags.join(" ")}`;
              return (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="font-bold text-sm">{c.headline}</div>
                    <div className="text-sm whitespace-pre-wrap">{c.body}</div>
                    <div className="text-xs text-primary font-medium">{c.hashtags.join(" ")}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(full);
                        toast.success("Đã copy caption");
                      }}
                    >
                      <Copy className="size-3 mr-1" /> Copy full
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
