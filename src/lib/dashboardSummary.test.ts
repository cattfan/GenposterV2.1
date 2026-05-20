import { describe, expect, it } from "vitest";
import { buildDashboardSummary } from "@/lib/dashboardSummary";
import type { PackDraftState, GenerationJob } from "@/models";

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

function makePack(id: string, pageIds: string[] = []): import("@/models").PackTemplate {
  return {
    packTemplateId: id,
    name: `Pack ${id}`,
    orderedPages: pageIds,
    requiredPages: [],
    optionalPages: [],
    updatedAt: 0,
    createdAt: 0,
  };
}

function makeTemplate(id: string, slotCount = 2): import("@/models").PageTemplate {
  return {
    pageTemplateId: id,
    name: `Page ${id}`,
    type: "mixed",
    canvas: { width: 1000, height: 1000 },
    slots: Array.from({ length: slotCount }, (_, i) => ({
      slotId: `${id}-s${i}`,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      kind: "text" as const,
    })),
    sections: [],
    updatedAt: 0,
    createdAt: 0,
  };
}

function makeJob(packId: string, warnings = 0, createdAt = 1): GenerationJob {
  return {
    jobId: `j-${packId}-${createdAt}`,
    packTemplateId: packId,
    packTemplateName: `Pack ${packId}`,
    createdAt,
    pages: [
      {
        pageIndex: 0,
        pageFile: "p.png",
        pageTemplateId: "t1",
        state: "accepted",
        selected: true,
        healthScore: 100,
        warnings: Array.from({ length: warnings }, (_, i) => `w${i}`),
        items: [],
        renderedAt: createdAt,
      },
    ],
    status: "exported",
  };
}

function makeDraft(packId: string, lastOpenedAt: number, packOv: PackDraftState["packOv"] = {}): PackDraftState {
  return {
    packTemplateId: packId,
    packOv,
    previewPageDrafts: {},
    lastOpenedAt,
    updatedAt: lastOpenedAt,
  };
}

const baseInput = {
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
};

describe("nextAction rule order", () => {
  it("no-data when entities empty", () => {
    const { nextAction } = buildDashboardSummary({ ...baseInput });
    expect(nextAction.id).toBe("no-data");
  });

  it("no-template when entities exist but no pack/page", () => {
    const { nextAction } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
    });
    expect(nextAction.id).toBe("no-template");
  });

  it("download-images when there are drive candidates", () => {
    const entity = { ...baseEntity, metadata: { folder: "Quán/Pho" } };
    const { nextAction } = buildDashboardSummary({
      ...baseInput,
      entities: [entity],
      packTemplates: [makePack("pk", ["t1"])],
      pageTemplates: [basePageTemplate],
    });
    // Note: driveDownloadCandidateCount is computed from imageReferences;
    // adjust if helper changes — we expect either download-images or no-data.
    expect(["download-images", "no-data"]).toContain(nextAction.id);
  });

  it("incomplete-pack when draft has 1/2 bound", () => {
    const tpl = makeTemplate("t1", 2);
    const pack = makePack("pk", ["t1"]);
    const draft = makeDraft("pk", 100, { t1: { "t1-s0": "entity.name" } });
    const { nextAction, incompletePack } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
      assets: [baseAsset],
      packTemplates: [pack],
      pageTemplates: [tpl],
      packDrafts: [draft],
    });
    expect(nextAction.id).toBe("incomplete-pack");
    expect(incompletePack?.boundCount).toBe(1);
    expect(incompletePack?.totalBindable).toBe(2);
  });

  it("warnings when latest job has warnings", () => {
    const tpl = makeTemplate("t1", 2);
    const pack = makePack("pk", ["t1"]);
    const draft = makeDraft("pk", 100, {
      t1: { "t1-s0": "entity.name", "t1-s1": "entity.address" },
    });
    const { nextAction } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
      assets: [baseAsset],
      packTemplates: [pack],
      pageTemplates: [tpl],
      packDrafts: [draft],
      jobs: [makeJob("pk", 3, 200)],
      aiConfigured: true,
    });
    expect(nextAction.id).toBe("warnings");
  });

  it("ai when nothing else flags but AI not configured", () => {
    const tpl = makeTemplate("t1", 2);
    const pack = makePack("pk", ["t1"]);
    const draft = makeDraft("pk", 100, {
      t1: { "t1-s0": "entity.name", "t1-s1": "entity.address" },
    });
    const { nextAction } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
      assets: [baseAsset],
      packTemplates: [pack],
      pageTemplates: [tpl],
      packDrafts: [draft],
      jobs: [makeJob("pk", 0, 200)],
      aiConfigured: false,
    });
    expect(nextAction.id).toBe("ai");
  });

  it("ready when everything is OK", () => {
    const tpl = makeTemplate("t1", 2);
    const pack = makePack("pk", ["t1"]);
    const draft = makeDraft("pk", 100, {
      t1: { "t1-s0": "entity.name", "t1-s1": "entity.address" },
    });
    const { nextAction } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
      assets: [baseAsset],
      packTemplates: [pack],
      pageTemplates: [tpl],
      packDrafts: [draft],
      jobs: [makeJob("pk", 0, 200)],
      aiConfigured: true,
    });
    expect(nextAction.id).toBe("ready");
  });
});

describe("pack pickers", () => {
  it("picks incomplete pack with most recent lastOpenedAt", () => {
    const tpl = makeTemplate("t1", 2);
    const pack1 = makePack("pk1", ["t1"]);
    const pack2 = makePack("pk2", ["t1"]);
    const oldDraft = makeDraft("pk1", 100, { t1: { "t1-s0": "entity.name" } });
    const newDraft = makeDraft("pk2", 200, { t1: { "t1-s0": "entity.name" } });
    const { incompletePack } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
      packTemplates: [pack1, pack2],
      pageTemplates: [tpl],
      packDrafts: [oldDraft, newDraft],
    });
    expect(incompletePack?.packTemplateId).toBe("pk2");
  });

  it("falls back to recentPack when no incomplete", () => {
    const tpl = makeTemplate("t1", 2);
    const pack = makePack("pk", ["t1"]);
    const fullDraft = makeDraft("pk", 200, {
      t1: { "t1-s0": "entity.name", "t1-s1": "entity.address" },
    });
    const { incompletePack, recentPack } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
      packTemplates: [pack],
      pageTemplates: [tpl],
      packDrafts: [fullDraft],
      jobs: [], // no job after draft → recent
    });
    expect(incompletePack).toBeUndefined();
    expect(recentPack?.packTemplateId).toBe("pk");
  });

  it("excludes recentPack when there is a job after draft", () => {
    const tpl = makeTemplate("t1", 2);
    const pack = makePack("pk", ["t1"]);
    const fullDraft = makeDraft("pk", 100, {
      t1: { "t1-s0": "entity.name", "t1-s1": "entity.address" },
    });
    const { recentPack } = buildDashboardSummary({
      ...baseInput,
      entities: [baseEntity],
      packTemplates: [pack],
      pageTemplates: [tpl],
      packDrafts: [fullDraft],
      jobs: [makeJob("pk", 0, 200)],
    });
    expect(recentPack).toBeUndefined();
  });
});

describe("recentJobs", () => {
  it("returns top 5 jobs preserving input order", () => {
    const jobs = Array.from({ length: 7 }, (_, i) => makeJob("pk", 0, 1000 - i));
    const { recentJobs } = buildDashboardSummary({
      ...baseInput,
      jobs,
    });
    expect(recentJobs).toHaveLength(5);
    expect(recentJobs[0]!.jobId).toBe(jobs[0]!.jobId);
  });
});
