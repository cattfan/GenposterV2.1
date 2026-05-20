import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardJobRow } from "@/lib/dashboardSummary";

const STATUS_DOT: Record<DashboardJobRow["status"], string> = {
  draft: "bg-amber-500",
  generated: "bg-emerald-500",
  exported: "bg-emerald-500",
};

export function RecentJobsList({ jobs }: { jobs: DashboardJobRow[] }) {
  if (jobs.length === 0) return null;
  return (
    <Card className="border-border/70">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Job gần đây</CardTitle>
        <Link to="/history" className="text-xs font-medium text-primary">
          Xem lịch sử ›
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {jobs.map((job) => (
          <Link
            key={job.jobId}
            to="/history"
            search={{ job: job.jobId } as never}
            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
          >
            <span
              className={cn(
                "inline-block size-2 rounded-full",
                job.warningCount > 0 ? "bg-rose-500" : STATUS_DOT[job.status],
              )}
            />
            <span className="flex-1 truncate font-medium">{job.name}</span>
            <span className="text-xs text-muted-foreground">{job.pageCount} trang</span>
            {job.warningCount > 0 && (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-300">
                {job.warningCount}⚠
              </span>
            )}
            <span className="text-xs font-medium text-primary">Mở ›</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
