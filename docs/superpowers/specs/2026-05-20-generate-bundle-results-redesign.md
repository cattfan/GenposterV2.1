# Generate Page — Bundle Results Redesign + Real-Entity Export

**Ngày:** 2026-05-20
**Trạng thái:** Đã thống nhất, đang triển khai

## Bối cảnh

Sau loạt refactor UI trang `/generate` (xem các spec/commit 2026-05-18 trở đi), người dùng phản hồi 2 vấn đề chính ở section kết quả bundle:

1. **Vùng kết quả lộn xộn.** Sticky "Nhảy tới bộ" chiếm chỗ, mỗi card có filename `4n3d-1-bo1.png`, viền tím khi chọn, và 2 nút "Sửa trang / Xuất PNG" lặp đi lặp lại — gây nhiễu thị giác. Toolbar global (filter / Chọn hết / Xuất ZIP) bị nhét vào header của Bộ 1, khiến các Bộ sau không có toolbar tương đương.

2. **Caption + xlsx "tự tạo data".** Khi người dùng chưa bind slot nào với entity, file `caption.txt` vẫn liệt kê tên quán cụ thể và `doitac.xlsx` vẫn có dòng đối tác. Badge "Đối tác" trên card cũng bật sai (chỉ cần `page.entityId` được allocator gán là bật, bất kể slot có hiển thị data của entity đó hay không).

## Mục tiêu

- **A.** Một trang chỉ được coi là "dùng entity Y" khi có ít nhất một slot thực sự render dữ liệu từ Y (text resolve ra non-empty từ Y, hoặc image slot resolve về asset của Y). Mọi UI badge và mọi export đều dùng định nghĩa này.
- **B.** Bundle results gọn: bỏ sticky nav, gộp toolbar global lên trên, mỗi bundle giữ header tối giản, card chỉ còn preview + checkbox + (khi cần) badge Đối tác.
- **C.** Hành động per-page (Sửa trang / Tải PNG) chuyển vào modal zoom — chỉ xuất hiện khi user thật sự cần.
- **D.** Caption AI tuân thủ format chặt: hook UPPERCASE ≤ 90 ký tự, body ≤ 300 ký tự có SEO Đà Lạt, đúng 5 hashtag (3 core cố định + 2 sinh). Tone vẫn varied giữa các bundle qua `captionTones.ts`.

## Giải pháp

### A — "Page displays entity Y" (single source of truth)

**File:** `src/lib/packDisplay.ts`

Thêm helper export:

```ts
export function collectVisibleEntityIds(
  page: RenderedPage,
  pageTemplate: PageTemplate | undefined,
  entitiesById: Map<string, Entity>,
): string[]
```

Logic: duyệt `page.items`, với mỗi item có `entityId`:
- Lookup slot từ `pageTemplate.slots` (hoặc `page.workingTemplate.slots` fallback) qua `item.slotId`.
- Nếu `slot.kind === "image"` hoặc `"shape"`: tính là visible khi `item.assetId` tồn tại (asset thực sự resolve được).
- Nếu `slot.kind === "text"`: tính là visible khi `slot.bindingPath` có giá trị VÀ `resolveTextBinding(bindingPath, entity)` trả ra chuỗi non-empty.

`buildBundlePageMeta` dùng helper này để tính `partnerEntityIds` (entities visible có `partnerFlag=true`) và `hasPartnerExposure = partnerEntityIds.length > 0`. Không còn dựa vào `page.entityId` allocator-assigned.

### B — Filter export theo visible set

**File:** `src/features/generate/buildExportArtifacts.ts`

Mở rộng `toExportPageData`:

```ts
export function toExportPageData(
  page: GenerationJob["pages"][number],
  options: {
    pageTemplate?: PageTemplate;
    entitiesById?: Map<string, Entity>;
  },
): ExportPageEntityData
```

Khi `options` đủ → compute `visibleIds = collectVisibleEntityIds(...)`:
- `entityId` chỉ giữ nếu thuộc `visibleIds`.
- `items[]` filter: chỉ giữ những item có `entityId` ∈ visibleIds (item không gắn entity vẫn giữ).

Hậu quả: `collectUsedEntities` trong `exportArtifacts.ts` không cần đổi, vì `pageData` đã được lọc trước khi truyền vào. `doitac.xlsx` rỗng → fallback "Không có đối tác". `caption.txt` không có tên quán → AI nhận `entities: []` và body sẽ chung chung.

PackTabContent (callers `exportZip` + `exportBundleZip`) build `entitiesById` Map một lần, pass `pageTemplate` (resolve từ `tpls` + `packOv`), call `toExportPageData(p, { pageTemplate, entitiesById })`.

### C — Caption strict format + tone variety

**File:** `src/features/generate/captionTones.ts`

