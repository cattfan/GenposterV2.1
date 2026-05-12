// Binding validation for template/editor surfaces.
//
// Goal: given a template's slots and a sample entity (+ optional pool), return
// a per-slot verdict so the UI can highlight slots whose binding path will be
// empty at render time ("entity.phone" when the sheet has no phone column,
// "entity.metadata.menu" when the entity has no such metadata key, etc.).
//
// We intentionally keep the rules conservative:
//   • Static slots (no bindingPath) are always "ok".
//   • Special list/compose paths are validated by checking the sub-fields.
//   • Asset paths are "ok" when the entity/pool has at least one usable image.
//   • Everything else falls through to readEntityTextValue().

import type { Asset, Entity, PageTemplate, Slot } from "@/models";
import {
  isAssetRandomScopeBindingPath,
  isEntityComposeBindingPath,
  isEntityListBindingPath,
  parseAssetRandomScopeBindingPath,
  parseEntityScopedTextBindingPath,
  readEntityTextValue,
  ENTITY_COMPOSE_BINDING_PREFIX,
  ENTITY_LIST_BINDING_PREFIX,
} from "./dataBinding";
import { filterRenderableAssets } from "./assetImage";

export type BindingIssueLevel = "ok" | "empty" | "missing_field" | "no_assets" | "unknown_path";

export interface BindingIssue {
  slotId: string;
  slotName?: string;
  bindingPath: string;
  level: Exclude<BindingIssueLevel, "ok">;
  message: string;
}

export interface ValidateBindingOptions {
  /** The entity used to preview resolved values (usually sample from sheet). */
  entity?: Entity;
  /** Larger pool used for list/compose bindings and scoped lookups. */
  entityPool?: Entity[];
  /** Assets available to the entity + global library for image bindings. */
  assets?: Asset[];
  /** Global asset pool — used for "asset.random_global". */
  globalAssets?: Asset[];
  /** Active sheet name — lets us skip scoped lookups for a different sheet. */
  activeSheetName?: string;
}

const TEXT_KEYS_KNOWN = new Set<string>([
  "entity.name",
  "entity.address",
  "entity.phone",
  "entity.openingHours",
  "entity.priceRange",
  "entity.style",
  "entity.categoryMain",
  "entity.categorySub",
  "entity.signatureDish",
]);

function describeField(bindingPath: string): string {
  if (bindingPath.startsWith("entity.metadata.")) {
    return `metadata.${bindingPath.slice("entity.metadata.".length)}`;
  }
  if (bindingPath.startsWith("entity.")) {
    return bindingPath.slice("entity.".length);
  }
  return bindingPath;
}

function validateListCompose(
  bindingPath: string,
  entities: Entity[],
): Omit<BindingIssue, "slotId" | "slotName"> | null {
  try {
    const prefix = isEntityListBindingPath(bindingPath)
      ? ENTITY_LIST_BINDING_PREFIX
      : ENTITY_COMPOSE_BINDING_PREFIX;
    const rest = bindingPath.slice(prefix.length);
    const parsed = JSON.parse(decodeURIComponent(rest)) as { fields?: string[] };
    const fields = parsed.fields ?? [];
    if (fields.length === 0) {
      return {
        bindingPath,
        level: "empty",
        message: "List/compose chưa cấu hình trường dữ liệu",
      };
    }
    if (entities.length === 0) {
      return {
        bindingPath,
        level: "no_assets",
        message: "Không có entity nào trong pool để lặp",
      };
    }
    const firstEntity = entities[0];
    const missing = fields.filter((field) => !readEntityTextValue(firstEntity, field).trim());
    if (missing.length === fields.length) {
      return {
        bindingPath,
        level: "missing_field",
        message: `Không tìm thấy trường ${missing.map(describeField).join(", ")} trên entity "${firstEntity.name}"`,
      };
    }
  } catch {
    return {
      bindingPath,
      level: "unknown_path",
      message: "Binding không hợp lệ (parse lỗi)",
    };
  }
  return null;
}

