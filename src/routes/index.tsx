// src/routes/index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, UploadCloud, Download, Home } from "lucide-react";
import { useLiveQuery } from "@/storage/useLiveQuery";
import { db } from "@/storage/db";
import { getSettings } from "@/storage/settings";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { buildDashboardSummary, type DashboardIssue } from "@/lib/dashboardSummary";
import { NextActionCard } from "@/features/dashboard/NextActionCard";
import { HealthChipRow } from "@/features/dashboard/HealthChipRow";
import { ResumeSection } from "@/features/dashboard/ResumeSection";
import { RecentJobsList } from "@/features/dashboard/RecentJobsList";
import { RemainingIssues } from "@/features/dashboard/RemainingIssues";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const dashboard = useLiveQuery(
    async () => {
      const [
        packTemplates,
        pageTemplates,
        entities,
        assets,
        jobs,
        blobCount,
        presetCount,
        analysisCount,
        packDrafts,
        settings,
      ] = await Promise.all([
        db.packTemplates.toArray(),
        db.pageTemplates.toArray(),
        db.entities.toArray(),
        db.assets.toArray(),
        db.jobs.orderBy("createdAt").reverse().toArray(),
        db.blobs.count(),
        db.generatePresets.count(),
        db.analyses.count(),
        db.packDrafts.toArray(),
        getSettings(),
      ]);
      return buildDashboardSummary({
        packTemplates,
        pageTemplates,
        entities,
        assets,
        jobs,
        blobCount,
        presetCount,
        analysisCount,
        packDrafts,
        aiConfigured: Boolean(settings.ai?.baseUrl && settings.ai.model),
      });
    },
    [],
    [
      "packTemplates",
      "pageTemplates",
      "entities",
      "assets",
      "jobs",
      "generatePresets",
      "analyses",
      "packDrafts",
      "settings",
    ],
  );

  if (!dashboard) {
    return (
      <PageContainer>
        <DashboardSkeleton />
      </PageContainer>
    );
  }

  const driveCount = dashboard.driveDownloadCandidateCount;
  const remainingIssues = dashboard.issues.filter(
    (issue) => !nextActionCoversIssue(dashboard.nextAction.id, issue),
  );
  const resumePack = dashboard.incompletePack
    ? { ref: dashboard.incompletePack, isResumed: true }
    : dashboard.recentPack
      ? { ref: dashboard.recentPack, isResumed: false }
      : undefined;
  const latestJob = dashboard.recentJobs[0];

  return (
    <PageContainer className="space-y-5">
      <PageHeader
        icon={<Home className="size-5" />}
        title="Tổng quan"
        description={
          dashboard.issues.length > 0
            ? `${dashboard.issues.length} việc cần xử lý`
            : "Mọi thứ OK"
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/data"><UploadCloud className="size-4" />Nhập dữ liệu</Link>
            </Button>
            {driveCount > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link to="/data" search={{ tab: "images" }}>
                  <Download className="size-4" />Tải ảnh từ sheet
                </Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link to="/generate"><Sparkles className="size-4" />Tạo nội dung</Link>
            </Button>
          </>
        }
      />

      <NextActionCard action={dashboard.nextAction} />

      <HealthChipRow
        data={{
          tone: dashboard.entities === 0 ? "danger" : dashboard.activeEntities < 5 ? "warning" : "good",
          total: dashboard.entities,
          activeEntities: dashboard.activeEntities,
          partnerEntities: dashboard.partnerEntities,
          sheetCount: dashboard.sheetCount,
        }}
        images={{
          tone:
            dashboard.assets === 0
              ? "danger"
              : dashboard.entitiesWithoutAssets > 0 || dashboard.linkAssets > 0 || dashboard.brokenAssets + dashboard.missingAssets > 0
                ? "warning"
                : "good",
          total: dashboard.assets,
          localAssets: dashboard.localAssets,
          linkAssets: dashboard.linkAssets,
          missing: dashboard.entitiesWithoutAssets,
        }}
        templates={{
          tone:
            dashboard.packTemplates === 0
              ? "danger"
              : dashboard.totalSlots > 0 && dashboard.mappedSlots / dashboard.totalSlots < 0.3
                ? "warning"
                : "good",
          packs: dashboard.packTemplates,
          pages: dashboard.pageTemplates,
          mappedSlots: dashboard.mappedSlots,
          totalSlots: dashboard.totalSlots,
          presetCount: dashboard.presetCount,
        }}
        ai={{
          tone: dashboard.aiConfigured ? "good" : "danger",
          configured: dashboard.aiConfigured,
        }}
      />

      <ResumeSection pack={resumePack} latestJob={latestJob} />

      <RecentJobsList jobs={dashboard.recentJobs} />

      <RemainingIssues issues={remainingIssues} />
    </PageContainer>
  );
}

function nextActionCoversIssue(
  nextActionId: string,
  issue: DashboardIssue,
): boolean {
  if (nextActionId === "no-data" && issue.label === "Chưa có dữ liệu") return true;
  if (nextActionId === "no-template" && issue.label === "Chưa có khuôn mẫu") return true;
  if (nextActionId === "download-images" && issue.label.includes("ảnh")) return true;
  if (nextActionId === "ai" && issue.label === "AI chưa cấu hình") return true;
  if (nextActionId === "warnings" && issue.label.includes("cảnh báo")) return true;
  return false;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
