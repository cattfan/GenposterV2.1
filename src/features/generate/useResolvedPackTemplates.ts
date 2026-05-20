import { useCallback, useMemo } from "react";
import type { PageTemplate } from "@/models";
import type { PackBindOverrides } from "@/features/generate/usePackBindOverrides";
import type { PreviewPageDrafts } from "@/features/generate/usePreviewPageDrafts";
import {
  GENERATE_TEMPLATE_OPTIONS,
  resolvePageWorkingTemplate,
  restoreTemplateGroups,
} from "@/features/generate/templateState";

export function useResolvedPackTemplates(params: {
  tpls: PageTemplate[];
  packPages: PageTemplate[];
  activePage: PageTemplate | undefined;
  packOv: PackBindOverrides;
  previewPageDrafts: PreviewPageDrafts;
}) {
  const { tpls, packPages, activePage, packOv, previewPageDrafts } = params;

  const resolveWorkingTemplate = useCallback(
    (page: PageTemplate, draftOverride?: PageTemplate) =>
      resolvePageWorkingTemplate(
        page,
        packOv[page.pageTemplateId],
        draftOverride ?? previewPageDrafts[page.pageTemplateId],
        GENERATE_TEMPLATE_OPTIONS,
      ),
    [packOv, previewPageDrafts],
  );

  const effectiveActive = useMemo(
    () => (activePage ? resolveWorkingTemplate(activePage) : undefined),
    [activePage, resolveWorkingTemplate],
  );

  const pageTemplatesForGenerate = useMemo(
    () =>
      tpls.map((tpl) =>
        restoreTemplateGroups(
          tpl,
          previewPageDrafts[tpl.pageTemplateId] ?? tpl,
          GENERATE_TEMPLATE_OPTIONS,
        ),
      ),
    [tpls, previewPageDrafts],
  );

  const resolvedPackPages = useMemo(
    () =>
      packPages.map((page) => resolveWorkingTemplate(page)).filter((page): page is PageTemplate => !!page),
    [packPages, resolveWorkingTemplate],
  );

  return {
    resolveWorkingTemplate,
    effectiveActive,
    pageTemplatesForGenerate,
    resolvedPackPages,
  };
}
