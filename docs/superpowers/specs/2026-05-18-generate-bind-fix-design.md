# Generate Page — Bind Group Persistence & Partner Quota Visibility

**Ngày:** 2026-05-18
**Trạng thái:** Đã thống nhất spec, chờ viết plan

## Bối cảnh

Trang `/generate` đã trải qua refactor lớn (xem `2026-05-18-generate-page-bind-revamp` và commit liên quan). Sau refactor, user báo 2 vấn đề lớn về luồng đổ dữ liệu:

1. **Bind nhóm sau làm mất bind nhóm trước.** User có template với `groupId` (visual cluster gồm 1 ảnh + 2 chữ Tên/Địa chỉ), bind cho nhóm 1, click qua nhóm 2 và bind tiếp, thì binding của nhóm 1 trong canvas (pill `bg-primary/90`) BIẾN MẤT — `bindingPath` thực sự bị xoá. User phải bind lại từ đầu mỗi khi chuyển nhóm.

2. **Không rõ partner-quota có thực sự áp dụng không.** User cấu hình 2 đối tác/trang, hoặc bật "Chỉ đối tác", hoặc filter sheet ra entity không có ai `partnerFlag=true`. Không có feedback từ UI biết job sinh ra có tuân thủ quota hay không, có rơi vào fallback non-partner hay không.

## Mục tiêu

- **A.** Bind giữ nguyên qua mọi thao tác (binding của nhóm trước không bao giờ mất khi user bind nhóm khác trên cùng 1 trang).
- **B.** User thấy được warning khi allocator không thoả quota partner — không phải bug, nhưng cần transparent.

## Phân tích kỹ thuật

### Vấn đề A — Bind groups bị mất

Code review cho thấy 3 nguồn rủi ro chính, đều liên quan đến cách `previewPageDrafts` (state chính chứa template đang sửa) được rebuild sau mỗi commit:

1. `commitPreviewPageDrafts` ([PackTabContent.tsx:408](src/features/generate/PackTabContent.tsx)) → `setPreviewDraftsNoHistory(next)` → `cloneTemplateDraftsWithSource(next, packPages)`. Hàm này gọi `restoreTemplateGroups` cho mỗi page, mà `restoreTemplateGroups` build lại template từ `baseTemplate.slots` rồi merge `groupId` từ base + `applyBindOverrides`. Nếu lúc này `overrides` không chứa binding mới (vì `setBinding` chạy trên closure `setAll` async), draft mới có thể bị "rollback" về phiên bản trước commit.

2. `applyBindingToSlots` ([PackTabContent.tsx:1123](src/features/generate/PackTabContent.tsx)):
   - Gọi `setBinding(pageTemplateId, slot.slotId, bindingPath)` cho mọi slot trong `writableSlots` — async commit vào `packOv` state.
   - Sau đó `commitPreviewPageDrafts` chạy ngay với updater dùng `prev = draftsRef.current` — nhưng draft này có thể chưa thấy `packOv` mới.
   - Updater dùng `createWorkingTemplate(current, undefined, current, GENERATE_TEMPLATE_OPTIONS)` — truyền `undefined` cho `overrides` → bỏ qua mọi override pending → chỉ giữ binding đã có trong `current` draft trước đó.
   - Nếu `current` là draft của lần bind nhóm 1, mà `commitPreviewPageDrafts` của lần đó CHƯA hoàn thành rebuild qua `cloneTemplateDraftsWithSource` thì lần bind nhóm 2 sẽ thấy `current` cũ (chưa có nhóm 1) → tạo `next` chỉ có binding của nhóm 2 → mất nhóm 1.

3. `cloneTemplateDraftsWithSource` được gọi với `packPages` là biến outer scope (không phải ref). Ở các re-render, `packPages` có thể thay đổi reference (do `tpls` đổi qua `useLiveQuery`) → `restoreTemplateGroups` chạy lại với `baseTemplate` mới → có thể overwrite slot.bindingPath nếu logic restore không tôn trọng working template.

**Hypothesis chính:** `restoreTemplateGroups` đang lấy `bindingPath` từ `baseTemplate` thay vì giữ từ `workingTemplate`, hoặc `applyBindOverrides` chỉ áp slot có entry trong overrides — slot khác giữ giá trị từ baseTemplate (không có binding).

### Vấn đề B — Partner quota silent

[`allocateEntityBindingsForTemplate`](src/engines/selection/entityBindAllocator.ts) đã trả về `warnings: string[]` cho 2 case:
- Không đủ partner cho quota: `"khong du doi tac de dat quota X/trang"`.
- Không đủ entity tổng: `"khong du entity de gan du lieu"`.

