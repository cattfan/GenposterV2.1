/** Sync error formatter for export paths — no heavy deps. */
export function formatExportError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error instanceof Event) {
    const target = error.target as HTMLElement | null;
    const src =
      target instanceof HTMLImageElement || target instanceof HTMLSourceElement
        ? target.src || target.getAttribute("src")
        : target?.getAttribute?.("src");
    return src ? `Không tải được ảnh: ${src}` : "Không tải được một ảnh trong khung xuất";
  }
  const text = String(error ?? "");
  return text === "[object Event]" ? "Không tải được một ảnh trong khung xuất" : text;
}
