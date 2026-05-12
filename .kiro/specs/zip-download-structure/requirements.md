# Requirements Document

## Introduction

Tính năng chuẩn hóa cấu trúc file ZIP khi tải bộ ảnh đã tạo từ trang /generate. File ZIP phải tuân thủ quy ước đặt tên và tổ chức thư mục cụ thể, phân biệt giữa trường hợp xuất một bộ (single set) và nhiều bộ (multiple sets). Mỗi bộ bao gồm ảnh PNG đánh số thứ tự, file caption.txt và file doitac.xlsx.

## Glossary

- **ZIP_Builder**: Module xử lý việc tạo file ZIP với cấu trúc thư mục và đặt tên theo quy ước
- **Template_Name**: Tên bộ khuôn mẫu (pack template name), ví dụ: "3N2D", "5N4D_v1"
- **Bundle**: Một bộ ảnh hoàn chỉnh gồm các file PNG, caption.txt và doitac.xlsx
- **Download_Timestamp**: Thời điểm người dùng bấm nút tải, định dạng DD-MM-YYYY-HH-mm
- **Set_Folder**: Thư mục con chứa một bộ ảnh trong trường hợp nhiều bộ, đặt tên "Bo1", "Bo2", v.v.

## Requirements

### Requirement 1: ZIP File Naming Convention

**User Story:** As a content creator, I want the downloaded ZIP file to be named with the template name and download timestamp, so that I can easily identify and organize my generated poster sets.

#### Acceptance Criteria

1. WHEN the user triggers a download, THE ZIP_Builder SHALL name the ZIP file using the pattern `{Template_Name}-{DD}-{MM}-{YYYY}-{HH}-{mm}` where DD, MM, YYYY, HH, mm correspond to the Download_Timestamp
2. WHEN the download contains a single set, THE ZIP_Builder SHALL append the version suffix (e.g. `_v1`) to the Template_Name portion of the ZIP filename
3. WHEN the download contains multiple sets, THE ZIP_Builder SHALL use the Template_Name without a version suffix in the ZIP filename
4. THE ZIP_Builder SHALL use the local time of the user's browser for the Download_Timestamp
5. THE ZIP_Builder SHALL format the timestamp components with zero-padding (e.g. day "04" not "4", hour "09" not "9")

### Requirement 2: Multiple Sets Folder Structure

**User Story:** As a content creator, I want multiple poster sets to be organized in numbered subfolders within the ZIP, so that I can easily distinguish and manage each set separately.

#### Acceptance Criteria

1. WHEN the download contains more than one set, THE ZIP_Builder SHALL create a subfolder for each set named "Bo{N}" where N is the 1-based index of the set
2. WHEN the download contains more than one set, THE ZIP_Builder SHALL place all files for each set inside its corresponding Set_Folder
3. THE ZIP_Builder SHALL number the Set_Folders sequentially starting from 1 (Bo1, Bo2, Bo3, etc.)

### Requirement 3: Single Set Flat Structure

**User Story:** As a content creator, I want a single poster set download to have files at the ZIP root level without subfolders, so that I can access the files directly without navigating into a folder.

#### Acceptance Criteria

1. WHEN the download contains exactly one set, THE ZIP_Builder SHALL place all files at the root level of the ZIP archive without creating any subfolder
2. WHEN the download contains exactly one set, THE ZIP_Builder SHALL NOT create a "Bo1" subfolder

### Requirement 4: Image File Naming Within a Set

**User Story:** As a content creator, I want poster images to be numbered sequentially with simple numeric names, so that the display order is clear and predictable.

#### Acceptance Criteria

1. THE ZIP_Builder SHALL name each poster image file as `{N}.png` where N is the 1-based sequential index of the image within its set
2. THE ZIP_Builder SHALL start numbering from 1 for each set independently
3. THE ZIP_Builder SHALL preserve the original generation order of images when assigning sequential numbers

### Requirement 5: Caption File Inclusion

**User Story:** As a content creator, I want each set to include a caption.txt file with generated captions, so that I have ready-to-use text content for social media posts.

#### Acceptance Criteria

1. THE ZIP_Builder SHALL include a file named "caption.txt" in each Bundle
2. WHEN the download contains multiple sets, THE ZIP_Builder SHALL place caption.txt inside each Set_Folder
3. WHEN the download contains a single set, THE ZIP_Builder SHALL place caption.txt at the ZIP root level
4. THE ZIP_Builder SHALL encode caption.txt using UTF-8 encoding

### Requirement 6: Partner Workbook Inclusion

**User Story:** As a content creator, I want each set to include a doitac.xlsx file listing partner entities, so that I can track which partners are featured in each poster set.

#### Acceptance Criteria

1. THE ZIP_Builder SHALL include a file named "doitac.xlsx" in each Bundle
2. WHEN the download contains multiple sets, THE ZIP_Builder SHALL place doitac.xlsx inside each Set_Folder
3. WHEN the download contains a single set, THE ZIP_Builder SHALL place doitac.xlsx at the ZIP root level
4. THE ZIP_Builder SHALL generate the doitac.xlsx content based on the entities used in the corresponding set

### Requirement 7: Consistent Structure Across Export Modes

**User Story:** As a content creator, I want the ZIP structure to be consistent regardless of whether I export from the pack-based flow or the entity-based flow, so that my workflow remains predictable.

#### Acceptance Criteria

1. WHEN the user exports from the pack-based generation flow (PackTabContent), THE ZIP_Builder SHALL apply the same naming and folder structure rules
2. WHEN the user exports from the entity-based generation flow (single template), THE ZIP_Builder SHALL apply the same naming and folder structure rules
3. IF the Template_Name contains characters not safe for filenames, THEN THE ZIP_Builder SHALL replace unsafe characters with hyphens
