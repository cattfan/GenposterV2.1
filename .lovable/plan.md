## Mục tiêu

1. **Editor mạnh như công cụ chỉnh sửa ảnh**: thêm crop ảnh, filters (brightness/contrast/saturation/blur), flip, rotate nhanh, opacity, drop shadow, align/distribute, group, lock/unlock, undo/redo, snap/guideline.
2. **Đổ dữ liệu theo kiểu "click-to-bind"**: trên editor, người dùng click vào block muốn nhận data → gán "trường data" (vd: `entity.name`, `entity.address`, `asset.image`). Block nào không gán thì giữ nguyên nội dung tĩnh khi generate. Bỏ flow "section" phức tạp cho luồng cơ bản (vẫn giữ song song).

## Thay đổi chính

### A. Editor — bổ sung thao tác ảnh chuyên nghiệp

**File: `src/features/editor/EditorCanvas.tsx`, `EditorPage.tsx`, `src/models/index.ts**`

- **Mở rộng `SlotStyle**`: thêm `brightness`, `contrast`, `saturate`, `blur`, `hueRotate`, `grayscale`, `flipH`, `flipV`, `shadowColor`, `shadowBlur`, `shadowX`, `shadowY`. Render bằng CSS `filter` + `transform: scale(±1, ±1)`.
- **Crop ảnh**: thêm field `crop?: { x, y, w, h }` (% so với ảnh gốc). Double-click ảnh → mở mode crop với khung kéo riêng, ESC/Enter để thoát.
- **Rotate nhanh**: nút 90° trái/phải trong panel phải; thanh kéo rotate khi block được chọn (handle ở phía trên block).
- **Opacity slider** cho mọi block.
- **Align tools**: align left/center/right/top/middle/bottom so với canvas (toolbar nổi khi chọn block).
- **Snap & guideline**: khi kéo block, hiển thị đường gióng đỏ khi cạnh/tâm trùng cạnh/tâm canvas hoặc block khác (ngưỡng ±6px / zoom).
- **Lock/unlock layer** (icon trong layer list); block lock không kéo/resize được.
- **Undo/Redo** (`Ctrl+Z`, `Ctrl+Shift+Z`): lưu lịch sử `draft` dạng stack tối đa 50 bước.
- **Group/ungroup**: chọn nhiều block (Shift+click) → `Ctrl+G` để group; di chuyển/xoá đồng bộ.

### B. Click-to-bind data

**File mới: `src/engines/binding/dataBinding.ts**` + sửa `EditorCanvas.tsx`, `PageRenderer.tsx`, `generate.ts`

- **Mô hình**: dùng lại field có sẵn `slot.bindingPath`. Không bind = giữ `staticText`/`staticImage`. Có bind = render từ entity.
- **UI bind trong panel phải**:
  - Khi chọn block `text`: dropdown "Nguồn dữ liệu" gồm `Cố định | entity.name | entity.address | entity.phone | entity.priceRange | entity.style | entity.openingHours | entity.categoryMain`. Chọn → hiện badge tím "🔗 entity.name" trên block và preview placeholder `{{entity.name}}`.
  - Khi chọn block `image`: dropdown "Nguồn ảnh" gồm `Cố định (URL/upload) | Ảnh chính của entity | Ảnh role: cover/facade/food_closeup/...`. Lưu vào `slot.bindingPath = "asset.byRole:cover"` và `slot.allowedAssetRoles`.
  - Nút **"Xoá liên kết"** để quay lại tĩnh.
- **Visual cue trên canvas**: block đã bind viền tím nét đứt + chip "🔗 field" góc trên trái; block tĩnh giữ outline cũ.
- **Generate flow mới (`generate.ts`)**:
  - Mỗi page template + 1 entity (lặp qua danh sách entity active đã filter) → 1 page render.
  - Khi render block có `bindingPath`, lấy giá trị từ entity tương ứng; block không bind → giữ nguyên `staticText`/`staticImage`.
  - Nếu page không có block nào bind → render đúng 1 lần (template tĩnh).
- **PageRenderer**: thêm prop `entity?: Entity` + `entityAssets?: Asset[]`; resolver `resolveSlotValue(slot, entity, assets)` xử lý `entity.<field>` và `asset.byRole:<role>` / `asset.cover`.
- **Trang `/generate**`:
  - Bỏ yêu cầu chọn pack phức tạp cho luồng cơ bản: thêm chế độ **"Generate theo entity"** — chọn 1 page template (hoặc pack) + filter entities (category, partner) → preview tất cả page tạo ra.
  - Mỗi card page hiển thị tên entity tương ứng.

### C. Tinh chỉnh nhỏ

- Layer list hiển thị icon 🔗 nếu block có `bindingPath`.
- Lưu template không xoá `bindingPath`.
- Hotkey: `R` = rotate 15°, `[`/`]` = z-index, `Ctrl+D` = duplicate (trừ ảnh nền).

## Sơ đồ luồng đổ dữ liệu

```text
[Editor]
  Block text "Tên quán" ──click──▶ Dropdown chọn entity.name ──▶ slot.bindingPath="entity.name"
  Block image hero ─────click──▶ Dropdown chọn asset role:cover ──▶ slot.bindingPath="asset.byRole:cover"
  Block "Liên hệ" (tĩnh) ──────────────────────────────────▶ giữ nguyên staticText

[Generate]
  entities (đã filter) ──▶ for each entity:
                            renderPage(template, entity, assets[entity])
                            ▼
                          Slot có bindingPath → resolve(entity)
                          Slot không bind   → giữ static
```

## Files dự kiến chỉnh / tạo

- Chỉnh: `src/models/index.ts`, `src/features/editor/EditorPage.tsx`, `src/features/editor/EditorCanvas.tsx`, `src/features/render/PageRenderer.tsx`, `src/engines/selection/generate.ts`, `src/routes/generate.tsx`.
- Tạo: `src/engines/binding/dataBinding.ts` (resolver), `src/features/editor/CropOverlay.tsx`, `src/features/editor/useHistory.ts`.

## Phạm vi ưu tiên (đề xuất chia 2 đợt)

- **Đợt 1 (làm trước)**: filters/opacity/rotate-nhanh/flip + crop cơ bản + undo-redo + click-to-bind (text + image) + generate theo entity.
- **Đợt 2 (sau)**: snap/guideline, group/ungroup, align toolbar, lock layer, hotkey nâng cao.

Xác nhận để mình bắt đầu Đợt 1 nhé.