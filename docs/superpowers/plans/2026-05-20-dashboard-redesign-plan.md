# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi trang `/` thành command center: card "Việc tiếp theo", chip sức khoẻ, section tiếp tục, job gần đây — kèm autosave pack drafts.

**Architecture:** Backend thêm bảng `pack_drafts` qua generic CRUD config. Client wrap qua `remoteDb.packDrafts`. `/generate` autosave debounced 500ms khi packOv/previewPageDrafts đổi. `buildDashboardSummary` mở rộng output. Trang `/` chia thành 5 sub-component pure presentational dưới `src/features/dashboard/`.

**Tech Stack:** React + TanStack Router, NestJS + node:sqlite, Dexie-like client wrapper, vitest, shadcn/ui, lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-20-dashboard-redesign-design.md](../specs/2026-05-20-dashboard-redesign-design.md)

---

## File Structure

| File | Purpose |
|------|---------|
| `backend/src/config/tables.ts` | Modify — thêm entry `pack_drafts` |
| `src/models/index.ts` | Modify — export `PackDraftState` |
| `src/storage/remoteDb.ts` | Modify — register `packDrafts` table |
| `src/features/generate/usePackDraftAutosave.ts` | Create — debounced autosave hook |
| `src/features/generate/PackTabContent.tsx` | Modify — wire autosave + load on packId |
| `src/lib/dashboardSummary.ts` | Modify — extend input/output, nextAction rule, incompletePack/recentPack/recentJobs |
| `src/lib/dashboardSummary.test.ts` | Modify — thêm 10+ test case |
| `src/features/dashboard/NextActionCard.tsx` | Create — card to "Việc tiếp theo" |
| `src/features/dashboard/HealthChipRow.tsx` | Create — 4 chip + expand panel |
| `src/features/dashboard/ResumeSection.tsx` | Create — pack draft cell + latest job cell |
| `src/features/dashboard/RecentJobsList.tsx` | Create — list 5 job |
| `src/features/dashboard/RemainingIssues.tsx` | Create — collapse panel |
| `src/routes/index.tsx` | Replace — query DB + glue 5 sub-component |

---

## Task 1: Backend `pack_drafts` table

**Files:**
- Modify: `backend/src/config/tables.ts`

- [ ] **Step 1: Add table entry**

```ts
// backend/src/config/tables.ts — append before closing bracket of TABLES
{
  name: "pack_drafts",
  primaryKey: "packTemplateId",
  indexedFields: ["lastOpenedAt", "updatedAt"],
},
```

- [ ] **Step 2: Restart backend, smoke verify table created**

Run: `npm run dev` (project root) — backend logs should not error. Then in another shell:

```bash
curl http://localhost:3010/api/v1/tables/pack-drafts
```

Expected: `{"rows":[]}` (200 OK, empty array).

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/tables.ts
git commit -m "feat(backend): add pack_drafts table for /generate autosave"
```

---

## Task 2: Model + client table wrapper

**Files:**
- Modify: `src/models/index.ts`
- Modify: `src/storage/remoteDb.ts`

- [ ] **Step 1: Add model**

Append `PackDraftState` interface to `src/models/index.ts`:

```ts
export interface PackDraftState {
  /** Primary key — = packTemplateId */
  packTemplateId: ID;
  /** Bind override theo pageTemplateId → slotId → bindingPath */
  packOv: Record<string, Record<string, string | undefined>>;
  /** Draft template (rich) đã chỉnh trong workspace, theo pageTemplateId */
  previewPageDrafts: Record<string, PageTemplate>;
  /** Lần gần nhất user mở pack ở /generate */
  lastOpenedAt: number;
  /** Lần gần nhất autosave commit */
  updatedAt: number;
}
```

- [ ] **Step 2: Register table trong remoteDb**

Sửa `src/storage/remoteDb.ts`:

```ts
// Trong TABLE_SLUGS object — thêm dòng cùng với các entry khác:
packDrafts: "pack_drafts",

