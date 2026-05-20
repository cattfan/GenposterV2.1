# Dead Code Cleanup — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xóa ~5,800 LOC dead code + 15 shadcn primitives không dùng, không đổi behavior runtime.

**Architecture:** 6 cluster độc lập, mỗi cluster = pre-check `rg` → delete files/symbols → verify → commit. Model types (`AnalyzedPack`) giữ lại vì DB schema.

**Tech Stack:** TypeScript, React 19, Vitest, Vite, shadcn-ui.

---

## Task 1: Cluster 1 — Engines orphan

**Files:**
- Delete: `src/engines/analysis/reversePackAnalyzer.ts`
- Delete: `src/engines/reports/reports.ts`
- Delete: `src/engines/captions/generator.ts`

- [ ] **Step 1: Pre-check**

```bash
rg "reversePackAnalyzer|runReversePackAnalysis|buildAnalysisSummaryText|buildRenderManifest|buildPartnersSummaryTxt|generateCaptions" src
```

Expected: chỉ match trong 3 file sẽ xóa.

- [ ] **Step 2: Delete 3 files**

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm test -- --run && npm run lint && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove unused engine modules (reversePackAnalyzer, reports, captions generator)"
```

---

## Task 2: Cluster 2 — Editor orphan

**Files:**
- Delete 12 files under `src/features/editor/` (see spec)

- [ ] **Step 1: Pre-check each file**

```bash
rg "EditorCanvas|TemplatesGallery|StockPhotosPanel|BackgroundRemover|HistoryPanel|CardRepeaterPanel|FontPicker|magicResize|animationPresets|layerOps|useClipboard|useHistory" src --glob "!src/features/editor/{deleted files}"
```

Expected: zero imports from live code (comments OK).

- [ ] **Step 2: Delete 12 files**

- [ ] **Step 3: Verify + smoke**

```bash
npm run typecheck && npm test -- --run && npm run lint && npm run build
```

Manual: `/templates`, `/templates/$id/edit` load without error.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove orphaned editor panels and modules superseded by DesignWorkspace"
```

---

## Task 3: Cluster 3 — Generate orphan

**Files:**
- Delete: `src/features/generate/MappingOverview.tsx`
- Delete: `src/features/generate/mappingOverview.utils.ts`
- Delete: `src/features/generate/MappingOverview.test.ts`

- [ ] **Step 1: Pre-check**

```bash
rg "MappingOverview|buildMappingOverview|resolveSlotEntityFieldPath" src
```

- [ ] **Step 2: Delete 3 files**

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm test -- --run && npm run lint && npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove unused MappingOverview component and utils"
```

---

## Task 4: Cluster 4 — sampleDataCleanup

**Files:**
- Delete: `src/storage/sampleDataCleanup.ts`

- [ ] **Step 1: Pre-check**

```bash
rg "cleanupDemoData|DEMO_CLEANUP_ENABLED|sampleDataCleanup" src
```

- [ ] **Step 2: Delete file**

- [ ] **Step 3: Verify + commit**

```bash
npm run typecheck && npm test -- --run && npm run lint && npm run build
git commit -m "chore: remove unused sampleDataCleanup module"
```

---

## Task 5: Cluster 5 — Shadcn primitives

**Files:**
- Delete 15 files in `src/components/ui/` (see spec)

- [ ] **Step 1: Pre-check sidebar**

```bash
rg "from [\"']@/components/ui/sidebar" src
rg "SidebarProvider|useSidebar" src
```

Expected: zero app imports (AppShell uses custom sidebar).

- [ ] **Step 2: Pre-check each component**

```bash
rg 'from ["'\'']@/components/ui/(calendar|carousel|chart|menubar|drawer|pagination|hover-card|breadcrumb|aspect-ratio|form|radio-group|resizable|avatar|input-otp|navigation-menu)' src
```

- [ ] **Step 3: Delete 15 files**

- [ ] **Step 4: Verify + commit**

```bash
npm run typecheck && npm test -- --run && npm run lint && npm run build
git commit -m "chore: remove unused shadcn UI primitives"
```

---

## Task 6: Cluster 6 — Dead exports + console gate

**Files:**
- Modify: `src/engines/binding/dataBinding.ts` — remove `slotHasBinding`
- Modify: `src/engines/selection/entityBindAllocator.ts` — unexport batch types
- Modify: `src/features/generate/exportArtifacts.ts` — remove `variantCount`
- Modify: `src/features/generate/autoBindPlaceholders.ts` — remove `previewAutoBindForDrafts`
- Modify: `src/features/generate/autoBindPlaceholders.test.ts` — remove tests for deleted export
- Delete: `src/components/ux/InspectorSection.tsx`, `NumberField.tsx`, `CollapsiblePanel.tsx`, `StepIndicator.tsx`
- Modify: `src/components/ux/index.ts` — remove barrel exports
- Modify: `src/features/generate/PackTabContent.tsx` — gate console.debug
- Modify: `src/features/editor/DesignWorkspace.tsx` — gate console.debug

- [ ] **Step 1: Remove dead exports and UX files**

- [ ] **Step 2: Gate console.debug**

```ts
if (import.meta.env.DEV) {
  console.debug(...);
}
```

- [ ] **Step 3: Verify + commit**

```bash
npm run typecheck && npm test -- --run && npm run lint && npm run build
git commit -m "chore: remove dead exports, orphan UX components, gate dev console.debug"
```

---

## Task 7: Code review

- [ ] Dispatch code-reviewer subagent on full Phase 1 diff
- [ ] Fix any blockers found
- [ ] Final verify pass
