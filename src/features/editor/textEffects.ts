// One-click text effect presets for the editor toolbar.
// Each preset is a partial ElementStyle patch that the toolbar merges into the
// current element style. Applying a preset overrides all text-effect fields so
// users can switch between presets without leftover artefacts.

import type { ElementStyle } from "@/models";

export interface TextEffectPreset {
  id: string;
  label: string;
  description?: string;
  style: Partial<ElementStyle>;
}

/**
 * Canonical set of style keys controlled by text effects.
 * When applying a preset we first clear these on the target so the preset's
 * declared values fully replace the previous effect.
 */
export const TEXT_EFFECT_STYLE_KEYS = [
  "textShadow",
  "textShadowColor",
  "textShadowBlur",
  "textShadowX",
  "textShadowY",
  "textStroke",
  "textStrokeColor",
  "textStrokeWidth",
  "gradientFrom",
  "gradientTo",
  "gradientAngle",
  "gradientEnabled",
  "color",
] as const satisfies ReadonlyArray<keyof ElementStyle>;

export const TEXT_EFFECT_PRESETS: TextEffectPreset[] = [
  {
    id: "none",
    label: "Không hiệu ứng",
    description: "Xoá toàn bộ shadow/stroke/gradient",
    style: {
      textShadowColor: undefined,
      textShadowBlur: undefined,
      textShadowX: undefined,
      textShadowY: undefined,
      textStrokeColor: undefined,
      textStrokeWidth: undefined,
      gradientEnabled: false,
    },
  },
  {
    id: "soft-shadow",
    label: "Bóng mềm",
    description: "Shadow nhẹ, thích hợp cho cover",
    style: {
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowBlur: 12,
      textShadowX: 0,
      textShadowY: 4,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
      gradientEnabled: false,
    },
  },
  {
    id: "heavy-shadow",
    label: "Bóng đậm",
    description: "Shadow sâu, tương phản cao",
    style: {
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowBlur: 0,
      textShadowX: 4,
      textShadowY: 6,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
      gradientEnabled: false,
    },
  },
  {
    id: "outline-white",
    label: "Viền trắng",
    description: "Viền trắng 2px",
    style: {
      textShadowColor: undefined,
      textShadowBlur: undefined,
      textShadowX: undefined,
      textShadowY: undefined,
      textStrokeColor: "#ffffff",
      textStrokeWidth: 2,
      gradientEnabled: false,
    },
  },
  {
    id: "outline-dark",
    label: "Viền đen",
    description: "Viền đen 3px cho chữ sáng",
    style: {
      textShadowColor: undefined,
      textShadowBlur: undefined,
      textShadowX: undefined,
      textShadowY: undefined,
      textStrokeColor: "#0f172a",
      textStrokeWidth: 3,
      gradientEnabled: false,
    },
  },
  {
    id: "glow-warm",
    label: "Glow ấm",
    description: "Shadow cam loang rộng, nền tối",
    style: {
      textShadowColor: "rgba(249,115,22,0.75)",
      textShadowBlur: 24,
      textShadowX: 0,
      textShadowY: 0,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
      gradientEnabled: false,
    },
  },
  {
    id: "glow-cool",
    label: "Glow lạnh",
    description: "Shadow xanh loang rộng, nền tối",
    style: {
      textShadowColor: "rgba(56,189,248,0.8)",
      textShadowBlur: 28,
      textShadowX: 0,
      textShadowY: 0,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
      gradientEnabled: false,
    },
  },
  {
    id: "neon-pink",
    label: "Neon hồng",
    description: "Chữ trắng + glow hồng, outline hồng",
    style: {
      color: "#ffffff",
      textShadowColor: "rgba(236,72,153,0.9)",
      textShadowBlur: 20,
      textShadowX: 0,
      textShadowY: 0,
      textStrokeColor: "#ec4899",
      textStrokeWidth: 1,
      gradientEnabled: false,
    },
  },
  {
    id: "3d-stacked",
    label: "3D xếp tầng",
    description: "Shadow cứng 4px xuống-phải",
    style: {
      textShadowColor: "#0f172a",
      textShadowBlur: 0,
      textShadowX: 4,
      textShadowY: 4,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
      gradientEnabled: false,
    },
  },
  {
    id: "gradient-sunset",
    label: "Gradient sunset",
    description: "Gradient cam → hồng",
    style: {
      gradientEnabled: true,
      gradientFrom: "#f97316",
      gradientTo: "#ec4899",
      gradientAngle: 135,
      textShadowColor: undefined,
      textShadowBlur: undefined,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
    },
  },
  {
    id: "gradient-ocean",
    label: "Gradient ocean",
    description: "Gradient xanh dương → tím",
    style: {
      gradientEnabled: true,
      gradientFrom: "#0ea5e9",
      gradientTo: "#6366f1",
      gradientAngle: 135,
      textShadowColor: undefined,
      textShadowBlur: undefined,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
    },
  },
  {
    id: "gradient-gold",
    label: "Gradient vàng",
    description: "Gradient vàng ánh kim",
    style: {
      gradientEnabled: true,
      gradientFrom: "#fcd34d",
      gradientTo: "#b45309",
      gradientAngle: 135,
      textShadowColor: undefined,
      textShadowBlur: undefined,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
    },
  },
  // === Canva-style effects ===
  {
    id: "neon",
    label: "Neon",
    description: "Chữ phát sáng neon multi-layer (Canva style)",
    style: {
      color: "#ffffff",
      textShadowColor: "rgba(56,189,248,1)",
      textShadowBlur: 20,
      textShadowX: 0,
      textShadowY: 0,
      textStrokeColor: "rgba(56,189,248,0.8)",
      textStrokeWidth: 1,
      gradientEnabled: false,
      // Multi-layer glow qua textShadow CSS string (buildTextShadow sẽ dùng)
      textShadow:
        "0 0 7px rgba(56,189,248,0.9), 0 0 10px rgba(56,189,248,0.7), 0 0 21px rgba(56,189,248,0.5), 0 0 42px rgba(56,189,248,0.3)",
    },
  },
  {
    id: "echo",
    label: "Echo",
    description: "3 bản copy offset giảm dần opacity (Canva style)",
    style: {
      textShadowColor: undefined,
      textShadowBlur: 0,
      textShadowX: 0,
      textShadowY: 0,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
      gradientEnabled: false,
      textShadow:
        "2px 2px 0 rgba(99,102,241,0.7), 4px 4px 0 rgba(99,102,241,0.4), 6px 6px 0 rgba(99,102,241,0.2)",
    },
  },
  {
    id: "hollow",
    label: "Hollow",
    description: "Chỉ viền, không fill (Canva style)",
    style: {
      color: "transparent",
      textStrokeColor: "#0f172a",
      textStrokeWidth: 2,
      textShadowColor: undefined,
      textShadowBlur: undefined,
      textShadowX: undefined,
      textShadowY: undefined,
      gradientEnabled: false,
    },
  },
  {
    id: "splice",
    label: "Splice",
    description: "2 bản copy offset ngược nhau (Canva style)",
    style: {
      textShadowColor: undefined,
      textShadowBlur: 0,
      textShadowX: 0,
      textShadowY: 0,
      textStrokeColor: "#0f172a",
      textStrokeWidth: 2,
      gradientEnabled: false,
      textShadow:
        "-3px -3px 0 #f97316, 3px 3px 0 #6366f1",
    },
  },
  {
    id: "lift",
    label: "Lift",
    description: "Nổi lên với bóng mềm phía dưới (Canva style)",
    style: {
      textShadowColor: "rgba(0,0,0,0.25)",
      textShadowBlur: 16,
      textShadowX: 0,
      textShadowY: 8,
      textStrokeColor: undefined,
      textStrokeWidth: 0,
      gradientEnabled: false,
    },
  },
];

/**
 * Build the actual patch to apply to an element style for a given preset.
 * Ensures every effect key present in other presets is reset so there is no
 * residue when switching between presets.
 */
export function buildTextEffectPatch(preset: TextEffectPreset): Partial<ElementStyle> {
  const patch: Partial<ElementStyle> = {};
  for (const key of TEXT_EFFECT_STYLE_KEYS) {
    // Explicitly set every effect key to undefined so merging clears residue,
    // then overlay the preset's own values.
    (patch as Record<string, unknown>)[key] = undefined;
  }
  return { ...patch, ...preset.style };
}