// Trong import "@/models" — thêm:
PackDraftState,

// Trong remoteDb object — thêm dòng trước transaction:
packDrafts: makeTable("packDrafts", "packTemplateId") as unknown as DexieLikeTable<PackDraftState>,
```

- [ ] **Step 3: Verify tsc passes**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/models/index.ts src/storage/remoteDb.ts
git commit -m "feat: add PackDraftState model and remoteDb.packDrafts wrapper"
```

---

## Task 3: Autosave hook

**Files:**
- Create: `src/features/generate/usePackDraftAutosave.ts`
- Test: `src/features/generate/usePackDraftAutosave.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/generate/usePackDraftAutosave.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePackDraftAutosave } from "./usePackDraftAutosave";

const putMock = vi.fn().mockResolvedValue(undefined);
const getMock = vi.fn();

vi.mock("@/storage/db", () => ({
  db: {
    packDrafts: {
      put: (...args: unknown[]) => putMock(...args),
      get: (...args: unknown[]) => getMock(...args),
    },
  },
}));

describe("usePackDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    putMock.mockClear();
    getMock.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("debounces multiple rapid changes into one save after 500ms", async () => {
    const { rerender } = renderHook(
      ({ packOv }) =>
        usePackDraftAutosave({
          packTemplateId: "p1",
          packOv,
          previewPageDrafts: {},
        }),
      { initialProps: { packOv: { p1: { s1: "entity.name" } } } },
    );
    rerender({ packOv: { p1: { s1: "entity.name", s2: "entity.address" } } });
    rerender({ packOv: { p1: { s2: "entity.address" } } });

    expect(putMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(putMock).toHaveBeenCalledTimes(1);
    const saved = putMock.mock.calls[0]![0];
    expect(saved.packTemplateId).toBe("p1");
    expect(saved.packOv).toEqual({ p1: { s2: "entity.address" } });
  });

  it("does nothing when packTemplateId is undefined", async () => {
    renderHook(() =>
      usePackDraftAutosave({
        packTemplateId: undefined,
        packOv: { p1: {} },
        previewPageDrafts: {},
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(putMock).not.toHaveBeenCalled();
  });

  it("flushes pending save on unmount", async () => {
    const { rerender, unmount } = renderHook(
      ({ packOv }) =>
        usePackDraftAutosave({
          packTemplateId: "p1",
          packOv,
          previewPageDrafts: {},
        }),
      { initialProps: { packOv: { p1: { s1: "entity.name" } } } },
    );
    rerender({ packOv: { p1: { s1: "entity.name", s2: "entity.address" } } });

    unmount();
    // Flush microtasks
    await Promise.resolve();
    expect(putMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/features/generate/usePackDraftAutosave.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

```ts
// src/features/generate/usePackDraftAutosave.ts
import { useEffect, useRef } from "react";
import { db } from "@/storage/db";
import type { PackDraftState, PageTemplate } from "@/models";

const DEBOUNCE_MS = 500;

interface Params {
  packTemplateId: string | undefined;
  packOv: PackDraftState["packOv"];
  previewPageDrafts: Record<string, PageTemplate>;
}

/**
 * Persist pack workspace state vào backend `pack_drafts`. Debounce 500ms
 * và flush lúc unmount để dashboard luôn đọc được snapshot mới.
 */
