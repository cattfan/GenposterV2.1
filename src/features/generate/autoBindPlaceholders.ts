// Auto-bind tầng đa cấp:
//   1. Token match `{{name_0}}` trong staticText (tầng cũ — confidence cao nhất).
//   2. Alias theo `slot.name` (designer rename layer "Tên quán" → entity.name).
//   3. Heuristic chặt theo nội dung staticText (phone/price/hours).
//
// Tất cả tầng đều idempotent — chỉ chạy khi `slot.bindingPath` chưa có.
// Chỉ chạy khi user chủ động bấm nút "Tự liên kết" — KHÔNG tự đè binding cũ.
// Map placeholder→binding sống trong fieldRegistry.ENTITY_FIELDS.

import type { PageTemplate, Slot } from "@/models";
import {
  lookupByAlias,
  lookupByPlaceholder,
  type EntityFieldDefinition,
} from "@/engines/normalize/fieldRegistry";
import { guessFieldFromStaticText } from "./autoBindHeuristics";

/** Strip "{{" "}}", lấy token chính. KHÔNG strip "_<n>" vì lookupByPlaceholder tự xử lý. */
function extractPlaceholderToken(staticText: string | undefined): string | null {
  if (!staticText) return null;
  const trimmed = staticText.trim();
  // Match đúng dạng "{{token}}" hoặc "{{token_0}}" — KHÔNG match câu chứa nhiều placeholder.
  const match = trimmed.match(/^\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}$/);
  return match?.[1] ?? null;
}

export type AutoBindTier = "token" | "name" | "heuristic";

export interface AutoBindChange {
  slotId: string;
  tier: AutoBindTier;
  bindingPath: string;
}

export interface AutoBindResult {
  template: PageTemplate;
  changedSlotIds: string[];
  /** Chi tiết từng slot đã đổi: bind theo tầng nào. */
  changes: AutoBindChange[];
}

/**
 * Tìm field phù hợp với 1 slot bằng cách thử lần lượt 3 tầng. Trả về undefined
 * nếu không match gì.
 */
function resolveFieldForSlot(
  slot: Slot,
): { field: EntityFieldDefinition; tier: AutoBindTier } | null {
  // Tầng 1: token trong staticText — ưu tiên cao nhất, đã validate dạng {{...}}.
  const token = extractPlaceholderToken(slot.staticText);
  if (token) {
    const tokenField = lookupByPlaceholder(token);
    if (tokenField) return { field: tokenField, tier: "token" };
  }

  // Tầng 2: slot.name (designer rename layer có nghĩa). Dùng aliasIndex của
  // fieldRegistry — đã battle-test bởi pipeline import data.
  if (slot.name?.trim()) {
    const nameField = lookupByAlias(slot.name);
    if (nameField) return { field: nameField, tier: "name" };
  }

  // Tầng 3: heuristic chặt theo content staticText (chỉ phone/price/hours).
  // Bỏ qua nếu staticText là placeholder dạng {{...}} (đã thử ở tầng 1 và fail).
  if (slot.staticText && !token) {
    const heuristicField = guessFieldFromStaticText(slot.staticText);
    if (heuristicField) return { field: heuristicField, tier: "heuristic" };
  }

  return null;
}

/**
 * Quét template, set bindingPath cho slot text/shape chưa có bindingPath theo
 * 3 tầng (token > name alias > content heuristic). Trả về template MỚI nếu có
 * thay đổi (không mutate input), hoặc cùng tham chiếu nếu không có gì đổi.
 */
export function autoBindPlaceholders(template: PageTemplate): AutoBindResult {
  const changes: AutoBindChange[] = [];
  const nextSlots: Slot[] = template.slots.map((slot) => {
    if (slot.bindingPath) return slot;
    if (slot.kind !== "text" && slot.kind !== "shape") return slot;
    const match = resolveFieldForSlot(slot);
    if (!match) return slot;
    changes.push({
      slotId: slot.slotId,
      tier: match.tier,
      bindingPath: match.field.bindingPath,
    });
    return { ...slot, bindingPath: match.field.bindingPath };
  });

  if (changes.length === 0) {
    return { template, changedSlotIds: [], changes: [] };
  }

  return {
    template: { ...template, slots: nextSlots, updatedAt: Date.now() },
    changedSlotIds: changes.map((change) => change.slotId),
    changes,
  };
}

/**
 * Áp autoBindPlaceholders cho nhiều template, trả về map mới chỉ chứa template
 * thực sự đổi (giảm re-render khi không cần).
 */
export function autoBindPlaceholdersForDrafts(
  drafts: Record<string, PageTemplate>,
): { drafts: Record<string, PageTemplate>; totalChanged: number; changes: AutoBindChange[] } {
  let totalChanged = 0;
  const allChanges: AutoBindChange[] = [];
  const next: Record<string, PageTemplate> = { ...drafts };
  for (const [pageId, template] of Object.entries(drafts)) {
    const result = autoBindPlaceholders(template);
    if (result.changedSlotIds.length > 0) {
      next[pageId] = result.template;
      totalChanged += result.changedSlotIds.length;
      allChanges.push(...result.changes);
    }
  }
  return { drafts: next, totalChanged, changes: allChanges };
}
