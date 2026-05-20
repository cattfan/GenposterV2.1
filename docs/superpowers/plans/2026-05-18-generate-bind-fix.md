# Generate Bind Group Persistence & Partner Quota Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bug binding nhóm 2 ghi đè nhóm 1 trên trang `/generate`, và surface allocator warnings (partner quota không đủ) lên UI.

**Architecture:** TDD-first cho phần A (viết test reproduce trước, fix tại gốc rễ — chủ yếu trong `templateState.ts` và `PackTabContent.applyBindingToSlots`). Phần B mỏng: thay `previewSlotItems` thành `previewAllocation` (items + warnings), thêm component panel hiển thị bên cột canvas.

**Tech Stack:** TypeScript, React 19, vitest, TanStack Router, shadcn-ui, Tailwind.

---

## File Structure

**Phần A — Bind groups:**
- Test mới: `src/features/generate/bindGroupsPersistence.test.ts` — pure state test, không React.
- Sửa: `src/features/generate/templateState.ts` (nếu hypothesis 1) — `restoreTemplateGroups` giữ binding từ working.
- Sửa: `src/features/generate/PackTabContent.tsx` (nếu hypothesis 2) — `applyBindingToSlots` đồng bộ override + draft trong 1 commit.
- Sửa: `src/features/generate/usePreviewPageDrafts.ts` (nếu hypothesis 3) — không re-hydrate qua `cloneTemplateDraftsWithSource` mỗi commit.

**Phần B — Warnings:**
- Tạo: `src/features/generate/AllocationWarningsPanel.tsx` — component pure presentational.
- Sửa: `src/features/generate/PackTabContent.tsx` — đổi `previewSlotItems` → `previewAllocation`, render panel.

## Tasks

### Task 1: Reproduce bug bind groups bằng test

**Files:**
- Create: `src/features/generate/bindGroupsPersistence.test.ts`

- [ ] **Step 1: Viết test reproduce**

```ts
import { describe, expect, it } from "vitest";
import type { PageTemplate, Slot } from "@/models";
import {
  createWorkingTemplate,
  resolvePageWorkingTemplate,
  GENERATE_TEMPLATE_OPTIONS,
} from "./templateState";

function makeSlot(partial: Partial<Slot> & { slotId: string; kind: Slot["kind"] }): Slot {
  return { x: 0, y: 0, width: 100, height: 40, ...partial } as Slot;
}

function makeTemplate(slots: Slot[]): PageTemplate {
  return {
    pageTemplateId: "tpl-1",
    name: "test",
    type: "cover",
    canvas: { width: 1080, height: 1080 },
    slots,
    sections: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("bind group persistence", () => {
  it("preserves bindings of group A when later writing bindings of group B", () => {
    const baseTemplate = makeTemplate([
      // Group A
      makeSlot({ slotId: "a-img", kind: "image", groupId: "gA" }),
      makeSlot({ slotId: "a-name", kind: "text", groupId: "gA" }),
      makeSlot({ slotId: "a-addr", kind: "text", groupId: "gA" }),
      // Group B
      makeSlot({ slotId: "b-img", kind: "image", groupId: "gB" }),
      makeSlot({ slotId: "b-name", kind: "text", groupId: "gB" }),
      makeSlot({ slotId: "b-addr", kind: "text", groupId: "gB" }),
    ]);

    // Lần 1: bind group A
    let working = createWorkingTemplate(
      baseTemplate,
      undefined,
      baseTemplate,
      GENERATE_TEMPLATE_OPTIONS,
    );
    working = {
      ...working,
      slots: working.slots.map((slot) => {
        if (slot.slotId === "a-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "a-addr") return { ...slot, bindingPath: "entity.address" };
        if (slot.slotId === "a-img") return { ...slot, bindingPath: "asset.cover" };
        return slot;
      }),
    };

    // Lần 2: bind group B (giả lập commit thứ 2 của PackTabContent)
    const afterA = working;
    let workingB = createWorkingTemplate(
      baseTemplate,
      undefined,
      afterA,
      GENERATE_TEMPLATE_OPTIONS,
    );
    workingB = {
      ...workingB,
      slots: workingB.slots.map((slot) => {
        if (slot.slotId === "b-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "b-addr") return { ...slot, bindingPath: "entity.address" };
        if (slot.slotId === "b-img") return { ...slot, bindingPath: "asset.cover" };
        return slot;
      }),
    };

    // Lần 3: resolvePageWorkingTemplate (chạy mỗi render trong PackTabContent)
    const resolved = resolvePageWorkingTemplate(
      baseTemplate,
      undefined,
      workingB,
      GENERATE_TEMPLATE_OPTIONS,
    );

    // Cả 6 slot đều phải có binding
    expect(resolved?.slots.find((s) => s.slotId === "a-name")?.bindingPath).toBe("entity.name");
    expect(resolved?.slots.find((s) => s.slotId === "a-addr")?.bindingPath).toBe("entity.address");
    expect(resolved?.slots.find((s) => s.slotId === "a-img")?.bindingPath).toBe("asset.cover");
    expect(resolved?.slots.find((s) => s.slotId === "b-name")?.bindingPath).toBe("entity.name");
    expect(resolved?.slots.find((s) => s.slotId === "b-addr")?.bindingPath).toBe("entity.address");
    expect(resolved?.slots.find((s) => s.slotId === "b-img")?.bindingPath).toBe("asset.cover");
  });
});
```