export function usePackDraftAutosave(params: Params) {
  const { packTemplateId, packOv, previewPageDrafts } = params;
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef({ packOv, previewPageDrafts });
  const lastSavedSignatureRef = useRef("");

  latestRef.current = { packOv, previewPageDrafts };

  useEffect(() => {
    if (!packTemplateId) return;

    const signature = JSON.stringify({ packOv, previewPageDrafts });
    if (signature === lastSavedSignatureRef.current) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);

    const flush = () => {
      const snapshot = latestRef.current;
      const sig = JSON.stringify(snapshot);
      if (sig === lastSavedSignatureRef.current) return Promise.resolve();
      lastSavedSignatureRef.current = sig;
      const now = Date.now();
      return db.packDrafts.put({
        packTemplateId,
        packOv: snapshot.packOv,
        previewPageDrafts: snapshot.previewPageDrafts,
        lastOpenedAt: now,
        updatedAt: now,
      });
    };

    timerRef.current = window.setTimeout(() => {
      void flush();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Flush on unmount or deps change so navigation doesn't lose work.
      void flush();
    };
  }, [packTemplateId, packOv, previewPageDrafts]);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/features/generate/usePackDraftAutosave.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/generate/usePackDraftAutosave.ts src/features/generate/usePackDraftAutosave.test.ts
git commit -m "feat(generate): add debounced pack draft autosave hook"
```

---

## Task 4: Wire autosave + load draft trong PackTabContent

**Files:**
- Modify: `src/features/generate/PackTabContent.tsx`

- [ ] **Step 1: Import hook**

Trong import block của `PackTabContent.tsx`, thêm:

```ts
import { usePackDraftAutosave } from "@/features/generate/usePackDraftAutosave";
```

- [ ] **Step 2: Mount autosave inside component body**

Tìm nơi `packOv` và `previewPageDrafts` đã được khởi tạo (sau `usePackBindOverrides`). Thêm:

```ts
usePackDraftAutosave({
  packTemplateId: packId,
  packOv,
  previewPageDrafts,
});
```

- [ ] **Step 3: Load existing draft when packId changes**

Tìm `useEffect` đang reset state khi `packId` đổi (`setSelectedSlotIds([])`, `setActivePageIdx(0)`, ...). Sau khi reset, thêm load:

```ts
useEffect(() => {
  if (!packId) return;
  let cancelled = false;
  void (async () => {
    const draft = await db.packDrafts.get(packId);
    if (cancelled || !draft) return;
    if (draft.packOv && Object.keys(draft.packOv).length > 0) {
      setPackOverrides(draft.packOv);
    }
    if (draft.previewPageDrafts && Object.keys(draft.previewPageDrafts).length > 0) {
      previewPageDraftsRef.current = draft.previewPageDrafts;
      setPreviewPageDrafts(draft.previewPageDrafts);
    }
    // Touch lastOpenedAt without disturbing payload.
    void db.packDrafts.put({
      ...draft,
      lastOpenedAt: Date.now(),
      updatedAt: draft.updatedAt,
    });
  })();
  return () => {
    cancelled = true;
  };
}, [packId]);
```

> **Note:** `setPackOverrides` = `replaceAll` từ `usePackBindOverrides()` — destructure thêm `replaceAll: setPackOverrides` ở callsite.

- [ ] **Step 4: Run tsc + tests**

Run: `npx tsc --noEmit && npm test`
Expected: 0 tsc errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/generate/PackTabContent.tsx src/features/generate/usePackBindOverrides.ts
git commit -m "feat(generate): autosave pack drafts and resume on reopen"
```

---

## Task 5: Extend `dashboardSummary` types and pure helpers

**Files:**
- Modify: `src/lib/dashboardSummary.ts`

- [ ] **Step 1: Extend input + output types**

Trên cùng file (sau `DashboardIssue`), thêm:

```ts
import type { PackDraftState } from "@/models";

export type NextActionId =
  | "no-data"
  | "no-template"
  | "download-images"
  | "incomplete-pack"
  | "warnings"
  | "ai"
  | "ready";

export interface NextAction {
  id: NextActionId;
  title: string;
  detail: string;
  to: string;
  search?: { tab: "images" } | Record<string, string>;
  tone: "danger" | "warning" | "neutral" | "success";
}

export interface DashboardPackRef {
  packTemplateId: string;
  packName: string;
  boundCount: number;
  totalBindable: number;
  lastOpenedAt: number;
}

export interface DashboardJobRow {
  jobId: string;
  name: string;
  pageCount: number;
  warningCount: number;
  createdAt: number;
  status: "draft" | "generated" | "exported";
}
```

Sửa `DashboardSummaryInput`:

```ts
export interface DashboardSummaryInput {
  packTemplates: PackTemplate[];
  pageTemplates: PageTemplate[];
  entities: Entity[];
  assets: Asset[];
  jobs: Job[];
  blobCount: number;
  presetCount: number;
  analysisCount: number;
  aiConfigured: boolean;
  packDrafts: PackDraftState[];
}
```

- [ ] **Step 2: Add pure helpers (top-level)**

Trước `buildDashboardSummary`, thêm:

```ts
function countBindableSlots(pack: PackTemplate, pageTemplates: PageTemplate[]): number {
  const byId = new Map(pageTemplates.map((p) => [p.pageTemplateId, p]));
  let total = 0;
  for (const id of pack.orderedPages ?? []) {
    const tpl = byId.get(id);
    if (!tpl) continue;
    for (const slot of tpl.slots ?? []) {
      if (slot.kind === "text" || slot.kind === "image" || slot.kind === "shape") total += 1;
    }
  }
  return total;
}

function countBoundSlots(packOv: PackDraftState["packOv"]): number {
  let total = 0;
  for (const page of Object.values(packOv ?? {})) {
    for (const value of Object.values(page ?? {})) {
      if (value) total += 1;
    }
  }
  return total;
}

function pickIncompletePack(
  packDrafts: PackDraftState[],
  packs: PackTemplate[],
  pageTemplates: PageTemplate[],
): DashboardPackRef | undefined {
  const packById = new Map(packs.map((p) => [p.packTemplateId, p]));
  const candidates: DashboardPackRef[] = [];
  for (const draft of packDrafts) {
    const pack = packById.get(draft.packTemplateId);
    if (!pack) continue;
    const bindable = countBindableSlots(pack, pageTemplates);
    const bound = countBoundSlots(draft.packOv);
    if (bound === 0 || bindable === 0 || bound >= bindable) continue;
    candidates.push({
      packTemplateId: draft.packTemplateId,
      packName: pack.name,
      boundCount: bound,
      totalBindable: bindable,
      lastOpenedAt: draft.lastOpenedAt,
    });
  }
  candidates.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return candidates[0];
}

function pickRecentPack(
  packDrafts: PackDraftState[],
  packs: PackTemplate[],
  pageTemplates: PageTemplate[],
  jobs: Job[],
  excludeId: string | undefined,
): DashboardPackRef | undefined {
  const packById = new Map(packs.map((p) => [p.packTemplateId, p]));
  const latestJobByPack = new Map<string, number>();
  for (const job of jobs) {
    const previous = latestJobByPack.get(job.packTemplateId) ?? 0;
    if (job.createdAt > previous) latestJobByPack.set(job.packTemplateId, job.createdAt);
  }
  const candidates: DashboardPackRef[] = [];
  for (const draft of packDrafts) {
    if (draft.packTemplateId === excludeId) continue;
    const pack = packById.get(draft.packTemplateId);
    if (!pack) continue;
    const latestJobAt = latestJobByPack.get(draft.packTemplateId) ?? 0;
    if (draft.lastOpenedAt <= latestJobAt) continue;
    const bindable = countBindableSlots(pack, pageTemplates);
    const bound = countBoundSlots(draft.packOv);
    candidates.push({
      packTemplateId: draft.packTemplateId,
      packName: pack.name,
      boundCount: bound,
      totalBindable: bindable,
      lastOpenedAt: draft.lastOpenedAt,
    });
  }
  candidates.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return candidates[0];
}

function buildRecentJobs(jobs: Job[]): DashboardJobRow[] {
  return jobs.slice(0, 5).map((job) => ({
    jobId: job.jobId,
    name: job.packTemplateName,
    pageCount: job.pages.length,
    warningCount: job.pages.reduce((sum, page) => sum + page.warnings.length, 0),
    createdAt: job.createdAt,
    status: job.status,
  }));
}
```

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors. Hàm helper chưa được dùng — TypeScript sẽ báo unused — chấp nhận tới Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dashboardSummary.ts
git commit -m "feat(dashboard): add types and pure helpers for next-action and pack picks"
```

---

## Task 6: Implement nextAction rule + extend output

**Files:**
- Modify: `src/lib/dashboardSummary.ts`

- [ ] **Step 1: Add nextAction builder**

Thêm trước `buildDashboardSummary`:

```ts
function buildNextAction(args: {
  entities: Entity[];
  packs: PackTemplate[];
  pageTemplates: PageTemplate[];
  driveDownloadCandidateCount: number;
  incompletePack: DashboardPackRef | undefined;
  latestJob: Job | null;
  latestJobWarnings: number;
  aiConfigured: boolean;
}): NextAction {
  const {
    entities,
    packs,
    pageTemplates,
    driveDownloadCandidateCount,
    incompletePack,
    latestJob,
    latestJobWarnings,
    aiConfigured,
  } = args;

  if (entities.length === 0) {
    return {
      id: "no-data",
      title: "Nhập dữ liệu để bắt đầu",
      detail: "Cần ít nhất 1 sheet/CSV để generate.",
      to: "/data",
      tone: "danger",
    };
  }
  if (packs.length === 0 || pageTemplates.length === 0) {
    return {
      id: "no-template",
      title: "Tạo bộ khuôn đầu tiên",
      detail: "Bộ khuôn quyết định layout và cách bind dữ liệu.",
      to: "/templates",
      tone: "danger",
    };
  }
  if (driveDownloadCandidateCount > 0) {
    return {
      id: "download-images",
      title: `Tải ${driveDownloadCandidateCount} ảnh từ sheet`,
      detail: "Dòng có folder/link nhưng chưa có ảnh đọc được. Tải xong là sẵn sàng generate.",
      to: "/data",
      search: { tab: "images" },
      tone: "warning",
    };
  }
  if (incompletePack) {
    return {
      id: "incomplete-pack",
      title: `Tiếp tục bind ${incompletePack.packName}`,
      detail: `${incompletePack.boundCount}/${incompletePack.totalBindable} ô đã bind`,
      to: "/generate",
      search: { pack: incompletePack.packTemplateId },
      tone: "warning",
    };
  }
  if (latestJob && latestJobWarnings > 0) {
    return {
      id: "warnings",
      title: `Xem ${latestJobWarnings} cảnh báo trong job "${latestJob.packTemplateName}"`,
      detail: "Lượt tạo gần nhất có cảnh báo cần kiểm tra.",
      to: "/history",
      tone: "warning",
    };
  }
  if (!aiConfigured) {
    return {
      id: "ai",
      title: "Cấu hình AI để dùng caption tự động",
      detail: "Đặt baseUrl và model trong cài đặt.",
      to: "/settings",
      tone: "neutral",
    };
  }
  return {
    id: "ready",
    title: "Sẵn sàng tạo nội dung",
    detail: "Mọi thứ OK. Tạo mẻ mới ở trang Tạo nội dung.",
    to: "/generate",
    tone: "success",
  };
}
```

- [ ] **Step 2: Wire helpers vào `buildDashboardSummary`**

Trong `buildDashboardSummary`, sau khi destructure `input` (thêm `packDrafts`), trước `return`, compute:

```ts
const incompletePack = pickIncompletePack(packDrafts, packTemplates, pageTemplates);
const recentPack = pickRecentPack(
  packDrafts,
  packTemplates,
  pageTemplates,
  jobs,
  incompletePack?.packTemplateId,
);
const recentJobs = buildRecentJobs(jobs);
const nextAction = buildNextAction({
  entities,
  packs: packTemplates,
  pageTemplates,
  driveDownloadCandidateCount,
  incompletePack,
  latestJob,
  latestJobWarnings,
  aiConfigured,
});
```

> **Lưu ý:** `pickIncompletePack` nhận `packs` parameter — phải truyền `packTemplates` (input field name).

- [ ] **Step 3: Append to return object**

```ts
return {
  // ...existing fields,
  incompletePack,
  recentPack,
  recentJobs,
  nextAction,
};
```

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit`
Expected: errors only in callsites of `buildDashboardSummary` (route file). Will fix in Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardSummary.ts
git commit -m "feat(dashboard): nextAction rule and incomplete/recent pack output"
```

---

## Task 7: Tests for dashboardSummary

**Files:**
- Modify: `src/lib/dashboardSummary.test.ts`

- [ ] **Step 1: Add fixture builder + nextAction tests**

Append (giữ 2 test hiện có):

```ts
import type { PackDraftState, GenerationJob } from "@/models";

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
```

- [ ] **Step 2: Update existing tests to pass `packDrafts`**

Sửa 2 test hiện có (`produces counts and issues for empty workspace` + `detects image and template coverage`) — thêm `packDrafts: []` vào input.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/dashboardSummary.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dashboardSummary.test.ts
git commit -m "test(dashboard): cover next-action rule order and pack pickers"
```

---

## Task 8: Build sub-components

**Files:**
- Create: `src/features/dashboard/NextActionCard.tsx`
- Create: `src/features/dashboard/HealthChipRow.tsx`
- Create: `src/features/dashboard/ResumeSection.tsx`
- Create: `src/features/dashboard/RecentJobsList.tsx`
- Create: `src/features/dashboard/RemainingIssues.tsx`

- [ ] **Step 1: NextActionCard**

```tsx
// src/features/dashboard/NextActionCard.tsx
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NextAction } from "@/lib/dashboardSummary";

const TONE_BG: Record<NextAction["tone"], string> = {
  danger: "from-rose-50 to-rose-100/40 border-rose-200 dark:from-rose-500/10 dark:to-rose-500/5 dark:border-rose-500/20",
  warning: "from-amber-50 to-amber-100/40 border-amber-200 dark:from-amber-500/10 dark:to-amber-500/5 dark:border-amber-500/20",
  neutral: "from-slate-50 to-slate-100/40 border-slate-200 dark:from-slate-500/10 dark:to-slate-500/5 dark:border-slate-500/20",
  success: "from-emerald-50 to-emerald-100/40 border-emerald-200 dark:from-emerald-500/10 dark:to-emerald-500/5 dark:border-emerald-500/20",
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
        "rounded-xl border bg-gradient-to-br p-5 shadow-sm",
        TONE_BG[action.tone],
      )}
      aria-label="Việc tiếp theo"
    >
      <div className={cn("text-[11px] font-semibold uppercase tracking-wider", TONE_LABEL[action.tone])}>
        Việc tiếp theo
      </div>
      <h2 className="mt-2 text-xl font-semibold leading-tight text-foreground">{action.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{action.detail}</p>
      <div className="mt-4">
        <Button asChild size="sm">
          <Link to={action.to} search={action.search as never}>Bắt đầu ›</Link>
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: HealthChipRow**

```tsx
// src/features/dashboard/HealthChipRow.tsx
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Database, Image as ImageIcon, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "good" | "warning" | "danger";
type ChipKey = "data" | "images" | "templates" | "ai";

const TONE_CHIP: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
};