- Tất cả `fallbackHooks` chuyển sang UPPERCASE (rules: ≤ 90 ký tự, có thể có emoji).
- `fallbackBody` rút gọn về < 300 ký tự, kèm 1-2 SEO keyword Đà Lạt thông dụng (ăn uống / check-in / cafe / homestay tùy tone).
- `styleHint` mỗi tone thêm dòng: "Hook PHẢI UPPERCASE, tối đa 90 ký tự. Body tối đa 300 ký tự."

**File:** `src/features/generate/exportArtifacts.ts`

`systemPrompt` viết lại:

```
Mỗi caption gồm đúng 3 phần:
1. Hook: 1 dòng UPPERCASE, tối đa 90 ký tự (sẽ bị cắt nếu vượt).
2. Body: 1 đoạn, tối đa 300 ký tự, có 1-2 keyword SEO Đà Lạt
   (du lịch Đà Lạt / ăn uống Đà Lạt / check-in Đà Lạt / cafe Đà Lạt / homestay Đà Lạt).
   Chỉ nhắc tên quán cụ thể khi entities[] có sẵn trong payload.
3. Hashtags: đúng 5 hashtag.
   - 3 hashtag đầu CHÍNH XÁC: #riviudalat #dalat #dalatreview.
   - 2 hashtag cuối: AI sinh, viết liền không dấu, liên quan du lịch Đà Lạt.
```

Thêm `enforceStrictFormat(draft)` chạy sau `parseCaptionJson` và sau `renderFallbackCaption`:
- Hook: `.toUpperCase().slice(0, 90)`.
- Body: `.slice(0, 300)` (cắt mềm tại khoảng trắng cuối nếu có).
- Hashtags: đảm bảo length === 5, 3 core ở đầu.

### D — Bundle results UI (`PackTabContent.tsx`)

1. Xoá khối sticky "Nhảy tới bộ" (block `bundleGroups.length > 2 && <div className="sticky top-0 ...">`).
2. Tạo 1 sticky toolbar global đặt ngay trên `bundleGroups.map(...)`:
   ```
   [filter Select] [Chọn hết] [Bỏ chọn hết] [Xuất ZIP]   |   N trang · M đã chọn
   ```
   Bỏ toolbar nội bộ trong header Bộ 1 (`bundleGroupIndex === 0`).
3. Bundle header chỉ còn 1 hàng:
   ```
   Bộ N   · N trang  [Bỏ chọn cả bộ / Chọn cả bộ]  [Tải bộ]
   ```
4. Card cleanup:
   - Bỏ `border-primary` khi `page.selected` → thay bằng overlay góc trên-trái (icon ✓ trong vòng tròn primary) hiển thị khi selected.
   - Bỏ dòng `meta.displayPageName` (filename).
   - Bỏ block `grid grid-cols-2` (Sửa trang / Xuất PNG) ở footer.
   - Click vào preview → mở zoom modal (giữ logic cũ).
   - Badge "Đối tác" giữ logic `meta.hasPartnerExposure` (giờ đã đúng).
5. Zoom modal (`zoomedPageMeta && zoomedTemplate`): thêm toolbar phía trên `PageRenderer`:
   ```
   [tên trang]                          [Sửa trang]  [Tải PNG]  [✕ đóng]
   ```
   - Click vào toolbar không bubble lên overlay (stopPropagation).
   - Sửa trang: `setEditingPageIndex(page.pageIndex)` + `setZoomedPageIndex(null)`.
   - Tải PNG: gọi `downloadPng(node, page.pageFile, 2)` với node từ `packRefs.current`.

### E — Tests

**Update `captionTones.test.ts`:**
- Thêm assertion: mọi `fallbackHooks[i]` đều `=== fallbackHooks[i].toUpperCase()`.
- Test `renderFallbackCaption`: `draft.hook.length <= 90`, `draft.body.length <= 300`.

**(Optional) Add `packDisplay.test.ts`:**
- Test `collectVisibleEntityIds`: empty items → `[]`; text item với binding rỗng → `[]`; text item với binding `entity.name` + entity name có giá trị → `[entityId]`; image item với assetId → `[entityId]`; image item không có assetId → `[]`.

## Verification

- `npx vitest run src/features/generate/captionTones.test.ts` pass.
- `npx vitest run src/lib` (nếu có test mới) pass.
- `npx tsc --noEmit` pass.
- Manual: tạo job mới mà không bind slot nào → tải 1 bộ → `caption.txt` không có tên quán; `doitac.xlsx` hiển thị "Không có đối tác"; badge "Đối tác" không hiển thị trên bất kỳ card nào.
- Manual: bind 1 slot text với `entity.name` → render → card hiển thị badge "Đối tác" (nếu entity là partner) và xlsx có entry tương ứng.

## Non-goals

- Không đổi layout 3 cột desktop hay mobile Sheets — đã xong ở các phase trước.
- Không refactor allocator entity assignment — vẫn pre-allocate entityId cho rendering context, chỉ thay đổi cách đọc.
- Không đổi logic chọn tone giữa các bundle — vẫn deterministic theo `(bundleIndex, packName)`.
