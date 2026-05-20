# Dead Code Cleanup — Phase 1 Spec

**Ngày:** 2026-05-20  
**Trạng thái:** Đã thống nhất, đang triển khai  
**Phạm vi:** Phase 1 trong chuỗi refactor 3 phase (Phase 2: smoothness, Phase 3: structural refactor)

## Bối cảnh

Sau loạt refactor UI trang `/generate` và chuẩn hóa đặt tên trang "Trang N", codebase tích lũy ~5,800 LOC dead code: engine modules không import, editor panels superseded bởi `DesignWorkspace`, shadcn primitives scaffold nhưng chưa dùng, exports orphan, và console.debug không gate DEV.

Audit (2026-05-20) xác nhận zero import cho các module chính. Mục tiêu Phase 1: giảm bloat, không đổi behavior runtime.

## Mục tiêu

- Xóa ~5,800 LOC + 15 file shadcn primitives không dùng.
- Không refactor structural (`PackTabContent`, `DesignWorkspace` giữ nguyên cấu trúc — Phase 3).
- Không tối ưu performance (Phase 2).
- Mỗi cluster commit riêng + verify riêng để dễ revert.

## Phạm vi

### Cluster 1 — Engines orphan (~3,233 LOC)

| File | LOC | Lý do xóa |
|------|-----|-----------|
| `src/engines/analysis/reversePackAnalyzer.ts` | 2956 | Zero import ngoài chính file |
| `src/engines/reports/reports.ts` | 151 | Zero import |
| `src/engines/captions/generator.ts` | 126 | Superseded bởi `captionTones.ts` + `exportArtifacts.ts` |

**Giữ lại:** Types `AnalyzedPack`, `AnalysisRecord` trong `src/models/index.ts` — vẫn dùng bởi `remoteDb.ts`, `systemBackup.ts`, `routes/index.tsx` (bảng `analyses`).

### Cluster 2 — Editor orphan (~1,500 LOC)

12 file superseded bởi `DesignWorkspace` + `designStore`:

- `EditorCanvas.tsx`, `TemplatesGallery.tsx`, `StockPhotosPanel.tsx`, `BackgroundRemover.tsx`, `HistoryPanel.tsx`, `CardRepeaterPanel.tsx`, `FontPicker.tsx`
- `magicResize.ts`, `animationPresets.ts`, `layerOps.ts`, `useClipboard.ts`, `useHistory.ts`

### Cluster 3 — Generate orphan (~544 LOC)

- `MappingOverview.tsx`, `mappingOverview.utils.ts`, `MappingOverview.test.ts`

UI đã remove khỏi `PackTabContent`; utils chỉ phục vụ component dead.

### Cluster 4 — Storage flag-gated (275 LOC)

- `src/storage/sampleDataCleanup.ts` — `DEMO_CLEANUP_ENABLED = false`, zero call site.

### Cluster 5 — Shadcn primitives (15 file)

Xóa các component không có `@/components/ui/<name>` import:

`calendar`, `carousel`, `chart`, `menubar`, `drawer`, `pagination`, `hover-card`, `breadcrumb`, `aspect-ratio`, `form`, `radio-group`, `resizable`, `avatar`, `input-otp`, `navigation-menu`, `sidebar`

**Giữ:** CSS tokens `sidebar-*` trong `index.css` (AppShell dùng custom sidebar).

### Cluster 6 — Dead exports + console gate

**Xóa exports không dùng:**
- `slotHasBinding` — `dataBinding.ts`
- `EntityBindBatchState`, `AllocateEntityBindingsResult` — chuyển local trong `entityBindAllocator.ts`
- `BuildCaptionInput.variantCount` — deprecated field trong `exportArtifacts.ts`
- `previewAutoBindForDrafts` — `autoBindPlaceholders.ts` (+ test references nếu có)
- UX components orphan: `InspectorSection`, `NumberField`, `CollapsiblePanel`, `StepIndicator`

**Gate DEV:**
- `PackTabContent.tsx` L2339-2349 — AI Rewrite `console.debug`
- `DesignWorkspace.tsx` L2651 — ContextMenu `console.debug`

## Verify

Sau mỗi cluster:

```bash
npm run typecheck
npm test -- --run
npm run lint
npm run build
```

Smoke test thủ công cho C2 (`/templates`, `/templates/$id/edit`), C3 (`/generate`), C5 (UI không crash).

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|------------|
| Dynamic import ẩn | `rg` full symbol trước mỗi xóa |
| `sidebar.tsx` bị reference gián tiếp | Pre-check `AppShell.tsx`, `rg sidebar` |
| Model types orphan | Chỉ xóa implementation; giữ `AnalyzedPack` vì DB schema |
| Shadcn cần lại sau | `npx shadcn add <name>` ~30s/component |

## Out of scope

- Phase 2: memoization, lazy images, `useLiveQuery` scope, code-split export libs
- Phase 3: tách monolith, unify slugify/clone/indexById
- Xóa docs cũ — chỉ đánh dấu status nếu cần

## Tiêu chí hoàn thành

- [ ] 6 cluster xóa + verify pass
- [ ] Không ESLint error mới
- [ ] Typecheck + test + build pass
- [ ] Code review subagent approve
