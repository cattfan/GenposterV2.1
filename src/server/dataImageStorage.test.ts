import { describe, expect, it } from "vitest";
import { createDataImagesMiddleware, getDataImageFileInfo } from "./dataImageStorage";

describe("dataImageStorage", () => {
  it("builds safe file info inside data/images", () => {
    const info = getDataImageFileInfo({
      sheetName: "Bảng dữ liệu",
      entityName: "Quán Cà Phê",
      fileName: "ảnh cuối.jpg",
      sourceId: "source-123",
      mimeType: "image/jpeg",
    });

    expect(info.directory).toContain("data");
    expect(info.relativePath).toMatch(/bang-du-lieu[\\/]+quan-ca-phe[\\/]+anh-cuoi.*\.jpg$/);
    expect(info.url).toMatch(/^\/data-images\//);
  });

  it("rejects invalid methods and serves only the data-images route", async () => {
    const middleware = createDataImagesMiddleware();
    const headers: Record<string, string | number> = {};
    const response = {
      statusCode: 0,
      setHeader(name: string, value: string | number) {
        headers[name] = value;
      },
      end() {
        return undefined;
      },
    };

    let nextCalled = false;
    await middleware(
      { method: "POST", url: "/data-images/a/b/c.jpg" },
      response,
      () => {
        nextCalled = true;
      },
    );

    expect(response.statusCode).toBe(405);
    expect(headers.Allow).toBe("GET, HEAD");
    expect(nextCalled).toBe(false);

    nextCalled = false;
    await middleware(
      { method: "GET", url: "/other-path" },
      response,
      () => {
        nextCalled = true;
      },
    );
    expect(nextCalled).toBe(true);
  });
});
