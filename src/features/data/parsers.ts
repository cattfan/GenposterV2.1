// CSV / JSON / Google Sheets / XLSX parsers

import Papa from "papaparse";

export interface ParsedWorkbookSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface ParsedTable {
  headers: string[];
  rows: Record<string, unknown>[];
  sourceSheetName?: string;
  workbookSheets?: ParsedWorkbookSheet[];
}

function collectHeaders(rows: Record<string, unknown>[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
    }
  }

  return headers;
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

  if (!Array.isArray(data)) {
    throw new Error("JSON phải là một array các object");
  }

  const headers = Object.keys(data[0] ?? {});
  return { headers, rows: data };
}

export async function parseXlsxFile(file: File): Promise<ParsedTable> {
  const { read, utils } = await import("xlsx");
  const workbook = read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
  });

  const workbookSheets: ParsedWorkbookSheet[] = [];

  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet?.["!ref"]) continue;

    const rows = utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });

    if (rows.length === 0) continue;

    workbookSheets.push({
      name,
      headers: collectHeaders(rows),
      rows,
    });
  }

  if (workbookSheets.length === 0) {
    throw new Error("File Excel không có sheet nào chứa dữ liệu");
  }

  const [firstSheet] = workbookSheets;
  return {
    headers: firstSheet.headers,
    rows: firstSheet.rows,
    sourceSheetName: firstSheet.name,
    workbookSheets,
  };
}

export async function parseDataFile(file: File): Promise<ParsedTable> {
  const normalizedName = file.name.toLowerCase();

  if (normalizedName.endsWith(".json")) return parseJsonFile(file);
  if (normalizedName.endsWith(".xlsx")) return parseXlsxFile(file);

  return parseCsvFile(file);
}

/**
 * Convert Google Sheets share link to a public CSV export URL.
 */
export function sheetUrlToCsvUrl(input: string): string | null {
  const match = input.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;

  const id = match[1];
  const gidMatch = input.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export async function fetchSheetCsv(input: string): Promise<ParsedTable> {
  const url = sheetUrlToCsvUrl(input);
  if (!url) {
    throw new Error("Không nhận diện được link Google Sheets. Hãy dán link share của file sheet.");
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      if (!text.trim().startsWith("<")) return parseCsvText(text);
    }
  } catch {
    // CORS or network issue, fall back to the server function below.
  }

  const { fetchSheetCsvServer } = await import("@/server/sheetFetch");
  const r = await fetchSheetCsvServer({ data: { url: input } });
  if (!r.ok) throw new Error(r.error);
  return parseCsvText(r.csv);
}
