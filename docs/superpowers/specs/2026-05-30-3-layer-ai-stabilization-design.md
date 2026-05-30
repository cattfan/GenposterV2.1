# 2026-05-30 - Incremental Stabilization of 3-Layer AI Template Generation (gen mẫu)

## 1. Context & Goal

The 3-layer architecture for high visual fidelity template generation (L1: Visual Perception → L2: Semantic/Data → L3: Template Frame Synthesis) was implemented and reviewed.

The code review identified several issues that prevent the feature from being fully stable and production-ready, even though the core is solid and graceful fallback works well.

**Goal**: Address the review feedback through small, low-risk, incremental changes so that the "Cao cấp" (creative/high-fidelity) mode can be confidently used with real design images.

User constraint (explicit request):
- Work in small parts
- After each completed part → commit + push immediately
- Then continue to the next part until everything is done

## 2. Key Issues from Code Review (Prioritized)

| # | Issue | Impact | Priority |
|---|-------|--------|----------|
| 1 | `roleHint` + `preferVisibleLines` not forwarded to Layer 3 call | Layer 3 cannot use important context | High |
| 2 | Layer 3 runs for all fidelity levels (comments say "optional") | Inconsistent behavior + unnecessary cost | High |
| 3 | L3 warnings only go to `validationRules`, not shown to user | Poor observability in "Cao cấp" mode | Medium-High |
| 4 | Duplicate `LayoutFidelity` type definition | Maintenance smell | Low |
| 5 | Outdated comments + "as any" temporary bridges | Code clarity | Low |
| 6 | Test coverage missing L3 error paths and AI failure modes | Risk when Layer 3 misbehaves | Medium |
| 7 | Combo flow still hardcodes "strict" | High-fidelity not available in multi-image flow | Medium |

## 3. Overall Approach: 5 Small Incremental Phases

We will execute in this exact order (chosen because it balances risk, dependency, and user's desire for frequent commits):

1. **Cleanup & Housekeeping** (lowest risk, builds confidence)
2. **Wiring Fix** (most critical technical fix)
3. **Gating & Policy Clarification**
4. **Observability & User Feedback**
5. **Tests, Combo Support & Final Polish**

Each phase will be:
- Small enough to complete in one focused session
- Fully reviewed and committed + pushed before starting the next
- Tested at a basic level before moving on

## 4. Detailed Design – Phase 1: Cleanup & Housekeeping

### 4.1 Scope (strictly limited)

**In scope for Phase 1 only:**
- Remove duplicate `LayoutFidelity` type
- Re-export from single source of truth (`templateLayers.ts`)
- Clean outdated comments related to "Layer 3 being optional/future"
- Add clear comments on temporary "as any" bridges (no removal yet)
- Minor import standardization

**Explicitly out of scope for Phase 1:**
- Any change to runtime behavior
- Any change to Layer 3 call sites or logic
- UI changes
- Test additions (will be done in Phase 5)

### 4.2 Technical Changes

**Files to modify:**
- `src/features/ai/templateLayers.ts` (keep as source of truth)
- `src/features/ai/aiFeatures.ts` (remove duplicate, add re-export)
- `src/features/ai/visionPipeline.ts` (update comments only)
- `src/features/ai/templateFromImage.ts` (update comments only)

**Design decisions:**
- `templateLayers.ts` remains the canonical place for all 3-layer contracts (including `LayoutFidelity`).
- `aiFeatures.ts` will re-export `type { LayoutFidelity } from "./templateLayers"`.
- All comments mentioning "Layer 3 will be gated later" or "optional for now" will be updated to reflect current reality (Layer 3 exists and is wired, gating policy will be decided in Phase 3).
- Temporary `as any` usages will be annotated with `// TODO (Phase 3): Replace with proper type extension on CombinedLayoutBlueprint` instead of being removed now.

### 4.3 Verification for Phase 1

After changes:
- `npx tsc --noEmit` must pass cleanly.
- No behavioral change when opening "Dựng trang khuôn từ ảnh" dialog (all 3 fidelity modes still appear and are selectable).
- Code feels subjectively cleaner when reading the AI layer files.

### 4.4 Commit Strategy for Phase 1

Single atomic commit with clear message:
```
refactor(ai): cleanup duplicate LayoutFidelity and outdated Layer 3 comments

- Consolidate LayoutFidelity to templateLayers.ts (single source of truth)
- Re-export from aiFeatures.ts
- Update stale comments about Layer 3 being "future/optional"
- Add TODO markers on temporary "as any" bridges

Part 1/5 of 3-layer stabilization (per 2026-05-30 design)
```

Push immediately after this commit.

## 5. High-level Plan for Phases 2–5 (for context)

(Details will be refined and approved before starting each phase)

- **Phase 2 (Wiring)**: Forward `roleHint` + `preferVisibleLines` into `runTemplateFrameSynthesisPass` call. Make Layer 3 actually receive the same context as L1/L2.
- **Phase 3 (Gating)**: Implement clear policy (Layer 3 synthesis only runs meaningfully in "creative" mode). Update all related logic and comments.
- **Phase 4 (Observability)**: Surface Layer 3 warnings in the generation toast. Improve dev logging.
- **Phase 5 (Tests + Combo)**: Expand test coverage for L3 error paths, enable high-fidelity mode in combo flow, final cleanup.

## 6. Success Criteria (Overall)

After all 5 phases:
- All issues from the code review are resolved.
- "Cao cấp" mode is observably better for complex designs.
- No regression in `strict` and `balanced` modes.
- Code is easier to maintain and reason about.
- Developer can confidently recommend the feature to users.

## 7. Risks & Mitigations

- Risk: User wants to move faster than the phased approach → Mitigation: We can adjust scope of individual phases, but we will still commit after each logical unit.
- Risk: One phase takes longer than expected → Mitigation: We can split a phase further if needed (e.g. split Phase 5 into 5a and 5b).

---

**Next step (per process):**  
This design document is now written. I will do a quick self-review, then ask you to review this spec before we start actual implementation of Phase 1.

Would you like me to proceed with writing the implementation plan for Phase 1 right after you approve this document, or do you want any changes to the design first?