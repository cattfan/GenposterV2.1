// Test cho hàm parseWarning của AllocationWarningsPanel.
//
// Render UI không test ở đây vì repo chưa cài @testing-library/react +
// vitest config dùng node env (không có DOM). Pure parsing là risk surface
// chính (regex, format string Vietnamese), test riêng đủ.

import { describe, expect, it } from "vitest";
import { parseWarning } from "./AllocationWarningsPanel.utils";

describe("parseWarning", () => {
  it("classifies partner-quota shortage with quota number", () => {
    const result = parseWarning(
      'Page "Trang 1": khong du doi tac de dat quota 2/trang.',
    );
    expect(result.level).toBe("warning");
    expect(result.label).toBe("Thiếu đối tác cho quota");
    expect(result.detail).toContain("không đủ 2 đối tác/trang");
  });

  it("classifies partner-quota shortage without explicit quota number", () => {
    const result = parseWarning('Page "X": khong du doi tac de dat quota.');
    expect(result.level).toBe("warning");
    expect(result.label).toBe("Thiếu đối tác cho quota");
  });

  it("classifies entity shortage as info", () => {
    const result = parseWarning('Page "Trang 1": khong du entity de gan du lieu.');
    expect(result.level).toBe("info");
    expect(result.label).toBe("Thiếu dữ liệu");
    expect(result.detail).toContain("Pool không đủ entity");
  });

  it("falls back to generic info for unknown messages", () => {
    const result = parseWarning("Some unexpected warning text");
    expect(result.level).toBe("info");
    expect(result.label).toBe("Thông báo");
    expect(result.detail).toBe("Some unexpected warning text");
  });

  it("partner-quota detection beats entity-shortage when both keywords appear", () => {
    // Allocator hiện chỉ trả 1 trong 2 mẫu — test phòng hờ ưu tiên partner.
    const result = parseWarning(
      'Page "X": khong du doi tac de dat quota 1/trang. khong du entity.',
    );
    expect(result.level).toBe("warning");
    expect(result.label).toBe("Thiếu đối tác cho quota");
  });
});
