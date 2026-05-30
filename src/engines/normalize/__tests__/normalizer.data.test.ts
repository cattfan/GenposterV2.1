import { describe, it, expect } from "vitest";
import { normalizeRows, type FieldMapping } from "../normalizer";
import type { Entity } from "@/models";

/**
 * Phase 5 regression: 100% data exploitation from F&B sheets.
 * Ensures no loss for price collision, partner name, unknown columns.
 */

function makeMapping(headers: string[]): FieldMapping {
  const m: FieldMapping = {};
  headers.forEach(h => { m[h] = h; }); // raw for test simplicity; real uses normalizeKey
  return m;
}

describe("normalizeRows — data fidelity (Phase 5)", () => {
  it("preserves both Gia and Gia_dau_nguoi without collision (pricePerPerson)", () => {
    const rows = [
      { Ten_quan: "Quán A", Gia: "50-80k", Gia_dau_nguoi: "120000" },
    ];
    const map = makeMapping(["Ten_quan", "Gia", "Gia_dau_nguoi"]);
    // simulate alias mapping that our aliases.ts now does
    map["Gia"] = "priceRange";
    map["Gia_dau_nguoi"] = "pricePerPerson";

    const { entities, warnings } = normalizeRows(rows, map, "Test");
    expect(entities.length).toBe(1);
    const e = entities[0] as Entity;
    expect(e.priceRange).toBe("50-80k");
    expect(e.pricePerPerson).toBe("120000");
    // also in metadata for visibility
    expect(e.metadata?.pricePerPerson).toBe("120000");
    expect(warnings.some(w => w.includes("cả \"Gia\" và \"Gia_dau_nguoi\""))).toBe(true);
  });

  it("preserves raw Doi_tac text as partnerName while setting partnerFlag", () => {
    const rows = [
      { Ten_quan: "Quán B", Doi_tac: "Công ty Du lịch XYZ" },
      { Ten_quan: "Quán C", Doi_tac: "x" },
    ];
    const map: FieldMapping = { Ten_quan: "name", Doi_tac: "partnerFlag" };

    const { entities } = normalizeRows(rows, map, "Test");
    expect(entities[0].partnerFlag).toBe(true);
    expect(entities[0].partnerName).toBe("Công ty Du lịch XYZ");
    expect(entities[0].metadata?.partnerName).toBe("Công ty Du lịch XYZ");

    expect(entities[1].partnerFlag).toBe(true);
    expect(entities[1].partnerName).toBeUndefined(); // pure flag value
  });

  it("puts unknown columns (e.g. Phan_loai, custom notes) into metadata", () => {
    const rows = [{ Ten_quan: "Q", Phan_loai: "Local", Ghi_chu_rieng: "VIP only" }];
    const map = makeMapping(["Ten_quan", "Phan_loai", "Ghi_chu_rieng"]);

    const { entities } = normalizeRows(rows, map, "Test");
    const meta = entities[0].metadata ?? {};
    expect(meta.phan_loai).toBe("Local");
    expect(meta.Ghi_chu_rieng).toBe("VIP only");
  });
});