- [ ] **Step 2: Chạy test, verify FAIL hoặc PASS**

Run: `npx vitest run --config vitest.config.ts src/features/generate/bindGroupsPersistence.test.ts`

Expected: PASS (vì pure state, không qua React commit pipeline) hoặc FAIL nếu `restoreTemplateGroups` đang reset binding.

Nếu PASS → bug nằm ở React state pipeline (Task 2). Nếu FAIL → bug nằm ở `restoreTemplateGroups` (Task 3).

- [ ] **Step 3: Commit test**

```bash
git add src/features/generate/bindGroupsPersistence.test.ts
git commit -m "test: reproduce bind group persistence across consecutive commits"
```

### Task 2: Reproduce bug ở mức React state pipeline (nếu Task 1 pass)

**Files:**
- Modify: `src/features/generate/bindGroupsPersistence.test.ts` — thêm test mô phỏng `commitPreviewPageDrafts` + `setPreviewDraftsNoHistory`.

- [ ] **Step 1: Viết test mô phỏng pipeline**

```ts
import { describe, expect, it } from "vitest";
import type { PageTemplate, Slot } from "@/models";
import {
  cloneTemplateDraftsWithSource,
  type PreviewPageDrafts,
} from "./usePreviewPageDrafts";
import {
  createWorkingTemplate,
  GENERATE_TEMPLATE_OPTIONS,
} from "./templateState";

describe("bind group persistence — React pipeline", () => {
  it("commit + hydrate cycle does not drop earlier bindings", () => {
    const baseTemplate: PageTemplate = {
      pageTemplateId: "tpl-1",
      name: "test",
      type: "cover",
      canvas: { width: 1080, height: 1080 },
      slots: [
        { slotId: "a-name", kind: "text", x: 0, y: 0, width: 100, height: 40, groupId: "gA" },
        { slotId: "a-addr", kind: "text", x: 0, y: 50, width: 100, height: 40, groupId: "gA" },
        { slotId: "b-name", kind: "text", x: 200, y: 0, width: 100, height: 40, groupId: "gB" },
        { slotId: "b-addr", kind: "text", x: 200, y: 50, width: 100, height: 40, groupId: "gB" },
      ] as Slot[],
      sections: [],
      createdAt: 0,
      updatedAt: 0,
    };

    let drafts: PreviewPageDrafts = {};

    const commit = (updater: (prev: PreviewPageDrafts) => PreviewPageDrafts) => {
      const next = updater(drafts);
      // Mô phỏng setPreviewDraftsNoHistory ở [PackTabContent.tsx:406]
      drafts = cloneTemplateDraftsWithSource(next, [baseTemplate]);
    };

    // Bind group A
    commit((prev) => {
      const current = prev["tpl-1"] ?? baseTemplate;
      const next = createWorkingTemplate(current, undefined, current, GENERATE_TEMPLATE_OPTIONS);
      next.slots = next.slots.map((slot) => {
        if (slot.slotId === "a-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "a-addr") return { ...slot, bindingPath: "entity.address" };
        return slot;
      });
      return { ...prev, "tpl-1": next };
    });

    expect(drafts["tpl-1"].slots.find((s) => s.slotId === "a-name")?.bindingPath).toBe("entity.name");

    // Bind group B
    commit((prev) => {
      const current = prev["tpl-1"] ?? baseTemplate;
      const next = createWorkingTemplate(current, undefined, current, GENERATE_TEMPLATE_OPTIONS);
      next.slots = next.slots.map((slot) => {
        if (slot.slotId === "b-name") return { ...slot, bindingPath: "entity.name" };
        if (slot.slotId === "b-addr") return { ...slot, bindingPath: "entity.address" };
        return slot;
      });
      return { ...prev, "tpl-1": next };
    });

    // Cả 4 slot phải còn binding
    const slots = drafts["tpl-1"].slots;
    expect(slots.find((s) => s.slotId === "a-name")?.bindingPath).toBe("entity.name");
    expect(slots.find((s) => s.slotId === "a-addr")?.bindingPath).toBe("entity.address");
    expect(slots.find((s) => s.slotId === "b-name")?.bindingPath).toBe("entity.name");
    expect(slots.find((s) => s.slotId === "b-addr")?.bindingPath).toBe("entity.address");
  });
});
```