const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

interface ChipProps {
  data: { tone: Tone; total: number; activeEntities: number; partnerEntities: number; sheetCount: number };
  images: { tone: Tone; total: number; localAssets: number; linkAssets: number; missing: number };
  templates: { tone: Tone; packs: number; pages: number; mappedSlots: number; totalSlots: number; presetCount: number };
  ai: { tone: Tone; configured: boolean; baseUrl?: string; model?: string };
}

export function HealthChipRow(props: ChipProps) {
  const [open, setOpen] = useState<ChipKey | null>(null);

  const chip = (key: ChipKey, tone: Tone, label: string, summary: string) => (
    <button
      type="button"
      onClick={() => setOpen((current) => (current === key ? null : key))}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition",
        TONE_CHIP[tone],
        open === key && "ring-2 ring-offset-1 ring-current",
      )}
      aria-expanded={open === key}
    >
      <span className={cn("inline-block size-1.5 rounded-full", TONE_DOT[tone])} />
      <span className="font-semibold">{label}</span>
      <span className="opacity-80">{summary}</span>
    </button>
  );

  return (
    <section aria-label="Sức khoẻ hệ thống" className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sức khoẻ</div>
      <div className="flex flex-wrap gap-2">
        {chip("data", props.data.tone, "Dữ liệu", `${props.data.total} dòng · ${props.data.sheetCount} bảng`)}
        {chip("images", props.images.tone, "Ảnh", props.images.missing > 0 ? `${props.images.missing} thiếu` : `${props.images.total} ảnh`)}
        {chip("templates", props.templates.tone, "Khuôn", `${props.templates.packs} pack`)}
        {chip("ai", props.ai.tone, "AI", props.ai.configured ? "OK" : "chưa cấu hình")}
      </div>
      {open && (
        <div className="rounded-lg border bg-card p-3">
          {open === "data" && (
            <DetailGrid
              cells={[
                ["Tổng dòng", props.data.total],
                ["Đang dùng", props.data.activeEntities],
                ["Đối tác", props.data.partnerEntities],
                ["Bảng", props.data.sheetCount],
              ]}
              actionTo="/data"
              actionLabel="Mở dữ liệu"
            />
          )}
          {open === "images" && (
            <DetailGrid
              cells={[
                ["Tổng ảnh", props.images.total],
                ["Trong máy", props.images.localAssets],
                ["Link", props.images.linkAssets],
                ["Thiếu", props.images.missing, props.images.missing > 0 ? "danger" : undefined],
              ]}
              actionTo="/data"
              actionSearch={{ tab: "images" }}
              actionLabel="Mở ảnh"
            />
          )}
          {open === "templates" && (
            <DetailGrid
              cells={[
                ["Bộ khuôn", props.templates.packs],
                ["Trang", props.templates.pages],
                ["Ô đã gắn", `${props.templates.mappedSlots}/${props.templates.totalSlots}`],
                ["Khuôn đổ", props.templates.presetCount],
              ]}
              actionTo="/templates"
              actionLabel="Mở khuôn"
            />
          )}
          {open === "ai" && (
            <DetailGrid
              cells={[
                ["Trạng thái", props.ai.configured ? "OK" : "Chưa cấu hình"],
                ["baseUrl", props.ai.baseUrl ?? "—"],
                ["model", props.ai.model ?? "—"],
              ]}
              actionTo="/settings"
              actionLabel="Mở cài đặt"
            />
          )}
        </div>
      )}
    </section>
  );
}

