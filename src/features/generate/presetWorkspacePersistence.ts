import type { PageTemplate } from "@/models";
import type { PackBindOverrides } from "@/features/generate/usePackBindOverrides";
import type { PreviewPageDrafts } from "@/features/generate/usePreviewPageDrafts";

/** RAM còn draft hoặc override sau phiên workspace — đủ để mở lại không gọi applyPreset. */
export function hasInMemoryWorkspaceState(
  drafts: PreviewPageDrafts,
  packOverrides: PackBindOverrides,
): boolean {
  for (const overrides of Object.values(packOverrides)) {
    if (overrides && Object.keys(overrides).length > 0) return true;
  }
  for (const template of Object.values(drafts)) {
    if (templateHasWorkspaceEdits(template)) return true;
  }
  return false;
}

function templateHasWorkspaceEdits(template: PageTemplate): boolean {
  return template.slots.some(
    (slot) =>
      !!slot.dataSourceConfig ||
      !!slot.bindingPath ||
      !!slot.dataGroupId ||
      !!slot.fieldParts?.length,
  );
}

/**
 * Mở lại cùng khuôn vừa đóng (Quay lại) mà không nạp lại từ DB — tránh mất
 * dataSourceConfig khi autosave debounce chưa chạy hoặc vừa bị hủy.
 */
export function canResumePresetWorkspace(args: {
  presetId: string;
  selectedPresetId: string;
  lastClosedPresetId: string;
  drafts: PreviewPageDrafts;
  packOverrides: PackBindOverrides;
}): boolean {
  const { presetId, selectedPresetId, lastClosedPresetId, drafts, packOverrides } = args;
  if (!presetId || presetId !== selectedPresetId) return false;
  if (!lastClosedPresetId || presetId !== lastClosedPresetId) return false;
  return hasInMemoryWorkspaceState(drafts, packOverrides);
}