- [ ] **Step 2: Chạy test, ghi nhận FAIL/PASS**

Run: `npx vitest run --config vitest.config.ts src/features/generate/bindGroupsPersistence.test.ts`

Expected: FAIL (đây là root cause hypothesis chính).

- [ ] **Step 3: Commit thêm test này**

```bash
git add src/features/generate/bindGroupsPersistence.test.ts
git commit -m "test: reproduce bind loss through commit+hydrate pipeline"
```

### Task 3: Fix tại gốc rễ — giữ binding qua hydrate cycle

**Hypothesis chính:** `cloneTemplateDraftsWithSource` gọi `restoreTemplateGroups(baseTemplate, draft)` — nếu logic merge trong `restoreTemplateGroups` reset slot từ `baseTemplate.slots` (không có binding), draft sẽ mất binding.

Đọc kỹ [`templateState.ts:234-272`](src/features/generate/templateState.ts) — hàm KHÔNG reset binding (chỉ touch `groupId` + push group slots thiếu). Vậy bug có thể ở `normalizeTemplateGroups` strip slot tự sinh `auto-group-` rồi `applyBindOverrides(baseTpl, undefined)` ghi đè.

Tuy nhiên, `applyBindOverrides` chỉ chạy khi caller truyền overrides — `restoreTemplateGroups` không gọi nó. Vậy có thể bug ở chỗ khác.

**Nguy cơ thật:** `createWorkingTemplate(current, undefined, current, ...)` ở Task 2 step 1, dòng `applyBindOverrides(current, {})` → trả về `current` reference khi overrides rỗng (line 17: `if (!Object.keys(overrides).length) return template;`) → OK.

Nhưng `clonePageTemplate(restoreTemplateGroups(...))` → JSON.parse(JSON.stringify) nên giữ binding.

**Khả năng cao thật:** Khi Task 2 commit lần 2 chạy, `prev["tpl-1"]` là draft của lần 1 (đã có binding A). `current = prev["tpl-1"]`. `createWorkingTemplate(current, undefined, current)` → `source = applyBindOverrides(current, {})` → `current`. Sau đó `clonePageTemplate(restoreTemplateGroups(current, current))` → vẫn giữ binding A.

Vấn đề duy nhất có thể: nếu `setPreviewDraftsNoHistory` gọi `cloneTemplateDraftsWithSource(next, packPages)` với `packPages = [baseTemplate]` (tpl không có binding) — và `restoreTemplateGroups(baseTemplate, draftWithBinding)`:
- `baseChildGroupIds.set(slot.slotId, groupA)` cho slot a-name
- Map `nextSlots` từ `normalizedWorkingTemplate.slots` (giữ binding) — chỉ rewrite `groupId`
- Push group slots thiếu

Logic OK, không reset binding.

**Vậy Task 2 nên PASS!** Nếu lúc chạy nó PASS → bug ở chỗ khác trong React state. Cần debug runtime.

- [ ] **Step 1: Quyết định hướng fix dựa trên kết quả Task 2**

Đọc kết quả test Task 2:
- Nếu PASS → Sang Task 4 (debug runtime với React).
- Nếu FAIL → đọc lỗi chi tiết, fix tại module được test cover.

- [ ] **Step 2 (chỉ chạy nếu Task 2 FAIL): Fix `restoreTemplateGroups` giữ binding**

Phương án fix nếu phát hiện reset:

