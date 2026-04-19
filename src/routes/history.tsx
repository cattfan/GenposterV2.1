import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useJobStore } from "@/features/generate/jobStore";
import { toast } from "sonner";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const jobs = useLiveQuery(() => db.jobs.orderBy("createdAt").reverse().toArray(), []);
  const { setJob } = useJobStore();

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-3xl font-bold mb-6">Lịch sử Job</h1>
      {jobs && jobs.length === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          Chưa có job nào. Job được lưu khi bạn export.
        </CardContent></Card>
      )}
      <div className="space-y-2">
        {jobs?.map((j) => (
          <Card key={j.jobId}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-semibold">{j.packTemplateName}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(j.createdAt).toLocaleString("vi-VN")} ·{" "}
                  {j.pages.length} page · {j.pages.filter((p) => p.selected).length} chọn ·{" "}
                  {j.pages.flatMap((p) => p.items).filter((i) => i.partnerFlag).length} lần đối tác xuất hiện
                </div>
              </div>
              <Badge>{j.status}</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setJob(j);
                  toast.success("Đã load job vào màn Tạo nội dung & Báo cáo");
                }}
              >
                Mở lại
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Xóa job này?")) return;
                  await db.jobs.delete(j.jobId);
                }}
              >
                Xóa
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
