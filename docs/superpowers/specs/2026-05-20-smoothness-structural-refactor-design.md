# Smoothness & Structural Refactor — Phase 2 + 3 Spec

**Ngày:** 2026-05-20  
**Trạng thái:** Đã thống nhất, đang triển khai  
**Phạm vi:** Phase 2 (smoothness/perf) + Phase 3 (structural refactor) sau Phase 1 dead code cleanup

## Bối cảnh

Phase 1 đã xóa ~9,164 LOC dead code. Hai monolith còn lại:
- `PackTabContent.tsx` (~3,388 LOC) — generate orchestrator
- `DesignWorkspace.tsx` (~7,181 LOC) — editor

Audit perf (2026-05-20): re-render hotspots, unscoped `useLiveQuery`, eager export libs (~600KB), 100+ `<img>` không lazy.

## Mục tiêu

**Phase 2 — Smoothness:**
- Giảm JS initial chunk `/generate` (lazy `xlsx`, `jszip`, `html-to-image`)
- Scope `useLiveQuery` để tránh refetch toàn app
- Lazy decode images trên gallery/results/thumbs
- Stabilize callbacks trong `PackTabContent` (ít re-render con)

**Phase 3 — Structural:**
- Shared libs: `indexById`, `slugify`, `entityContentKey`, `seededRandom`
- Export `getBundleIndex` + `groupJobPagesByBundle` từ `packDisplay`
- Tách 5 hooks từ `PackTabContent` → ~2,000 LOC
- Tách DesignWorkspace **medium**: `DesignStage`, `useDesignAutosave`, `useDesignViewport`, `designCanvasInteraction` → ~4,000 LOC

**Không đổi behavior** người dùng thấy được.

## Success metrics

| Metric | Target |
|--------|--------|
| `/generate` initial JS | `xlsx`/`jszip`/`html-to-image` trong async chunk, không trong main generate chunk |
| `/templates` thumbs | Refetch chỉ khi `designDocuments` thay đổi (không phải mọi mutation) |
| Slot click `/generate` | Bind panel update không kéo theo re-render gallery/results |
| PackTabContent LOC | ≤ ~2,200 |
| DesignWorkspace LOC | ≤ ~4,200 |

## Wave breakdown

1. **Wave 0:** Spec + plan docs
2. **Wave 1:** Shared libs foundation
3. **Wave 2:** Perf quick wins
4. **Wave 3:** PackTabContent hooks
5. **Wave 4:** DesignWorkspace medium split
6. **Wave 5:** Verify + code review

## Out of scope

- Virtualize 100+ bundle result cards
- Full `DesignInspector` / symbol picker extraction (user chọn medium)
- `iconifyCurated.ts` chunk split
- ESLint exhaustive-deps cleanup (cosmetic)

## Rủi ro

| Rủi ro | Giảm thiểu |
|--------|------------|
| Dynamic import export fail | `formatExportError` accessible từ lazy chunk |
| Hook extraction subtle bugs | Pure fn + unit tests trước khi move |
| DesignStage pointer coords | Move code only, không đổi math |
| structuredClone vs JSON clone | Chạy `templateState.test.ts` + bind persistence tests |
