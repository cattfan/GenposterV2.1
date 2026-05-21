import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "@/storage/useLiveQuery";
import { db } from "@/storage/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useJobStore } from "@/features/generate/jobStore";
import { toast } from "sonner";
import { History, Search, AlertTriangle, FileWarning } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { EmptyState, SkeletonList } from "@/components/ux";
import { cn } from "@/lib/utils";
import type { GenerationJob } from "@/models";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
  validateSearch: (search: Record<string, unknown>): { job?: string } => ({
    job: typeof search.job === "string" ? search.job : undefined,
  }),
});

type StatusFilter = "all" | GenerationJob["status"];

const STATUS_LABELS: Record<GenerationJob["status"], string> = {
  draft: "Nháp",
  generated: "Đã tạo",
  exported: "Đã xuất",
};

const STATUS_TONE: Record<GenerationJob["status"], string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  generated: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  exported: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
};

function HistoryPage() {
  const search = Route.useSearch();
  const highlightId = search.job;
  const jobs = useLiveQuery(
    () => db.jobs.orderBy("createdAt").reverse().toArray(),
    [],
    ["jobs"],
  );
  const { setJob } = useJobStore();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Scroll vào job được highlight (mở từ dashboard).
  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, jobs]);

  const filteredJobs = useMemo(() => {
    if (!jobs) return undefined;
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (q && !j.packTemplateName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jobs, query, statusFilter]);

  const counts = useMemo(() => {
    if (!jobs) return { all: 0, draft: 0, generated: 0, exported: 0 };
    return jobs.reduce(
      (acc, j) => {
        acc.all += 1;
        acc[j.status] += 1;
        return acc;
      },
      { all: 0, draft: 0, generated: 0, exported: 0 } as Record<StatusFilter, number>,
    );
  }, [jobs]);

  const onConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    await db.jobs.delete(pendingDeleteId);
    setPendingDeleteId(null);
    toast.success("Đã xoá");
  };

  return (
    <PageContainer className="max-w-5xl space-y-4">
      <PageHeader
        icon={<History className="size-5" />}
        title="Lịch sử"
        description="Các lần export gần đây. Có thể mở lại để tiếp tục chỉnh sửa."
      />

      {jobs && jobs.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên bộ mẫu..."
              className="pl-9"
              aria-label="Tìm lịch sử"
            />
          </div>
          <ToggleGroup
            type="single"
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="all">Tất cả ({counts.all})</ToggleGroupItem>
            <ToggleGroupItem value="draft">Nháp ({counts.draft})</ToggleGroupItem>
            <ToggleGroupItem value="generated">Đã tạo ({counts.generated})</ToggleGroupItem>
            <ToggleGroupItem value="exported">Đã xuất ({counts.exported})</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {jobs === undefined && <SkeletonList count={3} height="h-20" />}

      {jobs && jobs.length === 0 && (
        <EmptyState
          icon={<History />}
          title="Chưa có lịch sử"
          description="Mỗi lần bạn xuất ZIP, mục sẽ được lưu ở đây để mở lại và chỉnh sửa."
        />
      )}

      {filteredJobs && jobs && jobs.length > 0 && filteredJobs.length === 0 && (
        <EmptyState
          icon={<FileWarning />}
          title="Không có kết quả"
          description="Đổi từ khoá hoặc bộ lọc để xem lại."
        />
      )}

      <div className="space-y-2">
        {filteredJobs?.map((j) => {
          const warningCount = j.pages.reduce(
            (sum, page) => sum + page.warnings.length,
            0,
          );
          const partnerCount = j.pages
            .flatMap((p) => p.items)
            .filter((i) => i.partnerFlag).length;
          const selectedCount = j.pages.filter((p) => p.selected).length;
          const isHighlighted = highlightId === j.jobId;
          return (
            <Card
              key={j.jobId}
              ref={isHighlighted ? highlightRef : undefined}
              className={cn(
                "border-border/70 transition-shadow hover:shadow-sm",
                isHighlighted && "ring-2 ring-primary",
              )}
            >
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{j.packTemplateName}</span>
                    <Badge
                      variant="secondary"
                      className={cn("border-0", STATUS_TONE[j.status])}
                    >
                      {STATUS_LABELS[j.status]}
                    </Badge>
                    {warningCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                        <AlertTriangle className="size-3" />
                        {warningCount} cảnh báo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(j.createdAt).toLocaleString("vi-VN")} ·{" "}
                    {j.pages.length} trang · {selectedCount} chọn ·{" "}
                    {partnerCount} lần đối tác xuất hiện
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setJob(j);
                    toast.success("Đã mở vào màn Tạo nội dung");
                  }}
                >
                  Mở lại
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingDeleteId(j.jobId)}
                >
                  Xoá
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={Boolean(pendingDeleteId)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá mục này?</AlertDialogTitle>
            <AlertDialogDescription>
              Mục sẽ bị xoá khỏi lịch sử. Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onConfirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
