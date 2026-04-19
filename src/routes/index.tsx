import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Package, Database, Sparkles, FileText, Download, Upload } from "lucide-react";
import { exportProjectJSON, importProjectJSON } from "@/storage/projectIO";
import { downloadJSON } from "@/features/render/exportPng";
import { toast } from "sonner";
import { useRef } from "react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const project = useLiveQuery(() => db.projects.toCollection().first(), []);
  const counts = useLiveQuery(async () => {
    const [tpl, pack, ent, asset, job] = await Promise.all([
      db.pageTemplates.count(),
      db.packTemplates.count(),
      db.entities.count(),
      db.assets.count(),
      db.jobs.count(),
    ]);
    return { tpl, pack, ent, asset, job };
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trang chủ</h1>
          <p className="text-muted-foreground mt-1">
            Project hiện tại:{" "}
            <span className="font-semibold text-foreground">{project?.name ?? "(chưa có)"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const data = await exportProjectJSON();
              downloadJSON(data, `project-${Date.now()}.json`);
              toast.success("Đã export project JSON");
            }}
          >
            <Download className="size-4 mr-2" />
            Export JSON
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4 mr-2" />
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                await importProjectJSON(data);
                toast.success("Đã import project");
                window.location.reload();
              } catch (err) {
                toast.error("Lỗi import: " + (err as Error).message);
              }
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Page Templates" value={counts?.tpl ?? 0} icon={Layers} to="/templates" />
        <StatCard label="Pack Templates" value={counts?.pack ?? 0} icon={Package} to="/packs" />
        <StatCard label="Entities" value={counts?.ent ?? 0} icon={Database} to="/data" />
        <StatCard label="Assets" value={counts?.asset ?? 0} icon={Database} to="/data" />
        <StatCard label="Jobs đã tạo" value={counts?.job ?? 0} icon={FileText} to="/history" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              Bắt đầu nhanh
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              App đã có sẵn pack demo Đà Lạt. Bạn có thể chạy generate thử ngay.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/generate">Tạo content pack</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/templates">Xem templates</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/data">Quản lý dữ liệu</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quy trình</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <Step n={1} text="Tạo / sửa Page Template (kéo thả)" />
            <Step n={2} text="Ghép thành Pack Template" />
            <Step n={3} text="Import dữ liệu CSV/JSON/Sheet" />
            <Step n={4} text="Generate, tick chọn page" />
            <Step n={5} text="Export PNG/ZIP + caption + report" />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Local-first</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>
            <Badge variant="secondary">IndexedDB</Badge> Mọi dữ liệu lưu trên trình duyệt của bạn,
            không gửi lên server.
          </div>
          <div>
            <Badge variant="secondary">Export/Import JSON</Badge> Sao lưu hoặc chia sẻ project dễ
            dàng.
          </div>
          <div>
            <Badge variant="secondary">Không cần đăng nhập</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
}) {
  return (
    <Link to={to}>
      <Card className="hover:border-primary transition-colors cursor-pointer">
        <CardContent className="p-4">
          <Icon className="size-5 text-muted-foreground mb-2" />
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold shrink-0">
        {n}
      </div>
      <div>{text}</div>
    </div>
  );
}