function validateTextSlot(
  slot: Slot,
  options: ValidateBindingOptions,
): Omit<BindingIssue, "slotId" | "slotName"> | null {
  const bindingPath = slot.bindingPath;
  if (!bindingPath) return null;
  const entities = options.entityPool ?? (options.entity ? [options.entity] : []);

  if (isEntityListBindingPath(bindingPath) || isEntityComposeBindingPath(bindingPath)) {
    return validateListCompose(bindingPath, entities);
  }

  const scoped = parseEntityScopedTextBindingPath(bindingPath);
  const effectivePath = scoped?.path ?? bindingPath;

  if (!effectivePath.startsWith("entity.")) {
    return {
      bindingPath,
      level: "unknown_path",
      message: `Binding path không hỗ trợ: ${bindingPath}`,
    };
  }

  const entity = options.entity;
  if (!entity) return null; // nothing to check against yet

  // Scope to a different sheet than the current active one — we can't verify.
  if (scoped?.sheetName && options.activeSheetName && scoped.sheetName !== options.activeSheetName) {
    return null;
  }

  const value = readEntityTextValue(entity, effectivePath);
  if (value.trim()) return null;

  // Distinguish between "the field doesn't exist" and "the field is just empty".
  // If the path is a well-known entity column and it's not in TEXT_KEYS_KNOWN
  // nor a real Entity key, call it missing_field.
  const normalized = effectivePath;
  if (normalized.startsWith("entity.metadata.")) {
    const key = normalized.slice("entity.metadata.".length);
    const hasKey = entity.metadata && Object.prototype.hasOwnProperty.call(entity.metadata, key);
    return {
      bindingPath,
      level: hasKey ? "empty" : "missing_field",
      message: hasKey
        ? `Cột "${key}" của entity đang trống`
        : `Entity không có cột metadata "${key}"`,
    };
  }

  if (!TEXT_KEYS_KNOWN.has(normalized)) {
    return {
      bindingPath,
      level: "missing_field",
      message: `Entity không có trường "${describeField(normalized)}"`,
    };
  }

  return {
    bindingPath,
    level: "empty",
    message: `Trường "${describeField(normalized)}" của entity đang trống`,
  };
}

function validateImageSlot(
  slot: Slot,
  options: ValidateBindingOptions,
): Omit<BindingIssue, "slotId" | "slotName"> | null {
  const bindingPath = slot.bindingPath;
  if (!bindingPath) return null;

  if (!bindingPath.startsWith("asset.")) {
    return {
      bindingPath,
      level: "unknown_path",
      message: `Binding ảnh không hỗ trợ: ${bindingPath}`,
    };
  }

  if (bindingPath === "asset.random_global") {
    const pool = filterRenderableAssets(options.globalAssets ?? []);
    if (pool.length === 0) {
      return {
        bindingPath,
        level: "no_assets",
        message: "Thư viện ảnh toàn cục trống",
      };
    }
    return null;
  }

  if (isAssetRandomScopeBindingPath(bindingPath)) {
    const scope = parseAssetRandomScopeBindingPath(bindingPath);
    const pool = filterRenderableAssets(options.globalAssets ?? []);
    if (pool.length === 0) {
      return {
        bindingPath,
        level: "no_assets",
        message: scope?.sheetName
          ? `Sheet "${scope.sheetName}" chưa có ảnh hợp lệ`
          : "Không có ảnh hợp lệ trong scope",
      };
    }
    return null;
  }

  // Entity-bound asset paths: asset.cover, asset.random, asset.role.*, ...
  const entityAssets = filterRenderableAssets(options.assets ?? []);
  if (entityAssets.length === 0) {
    return {
      bindingPath,
      level: "no_assets",
      message: options.entity
        ? `Entity "${options.entity.name}" chưa có ảnh nào`
        : "Entity chưa có ảnh",
    };
  }
  return null;
}

/**
 * Validate every slot in a template against a sample entity + asset pool.
 * Returns only slots with issues; an empty array means the template resolves
 * cleanly against the provided data.
 */
export function validateTemplateBindings(
  template: PageTemplate,
  options: ValidateBindingOptions,
): BindingIssue[] {
  const issues: BindingIssue[] = [];
  for (const slot of template.slots) {
    let issue: Omit<BindingIssue, "slotId" | "slotName"> | null = null;
    const path = slot.bindingPath ?? "";
    // A shape can carry either text or image binding; route by path prefix.
    const isAssetBinding = path.startsWith("asset.");
    if (slot.kind === "image" || (slot.kind === "shape" && isAssetBinding)) {
      issue = validateImageSlot(slot, options);
    } else if (slot.kind === "text" || slot.kind === "shape") {
      issue = validateTextSlot(slot, options);
    }
    if (issue) {
      issues.push({
        slotId: slot.slotId,
        slotName: slot.name,
        ...issue,
      });
    }
  }
  return issues;
}
