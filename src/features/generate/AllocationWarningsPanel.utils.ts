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
}

export function parseWarning(raw: string): ParsedWarning {
  if (raw.includes("khong du doi tac")) {
    const quotaMatch = raw.match(/quota\s*(\d+)\s*\/\s*trang/i);
    return {
      level: "warning",
      label: "Thiếu đối tác cho quota",
      detail: quotaMatch
        ? `Pool dữ liệu không đủ ${quotaMatch[1]} đối tác/trang — slot dư sẽ dùng entity thường.`
        : "Pool dữ liệu không đủ đối tác cho quota hiện tại — slot dư sẽ dùng entity thường.",
    };
  }
  if (raw.includes("khong du entity")) {
    return {
      level: "info",
      label: "Thiếu dữ liệu",
      detail: "Pool không đủ entity cho số khung hiện tại — một số khung sẽ trống.",
    };
  }
  return { level: "info", label: "Thông báo", detail: raw };
}
