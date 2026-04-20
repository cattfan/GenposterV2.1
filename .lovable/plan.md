

## Hiểu yêu cầu

1. **Shape bind ảnh**: Người dùng muốn shape (rectangle/circle...) hoạt động như "khung giữ ảnh" — chọn shape → bind URL/ảnh, ảnh sẽ fill vào trong khung đúng theo borderRadius/shape. Sau này họ sẽ cập nhật URL trong sheet.
2. **Designer toolkit cho text & block**: Bổ sung font, line-height, letter-spacing, gradient, shadow, stroke, hệ căn chỉnh… để biến editor + trang Tạo nội dung thành công cụ designer thật sự.

---

## A. Shape → bind ảnh được

### A1. Cho shape có thuộc tính ảnh
Mở rộng `Slot` (model): với `kind === "shape"`, cho phép:
- `staticImage?` (URL ảnh — cập nhật sau từ sheet)
- `bindingPath?` (đã có sẵn) — cho phép chọn `asset.cover / asset.byRole:*`
- `style.fit` (cover/contain), `style.overlayColor`, `style.opacity` (đã có)

Khi shape có `staticImage` hoặc `bindingPath`, render ảnh **clip** theo hình dạng shape:
- `rectangle` → `border-radius: borderRadius`
- `circle` → `border-radius: 50%`
- `triangle` → `clip-path: polygon(50% 0, 100% 100%, 0 100%)`
- `line/divider` → giữ nguyên (không có ảnh)

Nếu không có ảnh → vẫn render fill màu như cũ.

### A2. Cập nhật trang Tạo nội dung
- Trong `BindCanvas.tsx`: shape render thêm ảnh nếu có binding/staticImage (clip theo shape).
- Trong `routes/generate.tsx`: bỏ chặn "shape không bind được"; coi shape có cùng UI binding như image (`IMAGE_BINDING_OPTIONS`). Text vẫn chỉ áp dụng cho `kind === "text"`.
- Selectable trong `BindCanvas`: thêm `shape` vào danh sách `isBindable`.

### A3. Editor — thêm panel "Ảnh trong shape"
Trong `EditorPage.tsx` panel phải khi `kind === "shape"`:
- Field `URL ảnh (sẽ cập nhật sau)` → `staticImage`
- Object fit: cover/contain
- Overlay color
→ Đây chính là cơ chế "khung giữ ảnh" để thiết kế trước, đổ ảnh sau.

### A4. PageRenderer
Cập nhật `PageRenderer.tsx` để render ảnh trong shape giống `BindCanvas` (đảm bảo export đúng).

---

## B. Designer toolkit cho text

### B1. Font picker (~30 font Google curated cho designer VN)
Tạo `src/features/editor/fonts.ts` chứa danh mục font có hỗ trợ tiếng Việt:
- **Sans** display/UI: Be Vietnam Pro, Inter, Manrope, Plus Jakarta Sans, DM Sans, Lexend, Outfit
- **Sans bold/poster**: Archivo Black, Anton, Barlow Condensed, Bebas Neue (latin)
- **Serif elegance**: Playfair Display, Lora, Cormorant Garamond, EB Garamond, Bitter
- **Display/funky**: Fraunces, Unbounded, Bricolage Grotesque, Space Grotesque, Sora
- **Script/handwritten**: Pacifico, Caveat, Dancing Script, Great Vibes (latin only)
- **Mono**: JetBrains Mono, IBM Plex Mono

Cách load: chèn 1 thẻ `<link>` Google Fonts duy nhất ở `__root.tsx` với danh sách `display=swap` để tải tất cả 1 lần (hoặc lazy theo nhóm). Mỗi font đánh dấu `vietnamese: true/false` để cảnh báo nếu user dùng cho text tiếng Việt.

UI panel text bổ sung:
- `Select` font với preview (mỗi item render bằng chính font đó).
- Group theo loại: Sans / Serif / Display / Script / Mono.
- Filter "Hỗ trợ tiếng Việt".

