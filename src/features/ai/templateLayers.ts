import type {
  VisualBlueprint,
  DataBlueprint,
  TemplateFrameSpec,
  SlotStyle,
} from "@/models";

/**
 * Explicit 3-layer (optionally 4-layer) contracts for high-fidelity AI template generation ("gen mẫu").
 *
 * Layer 1: Visual Perception     (existing runVisualBlueprintPass in visionPipeline)
 * Layer 2: Semantic / Data Intent (existing runDataBlueprintPass)
 * Layer 3: Template Frame Synthesis (NEW - the core of this improvement)
 * Layer 4: Fidelity Critic / Reflect (optional, for "100% match" mode)
 *
 * These contracts keep the intermediate blueprints stable while giving Layer 3
 * a dedicated, image-grounded voice to drive pixel-close visual results that
 * are still fully editable PageTemplate instances.
 *
 * Phase 2 complete: layer3Frame is now a first-class optional field on
 * CombinedLayoutBlueprint. All (as any) casts and inline imports removed.
 * Next: Phase 3 (fidelity gating policy).
 */

// Fidelity levels exposed to UI and callers (moved here for shared use)
export type LayoutFidelity = "strict" | "balanced" | "creative";

// ============================================================
// Layer 3: Template Frame Synthesis
// ============================================================

export interface Layer3Input {
  visualBlueprint: VisualBlueprint;
  dataBlueprint?: DataBlueprint;
  sourceImageDataUrl?: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  dataColumns?: string[];
  roleHint?: string;
  preferVisibleLines?: boolean;
}

export interface Layer3Output {
  frame: TemplateFrameSpec;
  quality: {
    warnings: string[];
    confidence?: number;
  };
}

/** The actual runner (implemented in visionPipeline; see runTemplateFrameSynthesisPass). */
export type RunTemplateFrameSynthesis = (
  input: Layer3Input,
) => Promise<Layer3Output>;

// ============================================================
// Optional Layer 4: Fidelity Critic / Reflect (future)
// ============================================================

export interface Layer4CriticInput {
  frame: TemplateFrameSpec;
  sourceImageDataUrl: string;
  /** Optional textual description of the rendered template for text-only critics. */
  renderedDescription?: string;
}

export interface Layer4Rectification {
  target: "slot" | "section" | "style" | "binding";
  blockNameOrCluster?: string;
  change: string; // e.g. "move title_1 +8px y", "split name_2 into name + address"
  confidence: number;
}

export interface Layer4CriticOutput {
  rectifications: Layer4Rectification[];
  overallNotes?: string;
  /** Whether the critic suggests re-running synthesis with these fixes. */
  shouldReSynthesize: boolean;
}

export type RunFidelityCritic = (
  input: Layer4CriticInput,
) => Promise<Layer4CriticOutput>;

// ============================================================
// Convenience re-exports for callers
// ============================================================

export type { TemplateFrameSpec } from "@/models";
