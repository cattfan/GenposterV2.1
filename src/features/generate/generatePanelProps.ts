import type { ReactNode } from "react";
import type { GeneratePageConfig, PageTemplate } from "@/models";

/** Resolved page config — mọi field bắt buộc sau merge global + page override. */
export type ResolvedGeneratePageConfig = Required<GeneratePageConfig>;

export type SourceControlsRenderer = (
  slots: import("@/models").Slot[],
  sourceConfig: ResolvedGeneratePageConfig,
  options?: { title?: string; description?: string; exactScope?: boolean },
) => ReactNode;

export interface GeneratePageTabItem {
  pageTemplateId: string;
  name: string;
  overrideCount: number;
}

export function toPageTabItems(
  pages: PageTemplate[],
  packOv: Record<string, Record<string, string | undefined> | undefined>,
): GeneratePageTabItem[] {
  return pages.map((tpl) => ({
    pageTemplateId: tpl.pageTemplateId,
    name: tpl.name,
    overrideCount: Object.values(packOv[tpl.pageTemplateId] ?? {}).filter(
      (v) => v && v !== "",
    ).length,
  }));
}