```ts
// templateState.ts — sửa restoreTemplateGroups để KHÔNG bao giờ thay slot có
// bindingPath bằng phiên bản từ baseTemplate.
// (Đoạn dưới placeholder — code thật phụ thuộc vào lỗi cụ thể.)
```

Phương án thay thế: trong `cloneTemplateDraftsWithSource` chỉ chạy `restoreTemplateGroups` khi `JSON.stringify(baseTemplate.slots[].groupId) !== JSON.stringify(workingTemplate.slots[].groupId)` — bỏ qua khi groups đã đồng bộ (đa số case).

- [ ] **Step 3: Test PASS sau fix**

Run: `npx vitest run --config vitest.config.ts src/features/generate/bindGroupsPersistence.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 4: Commit fix**

```bash
git add src/features/generate/templateState.ts src/features/generate/usePreviewPageDrafts.ts
git commit -m "fix: preserve bindings through hydrate cycle in preview drafts"
```

### Task 4: Nếu state-level test PASS, debug runtime với React Testing Library

**Files:**
- Create: `src/features/generate/applyBindingToSlots.runtime.test.ts`

- [ ] **Step 1: Viết test mô phỏng đúng `applyBindingToSlots`**

Mục tiêu: chạy đúng pipeline `setBinding` (state qua `usePackBindOverrides`) + `commitPreviewPageDrafts` để bắt race.

```ts
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePackBindOverrides } from "./usePackBindOverrides";

