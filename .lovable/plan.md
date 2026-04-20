

## Đã hiểu sheet của bạn

**Cột thực tế (sheet `gid=1236724598`)**: `STT | Ten_quan | Mo_hinh | Dia_chi | Gio_mo_cua | Phong_cach | Doi_tac | Mon_an_noi_bat`

- **`Mo_hinh`** = bữa ăn (`Ăn Sáng / Ăn Trưa / Ăn Tối`) → đây sẽ là "danh mục" để lọc.
- **`Phong_cach`** = `Vintage / Hiện đại / Hàn Quốc / Nhật Bản / Châu Âu / Tây nguyên`.
- **`Doi_tac`** = `X` nghĩa là đối tác (rỗng = không). Ví dụ: STT 33, 34, 35, 46.
- **`Mon_an_noi_bat`** = trường mô tả/highlight món.
- Tổng ~98 quán, không có cột giá / SĐT.

## Điều chỉnh plan (so với plan trước)

### A. Mapping & alias (`src/engines/normalize/aliases.ts`, `normalizer.ts`)
Bổ sung alias để auto-map đúng cột tiếng Việt:
- `Ten_quan → name`
- `Mo_hinh → categoryMain` (bữa ăn)
- `Phong_cach → categorySub` (phong cách)
- `Dia_chi → address`
- `Gio_mo_cua → openingHours`
- `Doi_tac → partnerFlag` (đã hỗ trợ `X / x / 1 / true`)
- `Mon_an_noi_bat → metadata.signatureDish` (trường tự do, dùng cho bind text)

### B. Sheet name & nguồn dữ liệu
- Thêm `Entity.sheetName?: string` trong `models/index.ts`.
- Trang `/data` (import): thêm input **"Tên sheet"** (mặc định = `gid` hoặc tên file, ví dụ `Quan_an`). Ghi vào mọi entity của lần import đó.
- Bảng entities thêm cột "Sheet". Append theo sheet (dedupe `name + sheetName`), không xoá sheet khác.

### C. Trang `/generate` — chọn sheet + ưu tiên đối tác
Trong cột "Cấu hình":
1. `Select` **Nguồn dữ liệu (sheet)**: `Tất cả | Quan_an | <các sheet đã import>`.
2. `Select` **Lọc theo `Mo_hinh`**: `Tất cả | Ăn Sáng | Ăn Trưa | Ăn Tối` (lấy từ `categoryMain` distinct).
3. `Select` **Lọc theo `Phong_cach`** (optional).
4. Switch **Ưu tiên đối tác** (mặc định ON).
5. Switch **Chỉ đối tác**.
6. Input **Số trang tối đa**.

**Thuật toán hiển thị**:
```text
filteredEntities = entities
  .filter(status=active
        + sheetName == selectedSheet (nếu khác Tất cả)
        + categoryMain == Mo_hinh (nếu chọn)
        + categorySub == Phong_cach (nếu chọn)
        + partnerFlag (nếu Chỉ đối tác))
  .sort( ưu-tiên-đối-tác ?
            partnerFlag desc → partnerPriority desc → name asc
          : name asc )
  .slice(0, maxPages)

For each entity → render(template + bindOverrides, entity)
```

### D. Bind panel — thêm field mới
Dropdown "Nguồn dữ liệu" cho text bổ sung:
- `entity.name` (Ten_quan)
- `entity.categoryMain` (Mo_hinh)
- `entity.categorySub` (Phong_cach)
- `entity.address` (Dia_chi)
- `entity.openingHours` (Gio_mo_cua)
- **`entity.signatureDish`** (Mon_an_noi_bat) — resolver lấy từ `metadata.signatureDish`.

### E. UI hiển thị đối tác
- Badge `<Star className="size-3" />` + chữ "Đối tác" trước tên entity trong dropdown preview & card kết quả.
- Trong canvas BindCanvas, không đổi gì.

## Files đụng tới
- Sửa: `src/models/index.ts`, `src/engines/normalize/aliases.ts`, `src/engines/normalize/normalizer.ts`, `src/routes/data.tsx`, `src/routes/generate.tsx`, `src/engines/binding/dataBinding.ts` (thêm resolver `entity.signatureDish`).
- Không cần file mới.

## Lưu ý cho bạn
- Sheet hiện tại chỉ chứa **1 tab** (`Quan_an`). Khi có thêm tab `Cafe`, bạn import lần nữa với "Tên sheet" = `Cafe` → dropdown Nguồn dữ liệu sẽ tự xuất hiện thêm lựa chọn.
- Hiện sheet không có cột `priceRange / phone` → 2 field này khi bind sẽ trống. Nếu cần, bạn thêm cột vào sheet và import lại.

