import { Link } from "@tanstack/react-router";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DashboardPackRef, DashboardJobRow } from "@/lib/dashboardSummary";

export function ResumeSection({
  pack,
  latestJob,
}: {
  pack: { ref: DashboardPackRef; isResumed: boolean } | undefined;
  latestJob: DashboardJobRow | undefined;
}) {
  if (!pack && !latestJob) return null;
  const cols = pack && latestJob ? "md:grid-cols-2" : "md:grid-cols-1";
  return (
    <section className={cn("grid gap-3", cols)} aria-label="Tiếp tục">
      {pack && <PackCell pack={pack.ref} isResumed={pack.isResumed} />}
      {latestJob && <LatestJobCell job={latestJob} />}
    </section>
  );
}

function PackCell({ pack, isResumed }: { pack: DashboardPackRef; isResumed: boolean }) {
  const percent =
    pack.totalBindable > 0 ? (pack.boundCount / pack.totalBindable) * 100 : 0;
  return (
    <Link
      to="/generate"
      search={{ pack: pack.packTemplateId } as never}
      className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {isResumed ? "▶ Đang bind" : "▶ Đã mở gần đây"}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{pack.packName}</div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={percent} className="h-1.5" />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {pack.boundCount}/{pack.totalBindable} ô
        </span>
      </div>
      <div className="mt-3 text-xs font-medium text-primary">Tiếp tục bind ›</div>
    </Link>
  );
}

function LatestJobCell({ job }: { job: DashboardJobRow }) {
  return (
    <Link
      to="/history"
      search={{ job: job.jobId } as never}
      className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        ⏱ Job mới nhất
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{job.name}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {job.pageCount} trang
        {job.warningCount > 0 ? (
          <span className="ml-2 text-rose-600 dark:text-rose-300">
            {job.warningCount} cảnh báo
          </span>
        ) : (
          <span className="ml-2 text-emerald-600 dark:text-emerald-300">Hoàn tất</span>
        )}
      </div>
      <div className="mt-3 text-xs font-medium text-primary">Mở job ›</div>
    </Link>
  );
}
