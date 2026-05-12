# Requirements Document

## Introduction

Tái thiết kế toàn diện UI/UX cho các tính năng thiết kế của ứng dụng GenPoster, bao gồm Design Workspace (editor khuôn mẫu) và Pack Generate (trang đổ dữ liệu). Mục tiêu là đạt chuẩn trải nghiệm ngang Canva/Figma: giao diện gọn gàng, dễ tiếp cận, thao tác nhanh, trực quan. Giữ nguyên data model và các workflow hiện có — chỉ thay đổi lớp giao diện và tương tác.

## Glossary

- **Design_Workspace**: Editor chính để tạo/chỉnh sửa khuôn mẫu trang poster (src/features/editor/)
- **Pack_Generate**: Trang /generate nơi người dùng đổ dữ liệu entity vào khuôn để tạo bộ ảnh hàng loạt
- **Canvas**: Vùng vẽ trung tâm hiển thị khuôn mẫu với các khối (slots/elements)
- **Inspector**: Panel bên phải chứa các thuộc tính của khối đang được chọn
- **Toolbar**: Thanh công cụ chứa các hành động chính (chèn khối, căn chỉnh, xuất ảnh)
- **Block / Slot / Element**: Một đơn vị nội dung trên canvas (text, image, shape, line)
- **Binding_Panel**: Panel chọn trường dữ liệu để liên kết vào slot
- **Design_Token**: Hệ thống biến CSS cho màu, spacing, typography, radius, shadow
- **Command_Palette**: Cửa sổ Ctrl+K để truy cập mọi chức năng qua tìm kiếm nhanh

## Requirements

### Requirement 1: Hệ thống Design Tokens thống nhất

**User Story:** Là nhà thiết kế sử dụng app, tôi muốn giao diện có hệ thống màu, khoảng cách, kích thước chữ nhất quán xuyên suốt mọi màn hình, để cảm giác mượt mà và chuyên nghiệp.

#### Acceptance Criteria

1. THE Design_Token system SHALL định nghĩa một bảng màu thống nhất với các biến: primary, secondary, background, surface, border, muted, destructive, success, warning — mỗi biến có biến thể foreground tương ứng.
2. THE Design_Token system SHALL định nghĩa thang spacing (4, 8, 12, 16, 20, 24, 32, 48) và áp dụng nhất quán cho padding/margin/gap của tất cả panel và component trong Design_Workspace và Pack_Generate.
3. THE Design_Token system SHALL định nghĩa thang typography (xs=12, sm=13, base=14, lg=16, xl=18, 2xl=24) và line-height, font-weight chuẩn.
4. THE Design_Token system SHALL định nghĩa radius (sm=4, md=6, lg=8, xl=12) và shadow (sm, md, lg) dùng chung.
5. WHEN người dùng chuyển giữa Design_Workspace và Pack_Generate, THE giao diện SHALL giữ nguyên phong cách thị giác (font, màu, radius) để không gây cảm giác đứt gãy.

### Requirement 2: Ngôn ngữ và nhãn thống nhất

**User Story:** Là người dùng Việt Nam, tôi muốn mọi nhãn, tooltip, thông báo đều bằng tiếng Việt tự nhiên, để không phải đoán nghĩa hay nhầm lẫn.

#### Acceptance Criteria

1. THE hệ thống SHALL dịch tất cả nhãn nút, tooltip, tiêu đề panel, placeholder, thông báo toast sang tiếng Việt nhất quán trong Design_Workspace và Pack_Generate.
2. IF một thuật ngữ kỹ thuật chưa có từ tiếng Việt phổ thông (ví dụ "slot", "binding"), THEN hệ thống SHALL dùng từ tương đương dễ hiểu ("khối", "liên kết dữ liệu") và giữ nhất quán toàn app.
3. THE thông báo lỗi SHALL nêu rõ nguyên nhân và hành động cần làm, ví dụ "Chưa chọn bộ khuôn - bấm vào danh sách bên trái để chọn".

### Requirement 3: Layout 3 panel với collapse

**User Story:** Là nhà thiết kế, tôi muốn canvas trung tâm được tối đa không gian và có thể thu gọn panel bên khi cần tập trung, để làm việc với template lớn dễ dàng hơn.

#### Acceptance Criteria