describe("usePackBindOverrides — concurrent setBinding for groups", () => {
  it("two consecutive group binds preserve all slot paths", () => {
    const { result } = renderHook(() => usePackBindOverrides());

    act(() => {
      result.current.setBinding("tpl-1", "a-name", "entity.name");
      result.current.setBinding("tpl-1", "a-addr", "entity.address");
      result.current.setBinding("tpl-1", "a-img", "asset.cover");
    });

    act(() => {
      result.current.setBinding("tpl-1", "b-name", "entity.name");
      result.current.setBinding("tpl-1", "b-addr", "entity.address");
      result.current.setBinding("tpl-1", "b-img", "asset.cover");
    });

    const ov = result.current.all["tpl-1"];
    expect(ov["a-name"]).toBe("entity.name");
    expect(ov["a-addr"]).toBe("entity.address");
    expect(ov["a-img"]).toBe("asset.cover");
    expect(ov["b-name"]).toBe("entity.name");
    expect(ov["b-addr"]).toBe("entity.address");
    expect(ov["b-img"]).toBe("asset.cover");
  });
});
```

- [ ] **Step 2: Cài @testing-library/react nếu chưa có**

Check: `package.json` có `@testing-library/react` không? Nếu không, thêm:

```bash
npm install --save-dev @testing-library/react happy-dom
```

Cập nhật `vitest.config.ts` với `environment: "happy-dom"`.

- [ ] **Step 3: Chạy test**

Run: `npx vitest run --config vitest.config.ts src/features/generate/applyBindingToSlots.runtime.test.ts`

Expected: PASS (functional setState an toàn) hoặc FAIL nếu có race.

Nếu PASS → bug nằm ở `applyBindingToSlots` mismatch giữa `packOv` và `previewPageDrafts`. Sang Task 5.

- [ ] **Step 4: Commit**

```bash
git add package.json src/features/generate/applyBindingToSlots.runtime.test.ts
git commit -m "test: verify usePackBindOverrides handles consecutive group binds"
```

### Task 5: Fix `applyBindingToSlots` đồng bộ override + draft

**Files:**
- Modify: `src/features/generate/PackTabContent.tsx` — `applyBindingToSlots` (line ~1123)

Pattern hiện tại:
1. `setBinding(...)` cho mỗi slot — mutation async vào `packOv` state.
2. `commitPreviewPageDrafts((prev) => ...)` đồng bộ build draft mới.

Vấn đề: nếu user gọi liên tiếp 2 lần `applyBindingToSlots` (vd: paste format + bind text + bind image trong 1 batch React click), commit thứ 2 đọc `prev = draftsRef.current` của lần 1 (chưa flush qua `setNoHistory`), build mới chỉ có binding của lần 2. **Override của lần 1 không có trong `current` cũng không có trong `next`** vì updater dùng `current` (đã flush ở Task 1) — đáng lẽ đúng.

Nhưng: `applyBindingToSlots` overwrite slot trong `next` bằng `bindingPath: bindingPath || undefined`. Nếu cùng template có dataGroup/group, các call connected có thể clobber.

**Hypothesis cần verify**: `commitPreviewPageDrafts` bị **không idempotent** khi gọi 2 lần trong cùng React batch — 2 call cùng đọc `previewPageDraftsRef.current` (cùng giá trị), build 2 `next` riêng biệt; chỉ 1 cái thắng (lần cuối ghi đè). Đây là bug thực sự.

- [ ] **Step 1: Viết test reproduce trong cùng batch**

```ts
// Bổ sung vào bindGroupsPersistence.test.ts
it("two synchronous commits within same tick do not lose bindings", () => {
  const baseTemplate: PageTemplate = {
    /* ...same as before... */
  } as PageTemplate;
  let drafts: PreviewPageDrafts = {};
  const ref = { current: drafts };
  const setNoHistory = (next: PreviewPageDrafts) => {
    drafts = cloneTemplateDraftsWithSource(next, [baseTemplate]);
    ref.current = drafts;
  };
  const commit = (updater: (prev: PreviewPageDrafts) => PreviewPageDrafts) => {
    const next = updater(ref.current);
    setNoHistory(next);
  };

  // Gọi 2 commit liên tiếp KHÔNG flush state giữa chừng (mô phỏng React batch).
  // Bind group A
  commit((prev) => {/* build group A */});
  // Bind group B — `prev` đọc ref.current MỚI nhất, OK
  commit((prev) => {/* build group B */});

  // Cả A + B phải còn binding.
});
```

Test này chính là Task 2 nhưng nhấn mạnh sync. Nếu Task 2 PASS thì Task 5 cũng OK.

- [ ] **Step 2 (chỉ nếu test FAIL): Fix bằng cách lấy draft từ `previewPageDraftsRef.current` thay vì từ `prev`**

```ts
// PackTabContent.tsx applyBindingToSlots — đoạn commit
commitPreviewPageDrafts((prev) => {
  const baseTpl = pageTemplatesForGenerate.find((t) => t.pageTemplateId === pageTemplateId);
  // FIX: ưu tiên draft mới nhất từ ref, không phải `prev` của closure.
  const current = previewPageDraftsRef.current[pageTemplateId] ?? prev[pageTemplateId] ?? baseTpl;
  if (!current) return prev;
  // ... rest unchanged
});
```

Logic này phải đảm bảo `previewPageDraftsRef.current` luôn được cập nhật ngay trong `setPreviewDraftsNoHistory` (đã có sẵn line 408).

- [ ] **Step 3: Chạy lại test, verify PASS**

Run: `npx vitest run --config vitest.config.ts src/features/generate/bindGroupsPersistence.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/generate/PackTabContent.tsx src/features/generate/bindGroupsPersistence.test.ts
git commit -m "fix: applyBindingToSlots reads draft from ref to avoid clobbering"
```

### Task 6: Manual smoke test trên trang `/generate`

**Files:** Không có (manual).

- [ ] **Step 1: Mở `localhost:9090/generate`**

Server đang chạy ở terminal `npm run dev`. Mở browser, chọn pack mẫu có ≥3 group (file mẫu user gửi: `4n3d-bo-khuon.json` có 14+ groups).

- [ ] **Step 2: Bind nhóm 1**

Click ảnh trong nhóm 1 (group sáng cả 3 slot). Tab "Khối đang chọn" hiện 3 dropdown:
- Khung chữ #1: chọn "Tên"
- Khung chữ #2: chọn "Địa chỉ"
- Khung ảnh: chọn "Ảnh ngẫu nhiên của quán"

Verify pill canvas: nhóm 1 hiện `Tên`, `Địa chỉ`, badge ảnh.

- [ ] **Step 3: Bind nhóm 2 tương tự**

Click ảnh trong nhóm 2, lặp 3 dropdown.

Verify: pill canvas của **nhóm 1 vẫn còn**, nhóm 2 cũng có.

- [ ] **Step 4: Lặp cho nhóm 3, nhóm 4**

Verify: tất cả pill còn nguyên.

- [ ] **Step 5: Bấm "Tạo bộ ảnh", kiểm tra output**

Verify: mỗi nhóm có entity khác, không có nhóm nào trống.

### Task 7: Surface allocator warnings — đổi `previewSlotItems` sang `previewAllocation`

**Files:**
- Modify: `src/features/generate/PackTabContent.tsx` — line ~806 (`previewSlotItems`)

- [ ] **Step 1: Đổi memo signature**

```ts
const previewAllocation = useMemo(() => {
  if (activePreviewRenderedPage) {
    return { items: activePreviewRenderedPage.items, warnings: [] as string[] };
  }
  if (!effectiveActive || !previewEntity) return { items: [], warnings: [] };
  const shouldPinPreviewOwner = activeTargetCount <= 1;
  const allocation = allocateEntityBindingsForTemplate({
    template: effectiveActive,
    orderedEntities: buildOrderedEntityPool(previewEntityId, filteredEntities),
    pageOwner: shouldPinPreviewOwner ? previewEntity : undefined,
    partnerQuota: activeGenerateConfig.partnerQuotaPerPage,
    prioritizePartner: activeGenerateConfig.prioritizePartner,
    batchState: { usedEntityIds: new Set<string>() },
  });
  return { items: allocation.items, warnings: allocation.warnings };
}, [
  effectiveActive,
  previewEntity,
  activePreviewRenderedPage,
  activeGenerateConfig,
  activeTargetCount,
  buildOrderedEntityPool,
  previewEntityId,
  filteredEntities,
]);

