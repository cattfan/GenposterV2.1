const LAST_ACTIVE_SHEET_KEY = "cpg_last_active_sheet";

export function getLastActiveSheet(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = window.localStorage.getItem(LAST_ACTIVE_SHEET_KEY);
  return value && value !== "__all__" ? value : undefined;
}

export function setLastActiveSheet(sheetName: string | undefined): void {
  if (typeof window === "undefined") return;
  if (!sheetName || sheetName === "__all__") {
    window.localStorage.removeItem(LAST_ACTIVE_SHEET_KEY);
    return;
  }
  window.localStorage.setItem(LAST_ACTIVE_SHEET_KEY, sheetName);
}
