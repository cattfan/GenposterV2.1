import { createServerFn } from "@tanstack/react-start";

function sheetUrlToExport(input: string, format: "csv" | "xlsx", gid?: string): string | null {
  const match = input.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;

  const id = match[1];
  const gidPart = gid ? `&gid=${gid}` : "";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=${format}${gidPart}`;
}

function sheetUrlToCsv(input: string): string | null {
  const gidMatch = input.match(/[?&#]gid=(\d+)/);
  return sheetUrlToExport(input, "csv", gidMatch ? gidMatch[1] : "0");
}

function sheetUrlToXlsx(input: string): string | null {
  return sheetUrlToExport(input, "xlsx");
}

function validateSheetUrlInput(input: { url: string }) {
  if (!input || typeof input.url !== "string" || input.url.length === 0) {
    throw new Error("Thieu url");
  }
  if (input.url.length > 2000) throw new Error("URL qua dai");
  return input;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function startsWithHtml(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64));
  for (const byte of bytes) {
    if (byte <= 32) continue;
    return byte === 60;
  }
  return false;
}

export const fetchSheetCsvServer = createServerFn({ method: "POST" })
  .inputValidator(validateSheetUrlInput)
  .handler(async ({ data }) => {
    const csvUrl = sheetUrlToCsv(data.url);
    if (!csvUrl) {
      return {
        ok: false as const,
        error: "Khong nhan dien duoc link Google Sheets. Hay dan link share cua file sheet.",
      };
    }

    try {
      const res = await fetch(csvUrl, {
        headers: { Accept: "text/csv,*/*" },
        redirect: "follow",
      });
      if (!res.ok) {
        return {
          ok: false as const,
          error: `Google tra ve ${res.status}. Hay dam bao sheet da share "Anyone with the link" hoac Publish to web.`,
        };
      }

      const text = await res.text();
      if (text.trim().startsWith("<")) {
        return {
          ok: false as const,
          error: "Sheet chua public. File -> Share -> 'Anyone with the link' (Viewer).",
        };
      }

      return { ok: true as const, csv: text };
    } catch (e) {
      return {
        ok: false as const,
        error: "Khong tai duoc sheet: " + (e instanceof Error ? e.message : String(e)),
      };
    }
  });

export const fetchSheetXlsxServer = createServerFn({ method: "POST" })
  .inputValidator(validateSheetUrlInput)
  .handler(async ({ data }) => {
    const xlsxUrl = sheetUrlToXlsx(data.url);
    if (!xlsxUrl) {
      return {
        ok: false as const,
        error: "Khong nhan dien duoc link Google Sheets. Hay dan link share cua file sheet.",
      };
    }

    try {
      const res = await fetch(xlsxUrl, {
        headers: {
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        return {
          ok: false as const,
          error: `Google tra ve ${res.status}. Hay dam bao sheet da share "Anyone with the link" hoac Publish to web.`,
        };
      }

      const contentType = res.headers.get("content-type") ?? "";
      const buffer = await res.arrayBuffer();
      if (contentType.includes("text/html") || startsWithHtml(buffer)) {
        return {
          ok: false as const,
          error: "Sheet chua public. File -> Share -> 'Anyone with the link' (Viewer).",
        };
      }

      return { ok: true as const, base64: arrayBufferToBase64(buffer) };
    } catch (e) {
      return {
        ok: false as const,
        error: "Khong tai duoc sheet: " + (e instanceof Error ? e.message : String(e)),
      };
    }
  });