Nhưng caller (`previewSlotItems` trong PackTabContent line 818) vứt `warnings` đi: `return allocation.items;`. UI hiện không hiển thị bất kỳ warning nào liên quan đến partner.

`BindingIssuesPanel` hiện có chỉ check static binding (slot binding path có hợp lệ không), không động tới allocator runtime warnings.

## Giải pháp

### Phần A — Fix bug bind groups

**A1. Reproduce bằng test (TDD):**
- Tạo `src/features/generate/PackTabContent.bindGroups.test.ts` (hoặc test integration ở mức selection/draft state). Mô phỏng:
  1. Template có 2 group, mỗi group có 3 slot (1 image + 2 text).
  2. Apply override binding nhóm 1 (3 slot).
  3. Apply override binding nhóm 2 (3 slot khác).
  4. Verify: `previewPageDrafts[pageId].slots` có cả 6 slot với `bindingPath` đúng.

Test này chạy thuần state logic, không cần render React. Nếu reproduce được → confirm hypothesis.

**A2. Fix tại gốc rễ:**

Tuỳ kết quả test, fix sẽ ở 1 trong 3 nơi:
- **Nếu lỗi ở `restoreTemplateGroups`**: bảo đảm hàm này luôn ưu tiên `bindingPath` từ `workingTemplate.slots`, không lấy từ `baseTemplate`.
- **Nếu lỗi ở `applyBindingToSlots`**: bỏ pattern "fire-and-forget setBinding rồi commit draft", thay bằng commit draft đồng bộ chứa cả override mới (truth source duy nhất là `previewPageDrafts`, `packOv` chỉ snapshot).
- **Nếu lỗi ở `cloneTemplateDraftsWithSource`**: stop hydrate qua `restoreTemplateGroups` mỗi lần commit — chỉ làm khi `packPages` thực sự đổi (`hydrateForPackPages`).

**A3. Idempotent guarantee:**
- Sau fix, viết property test: 100 lần bind ngẫu nhiên (random slot, random field) → mọi binding cũ phải còn nguyên trừ slot vừa bị overwrite.

### Phần B — Surface partner quota warnings

**B1. Truyền warnings từ allocator lên UI:**
- `previewSlotItems` đang chỉ trả `allocation.items`. Đổi sang trả `{ items, warnings }` qua memo riêng `previewAllocation`, để UI panel có dữ liệu.

**B2. Hiển thị warning panel:**
- Thêm component `AllocationWarningsPanel` mỏng trong `src/features/generate/AllocationWarningsPanel.tsx`.
- Render dưới `BindingIssuesPanel` ở cột 2 (chỗ canvas) — không vào cột 3 vì cột 3 đang đầy.
- Format: badge amber, tooltip giải thích "Quota 2 đối tác/trang nhưng pool chỉ có 1 đối tác phù hợp với filter hiện tại. 1 slot sẽ dùng entity thường."
- Dismiss được (state local, không persist) — user xem rồi ẩn để không vướng.

**B3. Phân loại warning:**
- 2 loại từ allocator: `partner_quota_unmet`, `not_enough_entities`.
- Map sang Vietnamese label + icon (AlertTriangle vàng / Info xanh).

**B4. Test:** unit test cho component panel với cả 2 loại warning.

## Phạm vi loại trừ

- **Không** đổi seed system (deterministic là tính năng).
- **Không** đổi logic allocator (chỉ surface warning).
- **Không** redesign cột 2/3 (vừa làm).
- **Không** thêm tính năng auto-bind mới.

## Tiêu chí chấp nhận

**Phần A:**
- Bind 5 nhóm liên tiếp trên 1 trang → cả 5 nhóm giữ `bindingPath`. Test pass.
- Pill canvas hiển thị đầy đủ 5 nhóm.
- Generate ra 5 entity khác nhau cho 5 nhóm.

**Phần B:**
- Khi pool có ít partner hơn quota → user thấy panel vàng cảnh báo trên canvas, biết rõ trang nào thiếu.
- Khi pool đủ → panel ẩn.
- Khi `onlyPartner=true` và pool có entity non-partner bị skip → user biết đã skip bao nhiêu.

## Self-review

- Spec không có TBD/placeholder.
- Phạm vi rõ: 2 phần độc lập, có thể merge tách biệt.
- Phần A là TDD-first (write test → fix at root → verify) chứ không patch mò.
- Phần B chỉ surface dữ liệu sẵn có (`warnings`) → low risk, ít side effect.
