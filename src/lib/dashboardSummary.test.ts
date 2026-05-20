import { describe, expect, it } from "vitest";
import { buildDashboardSummary } from "@/lib/dashboardSummary";

const baseEntity = {
  entityId: "e1",
  name: "Cafe A",
  partnerFlag: false,
  partnerPriority: 0,
  partnerType: "none" as const,
  campaignTags: [],
  seoKeywords: [],
  status: "active" as const,
};

const baseAsset = {
  assetId: "a1",
  entityId: "e1",
  sourceType: "local" as const,
  sourceValue: "idb://blob-1",
  blobKey: "blob-1",
  role: "generic" as const,
  qualityScore: 80,
  isCover: false,
  status: "ok" as const,
};

const basePageTemplate = {
  pageTemplateId: "p1",
  name: "Page 1",
  type: "mixed" as const,
  canvas: { width: 1000, height: 1000 },
  slots: [
    { slotId: "s1", x: 0, y: 0, width: 100, height: 100, kind: "text" as const, bindingPath: "entity.name" },
  ],
  sections: [],
  updatedAt: 0,
  createdAt: 0,
};

describe("dashboardSummary", () => {
  it("produces counts and issues for empty workspace", () => {
    const summary = buildDashboardSummary({
      packTemplates: [],
      pageTemplates: [],
      entities: [],
      assets: [],
      jobs: [],
      blobCount: 0,
      presetCount: 0,
      analysisCount: 0,
      aiConfigured: false,
      packDrafts: [],
    });

    expect(summary.entities).toBe(0);
    expect(summary.issues.map((issue) => issue.label)).toContain("Chưa có dữ liệu");
    expect(summary.issues.map((issue) => issue.label)).toContain("AI chưa cấu hình");
  });

  it("detects image and template coverage", () => {
    const summary = buildDashboardSummary({
      packTemplates: [{ packTemplateId: "pk1", name: "Pack", orderedPages: [], requiredPages: [], optionalPages: [], updatedAt: 0, createdAt: 0 }],
      pageTemplates: [basePageTemplate],
      entities: [baseEntity],
      assets: [baseAsset],
      jobs: [
        {
          jobId: "j1",
          packTemplateId: "pk1",
          packTemplateName: "Pack",
          createdAt: 1,
          pages: [{ pageIndex: 0, pageFile: "p.png", pageTemplateId: "p1", state: "accepted", selected: true, healthScore: 100, warnings: ["warn"], items: [], renderedAt: 1 }],
          status: "exported",
        },
      ],
      blobCount: 1,
      presetCount: 2,
      analysisCount: 3,
      aiConfigured: true,
      packDrafts: [],
    });

    expect(summary.packTemplates).toBe(1);
    expect(summary.pageTemplates).toBe(1);
    expect(summary.assets).toBe(1);
    expect(summary.aiConfigured).toBe(true);
    expect(summary.latestJobWarnings).toBe(1);
    expect(summary.renderedPages).toBe(1);
    expect(summary.exportedJobs).toBe(1);
    expect(summary.totalSlots).toBe(1);
    expect(summary.mappedSlots).toBe(1);
    expect(summary.issues.some((issue) => issue.label === "Chưa có dữ liệu")).toBe(false);
  });
});