1. THE Design_Workspace SHALL bố trí 3 vùng: panel trái (layers/pages/assets), canvas trung tâm, panel phải (inspector).
2. THE panel trái và panel phải SHALL có nút thu gọn/mở rộng, ghi nhớ trạng thái trong localStorage theo user.
3. WHEN panel được thu gọn, THE panel SHALL thu về một thanh thẳng đứng chỉ hiện icon, bấm vào icon sẽ mở lại.
4. THE canvas trung tâm SHALL tự động giãn ra khi panel bên được thu gọn, mà không cần reload.
5. THE layout SHALL hỗ trợ kéo thanh chia (splitter) để tuỳ chỉnh độ rộng panel, lưu kích thước theo user.
6. WHEN kích thước màn hình nhỏ hơn 1280px, THE panel phải SHALL chuyển thành popover/drawer để không chiếm canvas.

### Requirement 4: Toolbar trên cùng theo ngữ cảnh

**User Story:** Là nhà thiết kế, tôi muốn thanh công cụ phía trên hiển thị các hành động phù hợp với loại khối đang chọn, để không phải đi tìm trong các menu lồng nhau.

#### Acceptance Criteria

1. THE toolbar trên cùng SHALL hiển thị nhóm hành động cố định bên trái: chọn công cụ (chọn / text / hình / ảnh / line) và undo/redo.
2. THE toolbar trên cùng SHALL hiển thị nhóm hành động theo ngữ cảnh ở giữa khi có khối được chọn: text (font, cỡ chữ, đậm, nghiêng, màu chữ), hình (màu nền, viền), ảnh (thay thế, cắt, fit).
3. THE toolbar SHALL hiển thị ở bên phải các nút chính: lưu, xuất PNG/ZIP, chia sẻ/xem lại.
4. WHEN không có khối nào được chọn, THE toolbar giữa SHALL ẩn thay vì hiển thị các ô trống.
5. WHEN nhiều khối khác loại được chọn, THE toolbar giữa SHALL chỉ hiện các hành động chung (căn chỉnh, nhóm, z-index, xoá).
6. THE toolbar SHALL có chiều cao tối đa 56px để không chiếm không gian dọc quá nhiều.

### Requirement 5: Panel trái - Layers, Pages, Assets

**User Story:** Là nhà thiết kế, tôi muốn quản lý các khối, các trang, và thư viện ảnh trong một panel tích hợp, để không phải chuyển tab nhiều lần.

#### Acceptance Criteria

1. THE panel trái SHALL có 3 tab: "Lớp" (Layers), "Trang" (Pages), "Thư viện" (Assets).
2. THE tab "Lớp" SHALL hiển thị cây phân cấp các khối theo z-index, mỗi item có: icon loại khối, tên, nút ẩn/hiện, nút khoá.
3. THE tab "Lớp" SHALL hỗ trợ kéo thả để sắp xếp lại thứ tự z-index.
4. WHEN người dùng chọn một item trong tab "Lớp", THE canvas SHALL cuộn đến và highlight khối đó.
5. THE tab "Trang" SHALL hiển thị thumbnail các trang của template, hỗ trợ thêm, xoá, sao chép, đổi thứ tự.
6. THE tab "Thư viện" SHALL hiển thị lưới ảnh đã upload, hỗ trợ tìm kiếm theo tên và kéo thả vào canvas.
7. THE panel trái SHALL có chiều rộng tối thiểu 240px, tối đa 400px, mặc định 280px.

### Requirement 6: Panel phải - Inspector có nhóm thu gọn

**User Story:** Là nhà thiết kế, tôi muốn chỉnh thuộc tính khối được chọn trong một panel phân nhóm rõ ràng, để tìm nhanh thuộc tính cần chỉnh.

#### Acceptance Criteria

1. THE inspector SHALL phân nhóm thuộc tính thành các accordion: "Vị trí & Kích thước", "Kiểu chữ", "Màu & Nền", "Viền & Bo góc", "Hiệu ứng" (bóng, blur, opacity), "Dữ liệu" (binding), "Nâng cao".
2. THE mỗi nhóm accordion SHALL ghi nhớ trạng thái mở/đóng trong localStorage theo user.
3. WHEN một khối text được chọn, THE nhóm "Kiểu chữ" SHALL mặc định mở và các nhóm khác đóng.
4. WHEN một khối image được chọn, THE nhóm "Viền & Bo góc" và "Hiệu ứng" SHALL mặc định mở.
5. THE inspector SHALL hiển thị tên/ID khối ở đầu panel với khả năng đổi tên inline.
6. THE inspector SHALL có ô giá trị số với bước nhảy 1/10/100 khi giữ Shift/Alt+arrow, và hỗ trợ công thức cơ bản (+ - * /).
7. WHEN chọn nhiều khối, THE inspector SHALL hiển thị giá trị chung; ô có giá trị khác nhau hiển thị "—" và khi nhập mới sẽ áp cho tất cả.

