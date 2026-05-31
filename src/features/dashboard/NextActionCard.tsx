import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NextAction } from "@/lib/dashboardSummary";

const TONE_BG: Record<NextAction["tone"], string> = {
  danger: "bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20",
  warning: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20",
  neutral: "bg-slate-50 border-slate-200 dark:bg-slate-500/10 dark:border-slate-500/20",
  success: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20",
};
const TONE_LABEL: Record<NextAction["tone"], string> = {
  danger: "text-rose-700 dark:text-rose-300",
  warning: "text-amber-700 dark:text-amber-300",
  neutral: "text-slate-700 dark:text-slate-300",
  success: "text-emerald-700 dark:text-emerald-300",
};

export function NextActionCard({ action }: { action: NextAction }) {
  return (
    <section
      className={cn(
        "rounded-xl border p-5 shadow-sm",
        TONE_BG[action.tone],
      )}
      aria-label="Việc tiếp theo"
    >
      <div
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          TONE_LABEL[action.tone],
        )}
      >
        Việc tiếp theo
      </div>
      <h2 className="mt-2 text-xl font-semibold leading-tight text-foreground">
        {action.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{action.detail}</p>
      <div className="mt-4">
        <Button asChild size="sm">
          <Link to={action.to} search={action.search as never}>
            Bắt đầu ›
          </Link>
        </Button>
      </div>
    </section>
  );
}
