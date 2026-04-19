import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/storage/settings";
import { clearAll } from "@/storage/db";
import { seedDemo } from "@/storage/seed";
import type { AppSettings } from "@/models";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [s, setS] = useState<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then(setS);
  }, []);

  if (!s) return <div className="p-8">Đang tải...</div>;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Cài đặt</h1>

      <Card>
        <CardHeader><CardTitle>Caption Provider</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Phase này dùng <strong>local rules tiếng Việt</strong> để sinh caption. Bạn có thể nhập API key để dành sẵn cho lần mở rộng sau.
          </p>
          <div>
            <Label>API key (tùy chọn, lưu local)</Label>
            <Input
              type="password"
              value={s.captionApiKey ?? ""}
              onChange={(e) => setS({ ...s, captionApiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Khổ ảnh mặc định</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <div>
            <Label>Width</Label>
            <Input type="number" value={s.defaultCanvas.width} onChange={(e) => setS({ ...s, defaultCanvas: { ...s.defaultCanvas, width: Number(e.target.value) || 1080 } })} />
          </div>
          <div>
            <Label>Height</Label>
            <Input type="number" value={s.defaultCanvas.height} onChange={(e) => setS({ ...s, defaultCanvas: { ...s.defaultCanvas, height: Number(e.target.value) || 1350 } })} />
          </div>
          <div>
            <Label>Export scale</Label>
            <Input type="number" min={1} max={4} value={s.exportScale} onChange={(e) => setS({ ...s, exportScale: Number(e.target.value) || 2 })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dữ liệu local</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" onClick={async () => { await seedDemo(true); toast.success("Đã nạp lại demo"); }}>Nạp lại demo</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (!confirm("Xóa toàn bộ dữ liệu local?")) return;
              await clearAll();
              localStorage.removeItem("cpg_seeded_v1");
              toast.success("Đã xóa hết");
              window.location.reload();
            }}
          >
            Xóa toàn bộ dữ liệu
          </Button>
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
    </div>
  );
}