### Requirement 7: Canvas - Chọn, kéo, resize mượt mà

**User Story:** Là nhà thiết kế, tôi muốn các thao tác chuột trên canvas (chọn, kéo, resize, xoay) cảm giác nhanh nhạy và chính xác, để không bị gián đoạn dòng chảy sáng tạo.

#### Acceptance Criteria

1. WHEN người dùng kéo handle resize, THE khối SHALL cập nhật kích thước theo thời gian thực với FPS >= 50 trên máy tiêu chuẩn (4GB RAM, laptop 2020).
2. THE canvas SHALL hỗ trợ snap tới guide, tới biên khối khác, và tới tâm canvas khi giữ khoảng cách < 8px.
3. WHEN giữ phím Shift trong khi kéo resize, THE khối SHALL giữ tỉ lệ khung hình gốc.
4. WHEN giữ phím Alt trong khi kéo resize, THE khối SHALL resize đối xứng qua tâm.
5. THE canvas SHALL hỗ trợ marquee selection (kéo chọn vùng) khi click vào nền trống.
6. THE canvas SHALL hiển thị đường guide màu đỏ khi khối đang kéo thẳng hàng với khối khác.
7. THE khối line/divider SHALL chỉ hiện 2 handle resize ở 2 đầu (trái/phải), không cho kéo chiều dọc.
8. WHEN kéo để chọn nhiều khối, THE ngưỡng kích hoạt SHALL là 4px di chuyển để tránh nhầm với click đơn.

### Requirement 8: Zoom và Pan trực quan

**User Story:** Là nhà thiết kế, tôi muốn zoom và di chuyển canvas dễ dàng bằng chuột/trackpad/phím tắt, để làm việc chi tiết trên template lớn.

#### Acceptance Criteria

1. THE canvas SHALL hỗ trợ zoom bằng Ctrl+Scroll (hoặc pinch trên trackpad) với mức từ 10% đến 500%.
2. THE canvas SHALL hỗ trợ pan bằng giữ Space + kéo, hoặc nút giữa chuột.
3. THE thanh zoom dưới canvas SHALL hiển thị % hiện tại và nút +/-, "Vừa màn hình" (Ctrl+0), "100%" (Ctrl+1).
4. WHEN zoom, THE canvas SHALL giữ điểm dưới con trỏ chuột làm tâm zoom.
5. THE trạng thái zoom và pan SHALL lưu theo session (sessionStorage) nhưng reset về "vừa màn hình" khi mở template mới.

### Requirement 9: Command Palette Ctrl+K

**User Story:** Là người dùng thạo phím, tôi muốn truy cập mọi chức năng bằng Command Palette, để không phải rời tay khỏi bàn phím.

#### Acceptance Criteria

1. THE hệ thống SHALL có Command Palette mở bằng Ctrl+K (hoặc Cmd+K trên Mac) ở cả Design_Workspace và Pack_Generate.
2. THE Command Palette SHALL tìm kiếm fuzzy qua danh sách lệnh gồm: chèn khối, căn chỉnh, xuất, chuyển trang, chọn công cụ, tìm entity, chọn binding, v.v.
3. THE mỗi lệnh SHALL hiển thị tên tiếng Việt, icon, phím tắt tương đương (nếu có).
4. WHEN chọn một lệnh, THE Command Palette SHALL đóng và thực thi lệnh ngay.
5. THE Command Palette SHALL nhớ 10 lệnh gần nhất và hiển thị lên đầu khi mở.

### Requirement 10: Hệ thống phím tắt thống nhất

**User Story:** Là người dùng chuyên nghiệp, tôi muốn có phím tắt cho mọi thao tác phổ biến, để làm việc nhanh hơn.

#### Acceptance Criteria

