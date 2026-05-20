import { describe, expect, it } from "vitest";
import { indexById, indexByKey } from "./indexById";

describe("indexById", () => {
  it("returns empty map for empty input", () => {
    expect(indexById([] as { id: string }[], (item) => item.id).size).toBe(0);
  });

  it("indexes items by id getter", () => {
    const items = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ];
    const map = indexById(items, (item) => item.id);
    expect(map.get("a")?.name).toBe("Alpha");
    expect(map.get("b")?.name).toBe("Beta");
  });

  it("last duplicate id wins", () => {
    const map = indexById(
      [
        { id: "x", v: 1 },
        { id: "x", v: 2 },
      ],
      (item) => item.id,
    );
    expect(map.get("x")?.v).toBe(2);
  });
});

describe("indexByKey", () => {
  it("indexes by object key", () => {
    const map = indexByKey(
      [
        { slotId: "s1", kind: "text" as const },
        { slotId: "s2", kind: "image" as const },
      ],
      "slotId",
    );
    expect(map.get("s1")?.kind).toBe("text");
  });
});
