import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardIssue } from "@/lib/dashboardSummary";

const TONE_DOT: Record<DashboardIssue["tone"], string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  neutral: "bg-slate-400",
};

export function RemainingIssues({ issues }: { issues: DashboardIssue[] }) {
  const [open, setOpen] = useState(issues.length <= 2);
  if (issues.length === 0) return null;
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          <CardTitle className="text-base">Cần xử lý khác ({issues.length})</CardTitle>
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          {issues.map((issue) => (
            <Link
              key={`${issue.label}-${issue.to}`}
              to={issue.to}
              search={issue.search as never}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn("inline-block size-2 rounded-full", TONE_DOT[issue.tone])}
                  />
                  <span className="font-medium">{issue.label}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{issue.detail}</div>
              </div>
              <span className="text-xs font-medium text-primary">Mở ›</span>
            </Link>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
