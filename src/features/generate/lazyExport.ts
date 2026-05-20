/** Lazy-load heavy export dependencies (html-to-image, jszip, xlsx) on user action. */
export async function loadExportPipeline() {
  const [png, artifacts] = await Promise.all([
    import("@/features/render/exportPng"),
    import("@/features/generate/buildExportArtifacts"),
  ]);
  return { ...png, ...artifacts };
}

export type ExportPipeline = Awaited<ReturnType<typeof loadExportPipeline>>;