1. THE hệ thống SHALL hỗ trợ các phím tắt: Ctrl+Z/Y (undo/redo), Ctrl+S (lưu), Ctrl+C/V/X (copy/paste/cut), Ctrl+D (nhân bản), Delete/Backspace (xoá), Ctrl+A (chọn tất cả).
2. THE hệ thống SHALL hỗ trợ phím công cụ: V (chọn), T (text), R (hình chữ nhật), L (line), I (ảnh), H (pan mode).
3. THE hệ thống SHALL hỗ trợ di chuyển khối bằng arrow keys (1px) và Shift+arrow (10px).
4. THE hệ thống SHALL hỗ trợ Ctrl+G/Ctrl+Shift+G (nhóm/tách nhóm), Ctrl+] (đưa lên trên), Ctrl+[ (đưa xuống dưới).
5. THE một dialog "Phím tắt" SHALL hiện bằng phím "?" hoặc qua Command Palette, liệt kê tất cả phím tắt theo nhóm.

### Requirement 11: Pack Generate - Wizard 3 bước rõ ràng

**User Story:** Là biên tập viên, tôi muốn trang đổ dữ liệu dẫn dắt qua 3 bước rõ ràng: chọn khuôn, đổ dữ liệu, xem và xuất — để không bị choáng ngợp bởi quá nhiều tuỳ chọn.

#### Acceptance Criteria

1. THE Pack_Generate SHALL chia giao diện thành 3 bước hiển thị ở header: "1. Chọn bộ khuôn", "2. Đổ dữ liệu", "3. Xem & xuất".
2. THE chỉ báo bước SHALL cho biết bước hiện tại, các bước đã hoàn thành, và chỉ cho phép nhảy tới các bước đã đủ điều kiện.
3. WHEN người dùng ở bước 1, THE giao diện SHALL hiển thị lưới các pack template với thumbnail, tên, mô tả, và nút chọn.
4. WHEN người dùng ở bước 2, THE giao diện SHALL hiển thị: canvas preview trung tâm, panel trái chọn khối, panel phải chọn trường dữ liệu / entity.
5. WHEN người dùng ở bước 3, THE giao diện SHALL hiển thị lưới tất cả trang đã tạo, nhóm theo bộ, với các nút xuất ZIP toàn bộ hoặc từng bộ.
6. WHEN chưa chọn pack ở bước 1, THE các bước 2 và 3 SHALL bị khoá và hiển thị thông báo hướng dẫn.

### Requirement 12: Pack Generate - Panel đổ dữ liệu gọn

**User Story:** Là biên tập viên, tôi muốn gắn trường dữ liệu vào khối trong 2 click, để tạo được nội dung nhanh.

#### Acceptance Criteria

1. WHEN chọn một khối text trên canvas, THE panel phải SHALL hiển thị trực tiếp danh sách trường văn bản (Tên, Địa chỉ, SĐT, ...) theo nhóm, với ô preview giá trị của entity đang xem.
2. WHEN chọn một khối image trên canvas, THE panel phải SHALL hiển thị các lựa chọn ảnh (Ảnh ngẫu nhiên quán, Ảnh theo vai trò, Ảnh toàn hệ thống) và sample grid.
3. THE panel đổ dữ liệu SHALL có ô tìm kiếm trường, với fuzzy search theo nhãn tiếng Việt.
4. WHEN click vào một trường, THE binding SHALL được áp ngay (không cần nút "Áp dụng") và canvas cập nhật trong <200ms.
5. THE nút "Xem trước entity khác" SHALL là dropdown ở đỉnh panel để chuyển nhanh giữa các entity mẫu.
6. THE panel SHALL hiển thị số khối đã bind và khối chưa bind, với nút "Xem các khối chưa bind" để jump nhanh.

### Requirement 13: Pack Generate - Xem kết quả dạng lưới thông minh

**User Story:** Là biên tập viên, tôi muốn xem tất cả các bộ ảnh đã tạo trong một lưới có thể lọc, sắp xếp, chọn nhiều — để duyệt và xuất nhanh.

#### Acceptance Criteria

1. THE màn hình "Xem & xuất" SHALL hiển thị lưới trang theo nhóm "Bộ 1", "Bộ 2", ... với thumbnail, tên entity, partner badge.
2. THE lưới SHALL có bộ lọc: tất cả, đã chọn, có lỗi, có đối tác.
3. THE mỗi trang SHALL có checkbox "Chọn xuất" và nút "Sửa nhanh" (mở editor inline).
4. THE thanh hành động trên đầu SHALL có: "Chọn hết", "Bỏ chọn hết", "Xuất ZIP" (dùng cho các trang đã tick).
5. WHEN có nhiều hơn 40 trang, THE lưới SHALL dùng virtualization để giữ FPS mượt.
6. THE nút "Xuất ZIP bộ này" SHALL có ở mỗi nhóm "Bộ N" để xuất riêng bộ đó.

### Requirement 14: Thông báo và feedback trực quan

**User Story:** Là người dùng, tôi muốn nhận phản hồi rõ ràng cho mọi thao tác, để biết lệnh đã được nhận và đang xử lý.

#### Acceptance Criteria

1. WHEN người dùng bấm một nút xuất ZIP, THE hệ thống SHALL hiện toast "Đang xuất N trang..." ngay lập tức và toast kết quả khi xong.
2. THE các thao tác chậm >300ms SHALL có progress indicator (spinner hoặc progress bar) trong khu vực tương ứng.
3. WHEN thao tác thất bại, THE toast lỗi SHALL có nút "Thử lại" nếu thao tác có thể retry được.
4. THE undo/redo SHALL có toast ngắn xác nhận "Đã hoàn tác" / "Đã làm lại" với tên thao tác vừa xảy ra.
5. THE các hành động huỷ bỏ (xoá, reset) SHALL có confirm dialog hoặc toast "Hoàn tác?" với nút hoàn tác trong 5 giây.

### Requirement 15: Accessibility cơ bản

**User Story:** Là người dùng có nhu cầu hỗ trợ tiếp cận, tôi muốn app có thể điều hướng bằng bàn phím và có độ tương phản đủ, để sử dụng thoải mái.

#### Acceptance Criteria

1. THE mọi nút và input SHALL có `aria-label` hoặc nội dung text rõ ràng, không dựa chỉ vào icon.
2. THE focus ring SHALL rõ ràng trên tất cả element có thể focus (border 2px primary).
3. THE màu chữ trên nền SHALL có độ tương phản tối thiểu WCAG AA (4.5:1 cho text thường).
4. THE các dialog SHALL trap focus và đóng khi nhấn Esc.
5. THE thứ tự tab SHALL hợp lý từ trên xuống, trái sang phải.

### Requirement 16: Hiệu năng và mượt mà

**User Story:** Là người dùng làm việc với template lớn (40+ trang), tôi muốn app không bị lag khi thao tác, để duy trì năng suất.

#### Acceptance Criteria

1. WHEN mở Pack_Generate với 40 trang đã sinh, THE thời gian load đầu tiên SHALL dưới 2 giây.
2. THE scroll và zoom canvas SHALL giữ >= 50 FPS trên máy cấu hình trung bình.
3. THE re-render khi chọn khối hoặc đổi inspector SHALL dưới 100ms.
4. THE danh sách layers với 100+ khối SHALL được virtualize để giữ smooth scroll.
5. THE ảnh thumbnail trang SHALL được lazy load, chỉ render trang đang hiển thị trong viewport.

### Requirement 17: Dark mode tuỳ chọn

**User Story:** Là người dùng hay làm việc vào buổi tối, tôi muốn có chế độ tối cho giao diện thiết kế, để đỡ mỏi mắt.

#### Acceptance Criteria

1. THE hệ thống SHALL có nút toggle theme sáng/tối/hệ thống ở header hoặc menu cài đặt.
2. THE canvas nền SHALL luôn giữ màu trung tính (xám nhạt ở light, xám đậm ở dark) để không ảnh hưởng việc đánh giá màu thiết kế.
3. THE dark mode SHALL dùng design tokens CSS variables và không cần reload trang khi chuyển.
4. THE tuỳ chọn theme SHALL lưu trong localStorage theo user.

### Requirement 18: Bảo toàn dữ liệu và workflow hiện tại

**User Story:** Là người đã có template và data trong app, tôi muốn việc redesign không làm mất dữ liệu hay break các workflow đang hoạt động.

#### Acceptance Criteria

1. THE redesign SHALL không thay đổi schema của các bảng IndexedDB (designDocuments, pageTemplates, packTemplates, jobs, v.v.).
2. THE các API và type definitions trong src/models/index.ts SHALL giữ nguyên backward compatible.
3. THE các workflow hiện có SHALL tiếp tục hoạt động: tạo template → chọn pack → đổ dữ liệu → xuất ZIP.
4. THE các preset và bind overrides đã lưu SHALL load được sau khi redesign.
5. IF có breaking change không thể tránh, THEN hệ thống SHALL có migration logic chạy khi mở app lần đầu sau update.

### Requirement 19: Triển khai theo giai đoạn

**User Story:** Là chủ dự án, tôi muốn redesign được chia thành các pha để vừa làm vừa dùng, tránh tình trạng app hỏng nhiều tuần.

#### Acceptance Criteria

1. THE dự án redesign SHALL chia làm 3 pha: (A) Design tokens + layout khung + toolbar, (B) Inspector + canvas interactions, (C) Pack Generate wizard + polish.
2. THE mỗi pha SHALL có thể merge độc lập và app vẫn chạy được sau mỗi pha.
3. THE các thành phần đã refactor SHALL có feature flag nếu cần (ví dụ `VITE_NEW_UI=1`) để bật/tắt khi dev.
4. THE cuối mỗi pha SHALL có bản build được và test pass cho các workflow chính.
