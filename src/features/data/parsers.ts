// CSV / JSON / Google Sheets parsers

import Papa from "papaparse";

export interface ParsedTable {
  headers: string[];
  rows: Record<string, unknown>[];
}

export function parseCsvText(text: string): ParsedTable {
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return {
    headers: res.meta.fields ?? [],
    rows: res.data,
  };
}

export async function parseCsvFile(file: File): Promise<ParsedTable> {
  const text = await file.text();
  return parseCsvText(text);
}

export async function parseJsonFile(file: File): Promise<ParsedTable> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("JSON phải là một array các object");
  const headers = Object.keys(data[0] ?? {});
  return { headers, rows: data };
}

/**
 * Convert link Google Sheets share thành URL CSV public.
 */
export function sheetUrlToCsvUrl(input: string): string | null {
  // Match https://docs.google.com/spreadsheets/d/{id}/...
  const m = input.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const id = m[1];
  // Lấy gid nếu có
  const gidMatch = input.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export async function fetchSheetCsv(input: string): Promise<ParsedTable> {
  const url = sheetUrlToCsvUrl(input);
  if (!url) {
    throw new Error("Không nhận diện được link Google Sheets. Hãy dán link share của file sheet.");
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      "Không tải được CSV từ Google Sheets. Hãy đảm bảo sheet đã 'Anyone with the link' hoặc 'Publish to web' (Tệp → Chia sẻ → Xuất bản lên web → CSV).",
    );
  }
  const text = await res.text();
  return parseCsvText(text);
}
