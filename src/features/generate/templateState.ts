import type { PageTemplate } from "@/models";
import { applyBindOverrides } from "./useBindOverrides";

export type TemplateBindingOverrides = Record<string, string | undefined>;

export function clonePageTemplate(template: PageTemplate): PageTemplate {
  return JSON.parse(JSON.stringify(template)) as PageTemplate;
}

export function resolvePageWorkingTemplate(
  baseTemplate: PageTemplate | undefined,
  overrides?: TemplateBindingOverrides,
  workingTemplate?: PageTemplate,
): PageTemplate | undefined {
  if (workingTemplate) return workingTemplate;
  if (!baseTemplate) return undefined;
  return applyBindOverrides(baseTemplate, overrides ?? {});
}

export function createWorkingTemplate(
  baseTemplate: PageTemplate,
  overrides?: TemplateBindingOverrides,
  existingWorkingTemplate?: PageTemplate,
): PageTemplate {
  const source = existingWorkingTemplate ?? applyBindOverrides(baseTemplate, overrides ?? {});
  return clonePageTemplate(source);
}