const previewSlotItems = previewAllocation.items;
const previewAllocationWarnings = previewAllocation.warnings;
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/generate/PackTabContent.tsx
git commit -m "refactor: expose allocator warnings alongside preview slot items"
```

### Task 8: Tạo `AllocationWarningsPanel` component

**Files:**
- Create: `src/features/generate/AllocationWarningsPanel.tsx`

- [ ] **Step 1: Viết component**

```tsx
// Hiển thị warning từ allocateEntityBindingsForTemplate trên trang Tạo nội dung.
// Allocator trả mảng string warning thô — component này phân loại + format VN +
// cho phép user dismiss khỏi UI (ko persist; refresh là hiện lại).

import { useMemo, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  warnings: string[];
  className?: string;
}

interface ParsedWarning {
  level: "warning" | "info";
  label: string;
  detail: string;
}

function parseWarning(raw: string): ParsedWarning {
  if (raw.includes("khong du doi tac")) {
    return {
      level: "warning",
      label: "Thiếu đối tác cho quota",
      detail: raw.replace(/.*quota\s*/i, "Quota: ").replace("/trang", "/trang."),
    };
  }
  if (raw.includes("khong du entity")) {
    return {
      level: "info",
      label: "Thiếu dữ liệu",
      detail: "Pool dữ liệu không đủ cho số khung hiện tại — 1 số khung sẽ trống.",
    };
  }
  return { level: "info", label: "Thông báo", detail: raw };
}