### B2. Thuộc tính text mở rộng
Thêm vào panel text (Editor):
- **Line height** (slider 0.8 – 2.5)
- **Letter spacing** (slider -5 – 20 px)
- **Italic** toggle (`fontStyle`)
- **Underline / Strike** (`textDecoration`)
- **Text shadow** (color + blur + x + y) — đã có field, thêm UI slider
- **Text stroke** (color + width)
- **Gradient text** (linear, 2 màu, angle) → render qua `background-image: linear-gradient + -webkit-background-clip: text`
- **Max lines** (line-clamp) → tận dụng `style.maxLines`

Cần thêm vào `SlotStyle`: `fontStyle`, `textDecoration`, `gradientFrom`, `gradientTo`, `gradientAngle`.

### B3. Áp dụng cho cả PageRenderer + BindCanvas
Tạo helper `buildTextStyle(style, scale)` trong `dataBinding.ts` (hoặc file mới `textStyle.ts`) — return object CSS chuẩn để 3 nơi (EditorCanvas, BindCanvas, PageRenderer) dùng chung. Tránh lệch render.

---

## C. Designer toolkit cho image & shape (bổ sung)

- **Border**: `borderColor`, `borderWidth`, `borderStyle` (solid/dashed/dotted) — thêm vào `SlotStyle`, áp dụng cho image/shape.
- **Gradient fill cho shape**: `gradientFrom/To/Angle` (chia sẻ field với text).
- **Inner shadow** (optional v2).
- **Aspect lock** khi resize (giữ tỉ lệ nếu Shift) — thêm vào `EditorCanvas.tsx`.
- **Snap to grid / center guides**: khi kéo, hiện đường gióng đỏ tới giữa canvas hoặc cạnh slot khác (đã đề xuất Đợt 3, đẩy lên đây cho gọn).

---

## D. Designer toolkit cấp page

- **Align toolbar** (cho slot đang chọn so với canvas): căn trái/giữa/phải/trên/giữa-dọc/dưới — 1 row 6 button trong panel phải.
- **Distribute** (≥3 slot chọn): chia đều ngang/dọc.
- **Lock/Unlock layer**: nút khoá trong panel Layers (hiện đã có flag `locked`, chưa có toggle UI ngoài upload-bg).
- **Hiển thị/ẩn layer** (visibility toggle) — thêm `style.hidden?: boolean` hoặc dùng `visibilityRule`.
- **Multi-select**: Shift+Click để chọn nhiều layer rồi căn chỉnh đồng loạt (phiên bản đơn giản: chỉ lưu `selectedSlotIds: string[]`).

---

## E. Files dự kiến

- **Sửa**:
  - `src/models/index.ts` — bổ sung `staticImage` cho shape, thêm field style mới (fontStyle, textDecoration, gradient*, border*).
  - `src/engines/binding/dataBinding.ts` — `resolveImageBinding` cho phép shape dùng chung; thêm helper `buildTextStyle`.
  - `src/features/editor/EditorCanvas.tsx` — render ảnh trong shape; aspect lock; snap guides.
  - `src/features/editor/EditorPage.tsx` — panel font picker, text mở rộng, panel ảnh-trong-shape, align toolbar, lock toggle.
  - `src/features/generate/BindCanvas.tsx` — shape selectable + render ảnh; dùng `buildTextStyle`.
  - `src/features/render/PageRenderer.tsx` — render shape có ảnh; dùng `buildTextStyle`.
  - `src/routes/generate.tsx` — bỏ cảnh báo shape, mở `IMAGE_BINDING_OPTIONS` cho shape.
  - `src/routes/__root.tsx` — chèn Google Fonts link.
- **Tạo mới**:
  - `src/features/editor/fonts.ts` — danh mục font + helper.
  - `src/features/editor/FontPicker.tsx` — Select có preview.
  - `src/features/editor/AlignToolbar.tsx` — căn chỉnh.

---

## F. Phạm vi triển khai (chia 2 đợt nhỏ để dễ kiểm thử)

**Đợt A (làm trước, đáp ứng đúng câu hỏi)**
1. Shape bind ảnh được (model + EditorCanvas + BindCanvas + PageRenderer + generate.tsx).
2. Font picker (~30 font) cho text.
3. Text mở rộng: line-height, letter-spacing, italic, underline, stroke, gradient text.
4. Shape: border (color/width/style), gradient fill.

**Đợt B (sau)**
5. Align toolbar + lock/unlock + visibility.
6. Aspect-lock khi resize, snap-to-center guides.
7. Multi-select.

