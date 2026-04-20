

## Kế hoạch triển khai (A+B song song)

### Đợt A — Designer dựng tay + Sheet import + Preset 4N3Đ

**A1. Mở rộng model Section**
- `src/models/index.ts`: thêm
  - `Section.filterRules?: Array<{ field: string; op: "eq"|"in"|"gte"|"lte"|"contains"; value: string|number|string[] }>`
  - `Section.layoutMode?: "stack" | "zigzag" | "grid"` (default `stack`)
  - `Entity.metadata?: Record<string, string|number>` (đã có hoặc bổ sung) để chứa cột tuỳ ý từ sheet (vd `day`, `priceUsd`).

**A2. Selection engine hỗ trợ filter & layout**
- `src/engines/selection/engine.ts`: sau bước filter category, áp `filterRules` (đọc từ `entity.metadata` hoặc field gốc). Hỗ trợ op `eq/in/gte/lte/contains`.
- Trả thêm `layoutMode` cho renderer dùng.

**A3. Renderer item card zigzag**
- `src/features/render/PageRenderer.tsx` + `src/features/generate/BindCanvas.tsx`: khi section `layoutMode==="zigzag"`, ở mỗi item lẻ thì swap vị trí cụm ảnh ↔ cụm text theo trục X. Logic: nhân bản slot template của section item, tính `xOffset` theo index chẵn/lẻ.
- Thêm field `Section.itemTemplate` (gồm subset slot có `role: "itemImage" | "itemTitle" | "itemAddress" | "itemPriceBadge"`) để biết slot nào lật.

**A4. Item card preset trong editor**
- `src/features/editor/EditorPage.tsx` + `EditorCanvas.tsx`: thêm nút **"Chèn item card"** trong toolbar Insert. Sinh nhóm 4 slot có `role` đúng quy ước, group sẵn để designer di chuyển 1 cụm.
- 2 variant: ảnh-trái, ảnh-phải (zigzag tự lo khi render).

**A5. Badge giá preset**
- Cùng nút "Chèn item card" tự thêm shape rectangle bo tròn cao + fill cam (`#F97316`) + text trắng bind `entity.metadata.price`.
- Bổ sung preset "Header badge ngày" (rectangle đỏ + text "NGÀY {{day}} - ${{total}}").

**A6. Import từ Google Sheet URL**
- `src/features/data/parsers.ts`: thêm `parseSheetUrl(url: string): Promise<Row[]>`.
  - Detect URL dạng `docs.google.com/spreadsheets/d/{id}/edit#gid={gid}` → convert thành `https://docs.google.com/spreadsheets/d/{id}/export?format=csv&gid={gid}` → fetch → parse CSV bằng logic hiện tại.
  - Vì cần CORS, dùng **server function** `fetchSheetCsv` (`src/server/sheetFetch.ts`, `createServerFn`) để fetch server-side rồi trả CSV text về client.
- `src/routes/data.tsx`: thêm input URL + nút "Import từ Google Sheet" cạnh nút upload CSV hiện tại.

**A7. Aliases tiếng Việt cho cột phổ biến**
- `src/engines/normalize/aliases.ts`: bổ sung
  - `name`: `tên`, `tên địa điểm`, `tên homestay`
  - `address`: `địa chỉ`, `vị trí`
  - `price`: `giá`, `chi phí`, `cost`
  - `day`: `ngày`, `day`
  - `category`: `loại`, `nhóm`
  - `image`: `ảnh`, `hình`, `link ảnh`

**A8. Seed pack "Lịch trình du lịch" (linh hoạt)**
- `src/storage/seed.ts`: thêm pack `travel_itinerary_flex` gồm 2 page mặc định:
  - **Cover**: background placeholder + 2 textbox (tiêu đề + sub).
  - **Tiện ích**: 3 section (transport/homestay/other) với `filterRules: [{field:"category", op:"eq", value:"..."}]`, layoutMode `stack`.
- Thêm **page template stand-alone** `day_template_zigzag` để designer **nhân bản** cho mỗi ngày tour (1 → N). Page có sẵn: badge header "NGÀY {{day}} - ${{total}}" + section bind `filterRules: [{field:"day", op:"eq", value:"{{dayNumber}}"}]` layoutMode `zigzag` + 6 item card.
- Trang `/packs` hoặc `/templates`: thêm action "Nhân bản page Ngày" để clone page template với `dayNumber` mới.

---

### Đợt B — AI gen template + auto-bind + AI caption