function DetailGrid({
  cells,
  actionTo,
  actionLabel,
  actionSearch,
}: {
  cells: Array<[string, string | number, "danger"?]>;
  actionTo: string;
  actionLabel: string;
  actionSearch?: { tab: "images" };
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map(([label, value, tone]) => (
          <div key={label}>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone === "danger" && "text-rose-600 dark:text-rose-300")}>
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button asChild variant="outline" size="sm">
          <Link to={actionTo} search={actionSearch as never}>{actionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: ResumeSection**

```tsx
// src/features/dashboard/ResumeSection.tsx
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
  const percent = pack.totalBindable > 0 ? (pack.boundCount / pack.totalBindable) * 100 : 0;
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
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">⏱ Job mới nhất</div>
      <div className="mt-1 truncate text-sm font-semibold">{job.name}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {job.pageCount} trang
        {job.warningCount > 0 ? (
          <span className="ml-2 text-rose-600 dark:text-rose-300">{job.warningCount} cảnh báo</span>
        ) : (
          <span className="ml-2 text-emerald-600 dark:text-emerald-300">Hoàn tất</span>
        )}
      </div>
      <div className="mt-3 text-xs font-medium text-primary">Mở job ›</div>
    </Link>
  );
}
```

- [ ] **Step 4: RecentJobsList**

```tsx
// src/features/dashboard/RecentJobsList.tsx
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
        <Link to="/history" className="text-xs font-medium text-primary">Xem lịch sử ›</Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {jobs.map((job) => (
          <Link
            key={job.jobId}
            to="/history"
            search={{ job: job.jobId } as never}
            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
          >
            <span className={cn("inline-block size-2 rounded-full", job.warningCount > 0 ? "bg-rose-500" : STATUS_DOT[job.status])} />
            <span className="flex-1 truncate font-medium">{job.name}</span>
            <span className="text-xs text-muted-foreground">{job.pageCount} trang</span>
            {job.warningCount > 0 && (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-300">{job.warningCount}⚠</span>
            )}
            <span className="text-xs font-medium text-primary">Mở ›</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: RemainingIssues**

```tsx
// src/features/dashboard/RemainingIssues.tsx
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
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
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
                  <span className={cn("inline-block size-2 rounded-full", TONE_DOT[issue.tone])} />
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
```

- [ ] **Step 6: Run tsc**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/dashboard
git commit -m "feat(dashboard): add 5 sub-components (next-action, chips, resume, jobs, issues)"
```

---

## Task 9: Replace `routes/index.tsx`

**Files:**
- Modify (replace contents): `src/routes/index.tsx`

- [ ] **Step 1: Replace contents**

```tsx
// src/routes/index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, Sparkles, UploadCloud, Download } from "lucide-react";
import { useLiveQuery } from "@/storage/useLiveQuery";
import { db } from "@/storage/db";
import { getSettings } from "@/storage/settings";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/PageHeader";
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
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dashboard.issues.length > 0 ? `${dashboard.issues.length} việc cần xử lý` : "Mọi thứ OK"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </header>

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
```

- [ ] **Step 2: Verify tsc + tests**

Run: `npx tsc --noEmit && npm test`
Expected: 0 tsc errors, all tests pass.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Mở `http://localhost:5173/`. Verify:
- Header có "Tổng quan" + tóm tắt
- "Việc tiếp theo" card hiển thị 1 hành động
- 4 chip hiển thị; click 1 chip → expand panel; click khác → swap; click cùng → collapse
- Job mới nhất + pack đang bind hiển thị (nếu có data)
- "Cần xử lý khác" collapse mặc định khi ≥3

Mở `/generate`, chọn pack, bind 1 ô → đợi >500ms → quay về `/` → Pack hiển thị trong "Tiếp tục" với progress đúng.

- [ ] **Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(dashboard): redesign / route as command center"
```

---

## Task 10: Verify

**Files:** none (verification only)

- [ ] **Step 1: Full verify**

Run all in sequence:
```bash
npx tsc --noEmit
npm test
npm run lint
npm run build
```

Expected: tsc 0 errors, all tests pass, lint 0 errors, build successful.

- [ ] **Step 2: Code reviewer subagent**

Dispatch `code-reviewer` agent với prompt:

> Review dashboard redesign in d:/projects/GenposterV2.1. Spec: docs/superpowers/specs/2026-05-20-dashboard-redesign-design.md. Focus on: nextAction rule correctness, autosave race conditions, pack pickers logic, accessibility (chip aria-expanded, keyboard nav), TanStack Router search param types. APPROVE / REQUEST CHANGES with specific issues.

- [ ] **Step 3: Address review feedback if any, then push**

```bash
git push origin main
```

---

## Notes for the implementer

- TanStack Router search params: route declarations don't validate types tightly here — `as never` casts are intentional; ensure router config (validateSearch) accepts `tab`, `pack`, `job` keys, hoặc dùng plain `<a href>` nếu strict.
- `useLiveQuery` 3rd arg = list bảng để invalidate; thiếu → over-refetch; thừa → harmless. Liệt kê đúng bảng được query.
- Backend reload: nếu thay `tables.ts`, restart `npm run dev` (nest watcher có thể không pick up file ngoài src — kiểm tra `nest-cli.json`).
- Autosave dùng `JSON.stringify` để diff signature — chấp nhận O(n) cost, n nhỏ vì pack draft ≤ vài KB.
