import { useCallback, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { Entity, GenerationJob, PackTemplate } from "@/models";
import { formatTemplateDisplayName } from "@/lib/templateNames";
import { groupPagesByBundle, type BundleGroup } from "@/lib/packDisplay";
import { formatExportError } from "@/features/render/exportErrors";
import { loadExportPipeline } from "@/features/generate/lazyExport";
import { createProgressToast } from "@/components/ux";
import { db } from "@/storage/db";

export function useBundleExporter(params: {
  currentJob: GenerationJob | null | undefined;
  jobPack: PackTemplate | undefined;
  entities: Entity[];
  entitiesById: Map<string, Entity>;
  getExportPageTemplate: (page: GenerationJob["pages"][number]) => import("@/models").PageTemplate | undefined;
  packRefs: MutableRefObject<Map<number, HTMLDivElement>>;
  setBundleExportingIndex: (index: number | null) => void;
}) {
  const {
    currentJob,
    jobPack,
    entities,
    entitiesById,
    getExportPageTemplate,
    packRefs,
    setBundleExportingIndex,
  } = params;

  const exportZip = useCallback(async () => {
    if (!currentJob || !jobPack) return;
    const sel = currentJob.pages.filter((p) => p.selected);
    if (sel.length === 0) return toast.error("Chưa chọn trang nào");

    const progress = createProgressToast({
      initialLabel: `Đang render ${sel.length} trang...`,
      total: sel.length,
    });

    try {
      const pipeline = await loadExportPipeline();
      const groupedByBundle = groupPagesByBundle(sel, currentJob, jobPack);
      const bundleEntries = Array.from(groupedByBundle.entries()).sort((a, b) => a[0] - b[0]);

      const result = await pipeline.assembleBundleArtifacts({
        packName: jobPack.name,
        entities,
        renderTimeoutMs: 5_000,
        bundles: bundleEntries.map(([bundleIdx, pages]) => ({
          bundleLabel: `Bộ ${bundleIdx}`,
          pages: pages.map((p) => ({
            pageIndex: p.pageIndex,
            node: packRefs.current.get(p.pageIndex) ?? null,
            pageData: pipeline.toExportPageData(p, {
              pageTemplate: getExportPageTemplate(p),
              entitiesById,
            }),
          })),
        })),
        onProgress: (step) =>
          progress.update(step, `Đang render ảnh ${step + 1}/${sel.length}...`),
      });

      const successfulBundles = result.bundles.filter((bundle) => bundle.succeeded > 0);
      if (successfulBundles.length === 0) {
        progress.error(`Không render được ảnh nào (${result.totalFailed} trang lỗi)`);
        return;
      }

      progress.update(result.totalRendered, "Đang tạo caption và đóng gói ZIP...");

      const templateName = formatTemplateDisplayName(currentJob.packTemplateName, "bo-anh");
      const zipFileName = successfulBundles.length === 1
        ? `${pipeline.formatZipFileName(templateName, { version: bundleEntries[0]![0] })}.zip`
        : `${pipeline.formatZipFileName(templateName)}.zip`;
      await pipeline.downloadMultiBundleZip(
        successfulBundles.map((bundle) => ({ files: bundle.files })),
        zipFileName,
      );
      await db.jobs.put({ ...currentJob, status: "exported" });
      progress.success(
        `Đã tải ZIP · ${successfulBundles.length} bộ · ${result.totalRendered} ảnh`,
      );
    } catch (error) {
      progress.error("Không thể tải ZIP: " + formatExportError(error));
    }
  }, [currentJob, jobPack, entities, entitiesById, getExportPageTemplate, packRefs]);

  const exportBundleZip = useCallback(
    async (bundle: BundleGroup) => {
      if (!currentJob || !jobPack) return;
      setBundleExportingIndex(bundle.bundleIndex);
      const progress = createProgressToast({
        initialLabel: `Đang tải ${bundle.bundleLabel}...`,
        total: bundle.pages.length,
      });
      try {
        const pipeline = await loadExportPipeline();
        const result = await pipeline.assembleBundleArtifacts({
          packName: jobPack.name,
          entities,
          renderTimeoutMs: 8_000,
          bundles: [
            {
              bundleLabel: bundle.bundleLabel,
              pages: bundle.pages.map((meta) => {
                const filtered = pipeline.toExportPageData(meta.page, {
                  pageTemplate: meta.pageTemplate ?? getExportPageTemplate(meta.page),
                  entitiesById,
                });
                return {
                  pageIndex: meta.page.pageIndex,
                  node: packRefs.current.get(meta.page.pageIndex) ?? null,
                  pageData: {
                    ...filtered,
                    pageFile: meta.displayPageName,
                    pageName: meta.pageTemplate?.name ?? meta.page.workingTemplate?.name,
                  },
                };
              }),
            },
          ],
          onProgress: (step) =>
            progress.update(step, `Đang render ${step + 1}/${bundle.pages.length}...`),
        });

        const built = result.bundles[0];
        if (!built || built.succeeded === 0) {
          progress.error("Không tìm thấy ảnh trong bộ này để tải");
          return;
        }

        progress.update(built.succeeded, "Đang tạo caption và đóng gói...");

        const templateName = formatTemplateDisplayName(jobPack.name, "bo-anh");
        const zipFileName = `${pipeline.formatZipFileName(templateName, { version: bundle.bundleIndex })}.zip`;
        await pipeline.downloadMultiBundleZip([{ files: built.files }], zipFileName);
        progress.success(`Đã tải ${bundle.bundleLabel}`);
      } catch (error) {
        progress.error("Không thể tải bộ: " + formatExportError(error));
      } finally {
        setBundleExportingIndex(null);
      }
    },
    [
      currentJob,
      jobPack,
      entities,
      entitiesById,
      getExportPageTemplate,
      packRefs,
      setBundleExportingIndex,
    ],
  );

  return { exportZip, exportBundleZip };
}