**B1. Server function `aiGenerateTemplateFromImage`**
- File mới `src/server/aiTemplate.ts` dùng `createServerFn({method:"POST"})`.
- Input: `{ imageDataUrl: string, canvasSize?: {w,h} }`.
- Gọi Lovable AI Gateway (`google/gemini-2.5-pro`) với image + tool calling JSON schema:
  ```ts
  parameters: {
    canvas: { w: number, h: number, bgColor?: string },
    slots: Array<{
      kind: "text"|"shape"|"image",
      x: number, y: number, w: number, h: number, // 0-1 relative
      placeholder?: string, // "{{tên}}", "{{địa chỉ}}", "{{giá}}", "{{ngày}}"...
      style?: { fontSize?, fontWeight?, color?, fill?, borderRadius?, fontFamily? }
    }>
  }
  ```
- Prompt cứng: *"Bạn CHỈ tạo khung layout và placeholder. KHÔNG bịa nội dung text thật. Mọi text phải là placeholder dạng `{{tên}}`, `{{địa chỉ}}`, `{{giá}}`, `{{ngày}}`. Không tạo bindingPath."*

**B2. Parser JSON → PageTemplate**
- `src/features/ai/templateFromImage.ts`: convert AI JSON → `PageTemplate` (canvas size scale lên 1080×1920 portrait), tạo slot với `staticText` = placeholder string. KHÔNG set `bindingPath`.

**B3. UI "AI dựng từ ảnh mẫu"**
- `src/routes/templates.tsx`: nút "AI dựng từ ảnh" → upload ảnh → gọi server fn → tạo template mới → mở thẳng `/templates/$id/edit`.

**B4. AI auto-bind suggest**
- Server fn `aiSuggestBindings({ slots, columns })` — nhận danh sách slot (id + staticText placeholder + role) + danh sách cột sheet → trả `Array<{ slotId, suggestedBindingPath, confidence }>`.
- Trong `/generate`, sau khi chọn template + có entity data: nút "Gợi ý bind tự động" → hiện modal preview suggestion → designer nhấn "Áp dụng" mỗi dòng (hoặc "Áp dụng tất cả").

**B5. AI caption từ data thật**
- Server fn `aiCaptionFromEntity({ entity, style: "instagram"|"threads"|"facebook" })`.
- Prompt: *"Viết caption {style} dựa CHỈ trên data cung cấp. KHÔNG thêm thông tin bịa. Format: 2-3 dòng + 5 hashtag liên quan."* Truyền entity JSON (name, address, price, category, day, description nếu có).
- UI: `/generate` panel binding text — nút "AI caption" cho slot text dài (vd subtitle/description). Đổ kết quả vào `slot.staticText` (override).

**B6. Bật Lovable Cloud + AI Gateway**
- Cần `LOVABLE_API_KEY`. Sẽ check `fetch_secrets`; nếu chưa có → bật Cloud trước khi gọi server fn.

---

### Files đụng tới

**Sửa:**
- `src/models/index.ts` — `Section.filterRules`, `layoutMode`, `Entity.metadata`
- `src/engines/selection/engine.ts` — apply filterRules
- `src/engines/normalize/aliases.ts` — VN aliases
- `src/features/data/parsers.ts` — `parseSheetUrl`
- `src/features/render/PageRenderer.tsx`, `src/features/generate/BindCanvas.tsx` — render zigzag
- `src/features/editor/EditorPage.tsx`, `EditorCanvas.tsx` — nút "Chèn item card", "Chèn header badge"
- `src/storage/seed.ts` — seed pack flex + page template ngày
- `src/routes/data.tsx` — input Google Sheet URL
- `src/routes/templates.tsx` — nút "AI dựng từ ảnh"
- `src/routes/generate.tsx` — nút "Gợi ý bind tự động" + "AI caption"

**Tạo mới:**
- `src/server/sheetFetch.ts` — `createServerFn` fetch CSV từ Google Sheet
- `src/server/aiTemplate.ts` — `aiGenerateTemplateFromImage`, `aiSuggestBindings`, `aiCaptionFromEntity`
- `src/features/ai/templateFromImage.ts` — JSON → PageTemplate parser
- `src/features/ai/SuggestBindingsModal.tsx` — UI preview suggestions

### Thứ tự triển khai
1. **A1+A2+A3** — model + selection + render zigzag (nền tảng cho mọi thứ).
2. **A6+A7** — sheet import (để có data thật chạy thử).
3. **A8+A4+A5** — seed pack flex + nút chèn item card / badge.
4. **B6** — bật Lovable Cloud / verify `LOVABLE_API_KEY`.
5. **B1+B2+B3** — AI gen template từ ảnh.
6. **B4** — AI auto-bind suggest.
7. **B5** — AI caption từ data thật.

