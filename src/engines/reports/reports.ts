// Reports: partners summary, partners detailed CSV, manifests

import type { Entity, GenerationJob, PackTemplate, PageTemplate, RenderManifest } from "@/models";
import { buildBundlePageMeta, type BundlePageMeta } from "@/lib/packDisplay";

export interface PartnerProofEntry {
  entity: Entity;
  pages: BundlePageMeta[];
}

export function buildRenderManifest(job: GenerationJob): RenderManifest {
  return {
    jobId: job.jobId,
    generatedAt: job.createdAt,
    pages: job.pages.map((p) => ({
      pageFile: p.pageFile,
      pageTemplateId: p.pageTemplateId,
      selected: p.selected,
      items: p.items,
      warnings: p.warnings,
    })),
  };
}

export function buildFinalManifest(job: GenerationJob): RenderManifest {
  return {
    jobId: job.jobId,
    generatedAt: job.createdAt,
    pages: job.pages
      .filter((p) => p.selected)
      .map((p) => ({
        pageFile: p.pageFile,
        pageTemplateId: p.pageTemplateId,
        selected: true,
        items: p.items,
        warnings: p.warnings,
      })),
  };
}

export function buildPartnersSummaryTxt(
  job: GenerationJob,
  pack: PackTemplate,
  entities: Entity[],
  pageTemplates: PageTemplate[],
  finalOnly = true,
): string {
  const proofs = buildPartnerProofEntries(job, pack, entities, pageTemplates, finalOnly);
  const lines: string[] = [];
  lines.push(`# Báo cáo đối tác - ${job.packTemplateName}`);
  lines.push(`Job: ${job.jobId}`);
  lines.push(`Loại báo cáo: ${finalOnly ? "FINAL EXPORT" : "PREVIEW"}`);
  lines.push(`Tổng số đối tác xuất hiện: ${proofs.length}`);
  lines.push("");
  for (const proof of proofs) {
    lines.push(
      `- ${proof.entity.name} (priority ${proof.entity.partnerPriority}) → ${proof.pages.length} page`,
    );
    proof.pages.forEach((page) =>
      lines.push(
        `    • ${page.bundleLabel} · ${page.pageTemplate?.name ?? page.page.pageTemplateId} · ${page.displayPageName}`,
      ),
    );
  }
  return lines.join("\n");
}

export function buildPartnersDetailedCsv(
  job: GenerationJob,
  pack: PackTemplate,
  entities: Entity[],
  pageTemplates: PageTemplate[],
): string {
  const headers = [
    "job_id",
    "bundle_index",
    "bundle_label",
    "display_page_name",
    "page_file",
    "page_template_id",
    "page_template_name",
    "section_id",
    "slot_id",
    "entity_id",
    "entity_name",
    "partner_flag",
    "partner_priority",
    "asset_id",
    "selected_for_export",
    "rendered_at",
  ];
  const rows: string[][] = [headers];
  for (const meta of buildBundlePageMeta(job, pack, pageTemplates, entities)) {
    for (const item of meta.page.items) {
      const entity = item.entityId
        ? entities.find((entry) => entry.entityId === item.entityId)
        : undefined;
      rows.push([
        job.jobId,
        String(meta.bundleIndex),
        meta.bundleLabel,
        meta.displayPageName,
        meta.page.pageFile,
        meta.page.pageTemplateId,
        meta.pageTemplate?.name ?? "",
        item.sectionId ?? "",
        item.slotId ?? "",
        item.entityId ?? "",
        entity?.name ?? "",
        String(entity?.partnerFlag ?? ""),
        String(entity?.partnerPriority ?? ""),
        item.assetId ?? "",
        String(meta.page.selected),
        new Date(meta.page.renderedAt).toISOString(),
      ]);
    }
  }
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function buildPartnerProofEntries(
  job: GenerationJob,
  pack: PackTemplate,
  entities: Entity[],
  pageTemplates: PageTemplate[],
  finalOnly = true,
): PartnerProofEntry[] {
  const filtered = finalOnly ? { ...job, pages: job.pages.filter((page) => page.selected) } : job;
  const entityMap = new Map(entities.map((entity) => [entity.entityId, entity]));
  const proofs = new Map<string, PartnerProofEntry>();

  for (const meta of buildBundlePageMeta(filtered, pack, pageTemplates, entities)) {
    for (const entityId of meta.partnerEntityIds) {
      const entity = entityMap.get(entityId);
      if (!entity) continue;
      const current = proofs.get(entityId) ?? { entity, pages: [] };
      current.pages.push(meta);
      proofs.set(entityId, current);
    }
  }

  return Array.from(proofs.values()).sort((a, b) =>
    a.entity.name.localeCompare(b.entity.name, "vi"),
  );
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