export function AllocationWarningsPanel({ warnings, className }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const parsed = useMemo(
    () => warnings.map(parseWarning),
    [warnings],
  );

  if (warnings.length === 0 || dismissed) return null;

  return (
    <div
      className={cn(
        "rounded-md border border-amber-300/60 bg-amber-50/80 p-2 text-amber-900 shadow-sm dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="size-3.5" />
          {warnings.length} cảnh báo phân bổ dữ liệu
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 -mt-0.5 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
          onClick={() => setDismissed(true)}
          aria-label="Ẩn cảnh báo"
        >
          <X className="size-3" />
        </Button>
      </div>
      <ul className="mt-1.5 space-y-1 text-[11px]">
        {parsed.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-start gap-1.5">
            {item.level === "warning" ? (
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            ) : (
              <Info className="mt-0.5 size-3 shrink-0" />
            )}
            <span>
              <span className="font-medium">{item.label}.</span> {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npx eslint src/features/generate/AllocationWarningsPanel.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/generate/AllocationWarningsPanel.tsx
git commit -m "feat: add AllocationWarningsPanel for partner quota visibility"
```

### Task 9: Render `AllocationWarningsPanel` dưới `BindingIssuesPanel` ở cột 2

**Files:**
- Modify: `src/features/generate/PackTabContent.tsx` — đoạn render col 2 (gần `<BindingIssuesPanel ...>`).

- [ ] **Step 1: Import + render**

Tìm đoạn render `<BindingIssuesPanel` (line ~3260), thêm panel ngay sau:

```tsx
import { AllocationWarningsPanel } from "@/features/generate/AllocationWarningsPanel";
// ...
{effectiveActive && (
  <BindingIssuesPanel
    template={effectiveActive}
    entity={previewEntity}
    entityPool={previewEntityPool}
    assets={assets}
    globalAssets={assets}
    activeSheetName={previewEntity?.sheetName}
    onSelectSlot={(slotId) => handleSelectSlot(slotId)}
  />
)}
{previewAllocationWarnings.length > 0 && (
  <AllocationWarningsPanel warnings={previewAllocationWarnings} />
)}
```

- [ ] **Step 2: Verify build + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/features/generate/PackTabContent.tsx`
Expected: no errors.

- [ ] **Step 3: Manual verify**

Trên trang `/generate`:
- Cấu hình `partnerQuotaPerPage = 5`, sheet chỉ có 1 partner → panel hiện cảnh báo vàng.
- `partnerQuotaPerPage = 0`, sheet đủ data → panel ẩn.
- Click `X` → panel ẩn cho session.

- [ ] **Step 4: Commit**

```bash
git add src/features/generate/PackTabContent.tsx
git commit -m "feat: surface allocator warnings on generate canvas"
```

### Task 10: Test cho `AllocationWarningsPanel`

**Files:**
- Create: `src/features/generate/AllocationWarningsPanel.test.tsx`

- [ ] **Step 1: Viết test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllocationWarningsPanel } from "./AllocationWarningsPanel";

describe("AllocationWarningsPanel", () => {
  it("hides when warnings array is empty", () => {
    const { container } = render(<AllocationWarningsPanel warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders parsed partner quota warning", () => {
    render(
      <AllocationWarningsPanel
        warnings={['Page "Trang 1": khong du doi tac de dat quota 2/trang.']}
      />,
    );
    expect(screen.getByText(/Thiếu đối tác/)).toBeInTheDocument();
  });

  it("renders entity shortage info", () => {
    render(
      <AllocationWarningsPanel
        warnings={['Page "Trang 1": khong du entity de gan du lieu.']}
      />,
    );
    expect(screen.getByText(/Thiếu dữ liệu/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test**

Run: `npx vitest run --config vitest.config.ts src/features/generate/AllocationWarningsPanel.test.tsx`
Expected: 3/3 PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/generate/AllocationWarningsPanel.test.tsx
git commit -m "test: AllocationWarningsPanel parses and renders allocator warnings"
```

### Task 11: Final verify — full suite + lint + tsc

- [ ] **Step 1: Full vitest**

Run: `npx vitest run --config vitest.config.ts`
Expected: all PASS (≥70 tests cũ + tests mới).

- [ ] **Step 2: Lint**

Run: `npx eslint src/features/generate`
Expected: 0 errors (warning về `slotSourceConfig` line 940 đã có trước, OK).

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Browser smoke test cuối**

`localhost:9090/generate`:
- Bind 5 nhóm liên tiếp → cả 5 còn pill. ✓
- Set `partnerQuotaPerPage` cao hơn pool → panel cảnh báo hiện. ✓
- Click X → panel ẩn. ✓
- Bấm Tạo bộ ảnh → output đúng quota khi đủ partner.

## Self-review

**Spec coverage:**
- Phần A.1 (reproduce bằng test) → Task 1 + 2 + (4 nếu cần).
- Phần A.2 (fix root cause) → Task 3 hoặc 5 tuỳ kết quả test.
- Phần A.3 (idempotent guarantee) → Task 6 (manual 5 nhóm).
- Phần B.1 (truyền warnings) → Task 7.
- Phần B.2 (panel) → Task 8 + 9.
- Phần B.3 (phân loại) → trong `parseWarning` của Task 8.
- Phần B.4 (test) → Task 10.

**Placeholder scan:**
- Task 3 step 2 có nói "code thật phụ thuộc vào lỗi cụ thể" — đây là conditional task, không phải placeholder; nội dung fix sẽ được engineer điền dựa trên test failure log. Acceptable cho TDD plan.
- Task 5 step 2 cũng tương tự — fix có pattern cụ thể (`previewPageDraftsRef.current[id] ?? prev[id]`), không placeholder.

**Type consistency:**
- `previewAllocation.items` / `previewAllocation.warnings` đặt nhất quán Task 7 + 9.
- `AllocationWarningsPanel` props `{ warnings: string[]; className?: string }` nhất quán Task 8 + 9 + 10.
- `parseWarning` chỉ định nghĩa nội bộ component, không leak ra Task khác.
