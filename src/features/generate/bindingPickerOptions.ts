import {
  ASSET_RANDOM_SCOPE_BINDING_VALUE,
  IMAGE_BINDING_OPTIONS,
  TEXT_BINDING_OPTIONS,
  getEntityScopedTextBindingBasePath,
} from "@/engines/binding/dataBinding";
import { entityFieldOptionsForUi } from "@/engines/normalize/fieldRegistry";
import type { Entity } from "@/models";

export type BindingPickerGroup = "Cố định" | "Dữ liệu" | "Metadata" | "Ảnh";

export interface BindingPickerOption {
  value: string;
  label: string;
  sample?: string;
  group: BindingPickerGroup;
}

function truncate(value: unknown, max = 28): string {
  if (value == null) return "";
  const text = String(value).trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function fieldKeyFromBindingPath(path: string): string | null {
  const normalized = getEntityScopedTextBindingBasePath(path);
  if (!normalized.startsWith("entity.")) return null;
  if (normalized.startsWith("entity.metadata.")) {
    return `metadata.${normalized.slice("entity.metadata.".length)}`;
  }
  return normalized.slice("entity.".length);
}

function entityHasTextField(entity: Entity, fieldKey: string): boolean {
  if (fieldKey.startsWith("metadata.")) {
    const metadataKey = fieldKey.slice("metadata.".length);
    const value = entity.metadata?.[metadataKey];
    return value != null && String(value).trim() !== "";
  }
  const value = (entity as unknown as Record<string, unknown>)[fieldKey];
  return value != null && String(value).trim() !== "";
}

function fieldVisibleForEntities(
  value: string,
  entities: Entity[],
  currentValue?: string,
): boolean {
  if (value === currentValue) return true;
  const fieldKey = fieldKeyFromBindingPath(value);
  if (!fieldKey) return true;
  return entities.some((entity) => entityHasTextField(entity, fieldKey));
}

export function buildTextBindingPickerOptions(params: {
  entities: Entity[];
  currentValue?: string;
  includeList?: boolean;
}): BindingPickerOption[] {
  const { entities, currentValue, includeList = true } = params;
  const options: BindingPickerOption[] = [];

  for (const option of TEXT_BINDING_OPTIONS) {
    const value = option.value || "_static";
    if (option.group === "Cố định") {
      options.push({
        value,
        label: value === "_static" ? "Giữ nguyên chữ" : option.label,
        group: "Cố định",
      });
      continue;
    }
    if (!fieldVisibleForEntities(value, entities, currentValue)) continue;
    const sample = entityFieldOptionsForUi(entities, { includeEmptyPreview: true }).find(
      (field) => field.path === value,
    )?.sample;
    options.push({
      value,
      label: option.label,
      sample: sample ? truncate(sample) : undefined,
      group: "Dữ liệu",
    });
  }

  if (includeList) {
    options.splice(2, 0, {
      value: "__list",
      label: "Danh sách nhiều dòng",
      group: "Cố định",
    });
  }

  const seen = new Set(options.map((option) => option.value));
  const registryOptions = entityFieldOptionsForUi(entities);
  for (const field of registryOptions) {
    if (seen.has(field.path)) continue;
    if (!fieldVisibleForEntities(field.path, entities, currentValue)) continue;
    seen.add(field.path);
    options.push({
      value: field.path,
      label: field.label,
      sample: field.sample ? truncate(field.sample) : undefined,
      group: field.path.startsWith("entity.metadata.") ? "Metadata" : "Dữ liệu",
    });
  }

  const metadataKeys = new Set<string>();
  entities.forEach((entity) => {
    Object.entries(entity.metadata ?? {}).forEach(([key, value]) => {
      if (value != null && value !== "") metadataKeys.add(key);
    });
  });

  Array.from(metadataKeys)
    .sort((a, b) => a.localeCompare(b, "vi"))
    .forEach((key) => {
      const path = `entity.metadata.${key}`;
      if (seen.has(path)) return;
      if (!fieldVisibleForEntities(path, entities, currentValue)) return;
      const sampleEntity = entities.find((entity) => entity.metadata?.[key]);
      options.push({
        value: path,
        label: key,
        sample: truncate(sampleEntity?.metadata?.[key]),
        group: "Metadata",
      });
    });

  return options;
}

export function buildImageBindingPickerOptions(params: {
  entities: Entity[];
  assets: Array<{ entityId: string }>;
  currentValue?: string;
}): BindingPickerOption[] {
  const { entities, assets, currentValue } = params;
  const activeEntityIds = new Set(entities.map((entity) => entity.entityId));
  const assetCount = assets.filter((asset) => activeEntityIds.has(asset.entityId)).length;

  return IMAGE_BINDING_OPTIONS.map((option) => {
    const value =
      option.value === ""
        ? "_static"
        : option.value === ASSET_RANDOM_SCOPE_BINDING_VALUE
          ? ASSET_RANDOM_SCOPE_BINDING_VALUE
          : option.value;
    let sample: string | undefined;
    if (value === "asset.random" || value === "asset.random_global") {
      sample = assetCount > 0 ? `${assetCount} ảnh` : undefined;
    }
    return {
      value,
      label:
        value === "_static"
          ? "Giữ ảnh hiện tại"
          : value === ASSET_RANDOM_SCOPE_BINDING_VALUE
            ? "Ảnh theo nguồn/thư mục"
            : option.label,
      sample,
      group: "Ảnh" as const,
    };
  });
}

export const TEXT_BINDING_QUICK_VALUES = ["entity.name", "entity.address", "entity.phone"] as const;
export const IMAGE_BINDING_QUICK_VALUES = ["asset.random"] as const;

export function formatBindingPickerLabel(option: BindingPickerOption): string {
  return option.sample ? `${option.label} · ${option.sample}` : option.label;
}

export function findBindingPickerOption(
  options: BindingPickerOption[],
  value: string,
): BindingPickerOption | undefined {
  return options.find((option) => option.value === value);
}
