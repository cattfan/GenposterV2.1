import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";
import * as HeroiconsOutline from "@heroicons/react/24/outline";
import * as HeroiconsSolid from "@heroicons/react/24/solid";
import type { AssetItem } from "@/models";

const NOW = 1;

export type HeroiconComponent = ForwardRefExoticComponent<
  Omit<SVGProps<SVGSVGElement>, "ref"> & RefAttributes<SVGSVGElement>
>;

export interface HeroiconAsset extends AssetItem {
  component: HeroiconComponent;
  iconName: string;
  variant: "outline" | "solid";
}

function titleCaseFromIconName(name: string) {
  return name
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function tagsFromIconName(name: string) {
  return titleCaseFromIconName(name).toLowerCase().split(" ").filter(Boolean);
}

function buildHeroiconAssets(
  collection: Record<string, unknown>,
  variant: HeroiconAsset["variant"],
) {
  return Object.entries(collection)
    .filter(([name, value]) => name.endsWith("Icon") && !!value)
    .map(([name, value]) => ({
      assetId: `heroicon-${variant}-${name}`,
      name: `${titleCaseFromIconName(name)} (${variant})`,
      kind: "icon" as const,
      sourceType: "inline" as const,
      sourceValue: `${variant}:${name}`,
      iconName: `${variant}:${name}`,
      variant,
      component: value as HeroiconComponent,
      tags: [...tagsFromIconName(name), "heroicons", variant],
      mime: "image/svg+xml",
      createdAt: NOW,
      updatedAt: NOW,
    }));
}

const HEROICON_ASSETS: HeroiconAsset[] = [
  ...buildHeroiconAssets(HeroiconsOutline, "outline"),
  ...buildHeroiconAssets(HeroiconsSolid, "solid"),
].sort((a, b) => a.name.localeCompare(b.name));

export function getBuiltInAssetLibrary(): HeroiconAsset[] {
  return HEROICON_ASSETS;
}

export function getHeroiconComponent(iconName: string | undefined): HeroiconComponent | undefined {
  if (!iconName) return undefined;
  const [variant, rawName] = iconName.includes(":")
    ? (iconName.split(":") as [HeroiconAsset["variant"], string])
    : (["outline", iconName] as const);
  const registry = variant === "solid" ? HeroiconsSolid : HeroiconsOutline;
  const found = registry[rawName as keyof typeof registry];
  return found ? (found as HeroiconComponent) : undefined;
}

export function isHeroiconAsset(asset: AssetItem | HeroiconAsset): asset is HeroiconAsset {
  return "component" in asset && !!asset.component;
}
