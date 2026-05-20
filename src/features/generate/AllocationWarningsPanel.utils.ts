// Pure helpers cho AllocationWarningsPanel — tách file để component .tsx chỉ
// export component (giúp react-refresh fast refresh, đồng thời dễ test parser
// riêng mà không cần JSX environment).
//
// Allocator (`allocateEntityBindingsForTemplate`) trả mảng string warning thô
// kiểu:
//   - 'Page "<name>": khong du doi tac de dat quota X/trang.'
//   - 'Page "<name>": khong du entity de gan du lieu.'
// Hàm này phân loại + format VN cho UI.

export interface ParsedWarning {
  level: "warning" | "info";
  label: string;
  detail: string;
  /** Optional gợi ý cách xử lý — hiển thị nhỏ dưới detail trong UI. */
  hint?: string;
}

const PARTNER_QUOTA_HINT =
  "Cách xử lý: giảm 'Số đối tác/trang' trong Cấu hình, hoặc mở rộng nguồn dữ liệu (Sheet/Mô hình/Phong cách) để có thêm đối tác, hoặc tắt 'Ưu tiên dữ liệu đối tác'.";

const ENTITY_SHORTAGE_HINT =
  "Cách xử lý: mở rộng nguồn dữ liệu, giảm số trang/khung trong bộ, hoặc tăng pool entity sẵn dùng.";

export function parseWarning(raw: string): ParsedWarning {
  if (raw.includes("khong du doi tac")) {
    const quotaMatch = raw.match(/quota\s*(\d+)\s*\/\s*trang/i);
    return {
      level: "warning",
      label: "Thiếu đối tác cho quota",
      detail: quotaMatch
        ? `Pool dữ liệu không đủ ${quotaMatch[1]} đối tác/trang — slot dư sẽ dùng entity thường.`
        : "Pool dữ liệu không đủ đối tác cho quota hiện tại — slot dư sẽ dùng entity thường.",
      hint: PARTNER_QUOTA_HINT,
    };
  }
  if (raw.includes("khong du entity")) {
    return {
      level: "info",
      label: "Thiếu dữ liệu",
      detail: "Pool không đủ entity cho số khung hiện tại — một số khung sẽ trống.",
      hint: ENTITY_SHORTAGE_HINT,
    };
  }
  return { level: "info", label: "Thông báo", detail: raw };
}
