// Fixture test cho blueprint → template pipeline (3-layer AI gen mẫu).
// Chạy: npx tsx src/features/ai/__tests__/blueprintFixtureTest.ts
// Hoặc import và gọi runAllFixtureTests() từ dev console.
//
// Part of 3-layer stabilization (Phase 1 cleanup + later fidelity gating tests).
//
// Layer 3 (TemplateFrameSpec) được test bằng cách truyền layer3Frame vào aiLayoutToTemplateWithQuality
// để xác nhận exactRect / preferredBinding / textRunParts được ưu tiên (thinning heuristics).

import { nanoid } from "nanoid";
import type { BlueprintBlock, CombinedLayoutBlueprint } from "@/models";
import { repairCombinedLayoutBlueprint, isSupportedBindingPath, SUPPORTED_TEXT_BINDINGS, SUPPORTED_IMAGE_BINDINGS } from "../blueprintRepair";
import { aiLayoutToTemplateWithQuality } from "../templateFromImage";

// ── Helpers ──

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ FAIL: ${message} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// ── Fixture 1: Cover page đơn giản ──

function makeCoverBlueprint(): CombinedLayoutBlueprint {
  const blocks: BlueprintBlock[] = [
    { name: "bg_1", role: "background", kind: "image", x: 0, y: 0, w: 1, h: 1, z: 0, placeholder: "{{hero_image_1}}" },
    { name: "title_1", role: "title", kind: "text", x: 0.08, y: 0.1, w: 0.84, h: 0.12, z: 2, placeholder: "{{title}}", style: { fontSize: 64, fontFamily: "Be Vietnam Pro", fontWeight: 700, color: "#ffffff", textAlign: "center" } },
    { name: "subtitle_1", role: "subtitle", kind: "text", x: 0.1, y: 0.24, w: 0.8, h: 0.06, z: 2, placeholder: "{{subtitle}}", style: { fontSize: 28, color: "#ffffffcc", textAlign: "center" } },
    { name: "cta_1", role: "cta", kind: "text", x: 0.3, y: 0.85, w: 0.4, h: 0.06, z: 3, placeholder: "{{cta}}", style: { fontSize: 22, fontWeight: 600, color: "#ffd700", textAlign: "center" } },
  ];
  return {
    version: 2,
    visualBlueprint: { blocks, confidence: 0.9 },
    dataBlueprint: {
      pageRole: "cover",
      pageType: "cover",
      summary: "Cover page with title, subtitle, CTA",
      layoutDensity: "low",
      numberOfSections: 0,
      estimatedItemCount: 0,
      hasMainTitle: true,
      hasSubtitle: true,
      hasBackgroundImage: true,
      hasPanel: false,
      hasSectionImages: false,
      hasListRepeater: false,
      hasSlotRepeater: false,
      hasPriceBadge: false,
      hasCTA: true,
      uiRegions: [],
      requiredFields: [],
      bindings: [
        { blockName: "bg_1", bindingPath: "asset.cover", confidence: 0.9 },
        { blockName: "title_1", manualLiteral: true, confidence: 0.95 },
        { blockName: "subtitle_1", manualLiteral: true, confidence: 0.9 },
        { blockName: "cta_1", manualLiteral: true, confidence: 0.85 },
      ],
      sections: [],
      structureConfidence: 0.9,
      bindingConfidence: 0.88,
    },
  };
}

// ── Fixture 2: Poster list 16 dòng (4 cluster × 4 line) ──

function makePosterListBlueprint(): CombinedLayoutBlueprint {
  const blocks: BlueprintBlock[] = [
    { name: "bg_1", role: "background", kind: "image", x: 0, y: 0, w: 1, h: 1, z: 0, placeholder: "{{hero_image_1}}" },
    { name: "title_1", role: "title", kind: "text", x: 0.05, y: 0.04, w: 0.9, h: 0.08, z: 2, placeholder: "{{title}}", style: { fontSize: 52, fontWeight: 700, color: "#ffffff" } },
    { name: "eyebrow_1", role: "eyebrow", kind: "text", x: 0.05, y: 0.01, w: 0.4, h: 0.03, z: 2, placeholder: "{{eyebrow}}" },
  ];

  const clusterIds = ["cluster_1", "cluster_2", "cluster_3", "cluster_4"];
  const sectionTitles = ["Đặc sản", "Homestay", "Check-in", "Spa"];
  const yStarts = [0.14, 0.36, 0.58, 0.80];

  for (let c = 0; c < 4; c += 1) {
    const clusterId = clusterIds[c];
    // section title
    blocks.push({
      name: `section_title_${c + 1}`,
      role: "section_title",
      kind: "text",
      clusterId,
      x: 0.05, y: yStarts[c], w: 0.9, h: 0.04, z: 2,
      placeholder: `{{section_title_${c + 1}}}`,
      style: { fontSize: 24, fontWeight: 600, color: "#ffd700" },
    });
    // image holder
    blocks.push({
      name: `hero_image_${c + 1}`,
      role: "image_holder",
      kind: "image",
      clusterId,
      x: 0.05, y: yStarts[c] + 0.05, w: 0.28, h: 0.16, z: 2,
      placeholder: `{{hero_image_${c + 1}}}`,
      style: { borderRadius: 12, fit: "cover" },
    });
    // 4 list lines per cluster
    for (let l = 1; l <= 4; l += 1) {
      blocks.push({
        name: `name_${c * 4 + l}`,
        role: "list_line",
        kind: "text",
        clusterId,
        lineIndex: l,
        x: 0.36, y: yStarts[c] + 0.05 + (l - 1) * 0.04, w: 0.58, h: 0.035, z: 2,
        placeholder: `{{name_${c * 4 + l}}}`,
        style: { fontSize: 16, color: "#ffffff" },
      });
    }
  }

  const bindings: { blockName: string; bindingPath?: string; manualLiteral?: boolean; clusterId?: string; lineIndex?: number; confidence: number }[] = [
    { blockName: "bg_1", bindingPath: "asset.cover", confidence: 0.9 },
    { blockName: "title_1", manualLiteral: true, confidence: 0.95 },
    { blockName: "eyebrow_1", manualLiteral: true, confidence: 0.9 },
  ];

  for (let c = 0; c < 4; c += 1) {
    bindings.push({ blockName: `hero_image_${c + 1}`, bindingPath: "asset.byRole:facade", clusterId: clusterIds[c], confidence: 0.85 });
    for (let l = 1; l <= 4; l += 1) {
      bindings.push({ blockName: `name_${c * 4 + l}`, bindingPath: "entity.name", clusterId: clusterIds[c], lineIndex: l, confidence: 0.88 });
    }
  }

  return {
    version: 2,
    visualBlueprint: { blocks, confidence: 0.85 },
    dataBlueprint: {
      pageRole: "directory",
      pageType: "service_directory",
      summary: "Poster list 4 sections × 4 items",
      layoutDensity: "high",
      numberOfSections: 4,
      estimatedItemCount: 16,
      hasMainTitle: true,
      hasSubtitle: false,
      hasBackgroundImage: true,
      hasPanel: false,
      hasSectionImages: true,
      hasListRepeater: true,
      hasSlotRepeater: true,
      hasPriceBadge: false,
      hasCTA: false,
      uiRegions: [],
      requiredFields: [],
      bindings,
      sections: clusterIds.map((cid, i) => ({
        clusterId: cid,
        title: sectionTitles[i],
        repeatedItemCount: 4,
        imageRepresentsCluster: true,
        confidence: 0.85,
      })),
      structureConfidence: 0.88,
      bindingConfidence: 0.87,
    },
  };
}

// ── Fixture 3: Blueprint với lỗi cần repair ──

function makeBrokenBlueprint(): CombinedLayoutBlueprint {
  const blocks: BlueprintBlock[] = [
    // @ts-expect-error — kind sai
    { name: "bad_kind", role: "title", kind: "heading", x: 0.1, y: 0.1, w: 0.8, h: 0.1, placeholder: "Large bold uppercase heading text that is way too long for a placeholder and should be truncated" },
    // tọa độ ngoài 0..1
    { name: "out_of_bounds", role: "body_text", kind: "text", x: -0.1, y: 1.2, w: 0.5, h: 0.05, placeholder: "{{text}}" },
    // role không hợp lệ
    // @ts-expect-error — role sai
    { name: "bad_role", role: "header", kind: "text", x: 0.1, y: 0.3, w: 0.8, h: 0.05 },
    // duplicate name
    { name: "dupe", role: "body_text", kind: "text", x: 0.1, y: 0.4, w: 0.8, h: 0.05 },
    { name: "dupe", role: "body_text", kind: "text", x: 0.1, y: 0.5, w: 0.8, h: 0.05 },
    // image với binding không hỗ trợ
    { name: "img_bad_bind", role: "image_holder", kind: "image", x: 0.1, y: 0.6, w: 0.3, h: 0.2 },
  ];
  return {
    version: 2,
    visualBlueprint: { blocks, confidence: 0.5, warnings: ["Test warning"] },
    dataBlueprint: {
      pageRole: "other",
      pageType: "unknown",
      summary: "Broken blueprint for repair test",
      layoutDensity: "low",
      numberOfSections: 0,
      estimatedItemCount: 0,
      hasMainTitle: true,
      hasSubtitle: false,
      hasBackgroundImage: false,
      hasPanel: false,
      hasSectionImages: false,
      hasListRepeater: false,
      hasSlotRepeater: false,
      hasPriceBadge: false,
      hasCTA: false,
      uiRegions: [],
      requiredFields: [],
      bindings: [
        { blockName: "img_bad_bind", bindingPath: "image.url", confidence: 0.5 },
        { blockName: "nonexistent_block", bindingPath: "entity.name", confidence: 0.3 },
        { blockName: "bad_kind", bindingPath: "entity.signatureDish", confidence: 0.7 },
      ],
      structureConfidence: 0.4,
      bindingConfidence: 0.3,
    },
  };
}

// ── Fixture 4: Service directory — 6 sections × (image_holder + 3 list_line) ──

function makeServiceDirectoryBlueprint(): CombinedLayoutBlueprint {
  const blocks: BlueprintBlock[] = [
    { name: "bg_1", role: "background", kind: "image", x: 0, y: 0, w: 1, h: 1, z: 0, placeholder: "{{hero_image_1}}" },
    { name: "title_1", role: "title", kind: "text", x: 0.05, y: 0.03, w: 0.9, h: 0.07, z: 2, placeholder: "{{title}}", style: { fontSize: 48, fontWeight: 700, color: "#ffffff" } },
    { name: "subtitle_1", role: "subtitle", kind: "text", x: 0.1, y: 0.10, w: 0.8, h: 0.04, z: 2, placeholder: "{{subtitle}}", style: { fontSize: 22, color: "#ffffffcc" } },
  ];

  const clusterIds = ["sec_stay", "sec_food", "sec_spa", "sec_tour", "sec_bar", "sec_shop"];
  const sectionTitles = ["Lưu trú", "Ẩm thực", "Spa & Massage", "Tour & Trải nghiệm", "Bar & Pub", "Đặc sản"];
  const yStarts = [0.16, 0.32, 0.48, 0.64, 0.80, 0.92];

  for (let c = 0; c < 6; c += 1) {
    const clusterId = clusterIds[c];
    blocks.push({
      name: `section_title_${c + 1}`,
      role: "section_title",
      kind: "text",
      clusterId,
      x: 0.05, y: yStarts[c], w: 0.9, h: 0.03, z: 2,
      placeholder: `{{section_title_${c + 1}}}`,
      style: { fontSize: 20, fontWeight: 600, color: "#ffd700" },
    });
    blocks.push({
      name: `img_${clusterId}`,
      role: "image_holder",
      kind: "image",
      clusterId,
      x: 0.05, y: yStarts[c] + 0.04, w: 0.25, h: 0.10, z: 2,
      placeholder: `{{hero_image_${c + 1}}}`,
      style: { borderRadius: 8, fit: "cover" },
    });
    for (let l = 1; l <= 3; l += 1) {
      blocks.push({
        name: `name_${clusterId}_${l}`,
        role: "list_line",
        kind: "text",
        clusterId,
        lineIndex: l,
        x: 0.33, y: yStarts[c] + 0.04 + (l - 1) * 0.03, w: 0.62, h: 0.025, z: 2,
        placeholder: `{{name_${c * 3 + l}}}`,
        style: { fontSize: 14, color: "#ffffff" },
      });
    }
  }

  const bindings: { blockName: string; bindingPath?: string; manualLiteral?: boolean; clusterId?: string; lineIndex?: number; confidence: number }[] = [
    { blockName: "bg_1", bindingPath: "asset.cover", confidence: 0.9 },
    { blockName: "title_1", manualLiteral: true, confidence: 0.95 },
    { blockName: "subtitle_1", manualLiteral: true, confidence: 0.9 },
  ];
  for (let c = 0; c < 6; c += 1) {
    bindings.push({ blockName: `img_${clusterIds[c]}`, bindingPath: "asset.byRole:facade", clusterId: clusterIds[c], confidence: 0.85 });
    for (let l = 1; l <= 3; l += 1) {
      bindings.push({ blockName: `name_${clusterIds[c]}_${l}`, bindingPath: "entity.name", clusterId: clusterIds[c], lineIndex: l, confidence: 0.88 });
    }
  }

  return {
    version: 2,
    visualBlueprint: { blocks, confidence: 0.85 },
    dataBlueprint: {
      pageRole: "directory",
      pageType: "service_directory",
      summary: "Service directory 6 sections × 3 items each",
      layoutDensity: "high",
      numberOfSections: 6,
      estimatedItemCount: 18,
      hasMainTitle: true,
      hasSubtitle: true,
      hasBackgroundImage: true,
      hasPanel: false,
      hasSectionImages: true,
      hasListRepeater: true,
      hasSlotRepeater: true,
      hasPriceBadge: false,
      hasCTA: false,
      uiRegions: [],
      requiredFields: [],
      bindings,
      sections: clusterIds.map((cid, i) => ({
        clusterId: cid,
        title: sectionTitles[i],
        repeatedItemCount: 3,
        imageRepresentsCluster: true,
        confidence: 0.85,
      })),
      structureConfidence: 0.88,
      bindingConfidence: 0.87,
    },
  };
}

// ── Test functions ──

function testRepairCover() {
  console.log("\n── Test: Repair cover blueprint ──");
  const bp = makeCoverBlueprint();
  const { blueprint, quality } = repairCombinedLayoutBlueprint(bp);

  assertEqual(blueprint.version, 2, "version preserved");
  assert(blueprint.visualBlueprint.blocks.length === 4, "4 blocks preserved");
  assert(quality.hasMainTitle, "hasMainTitle detected");
  assert(quality.hasBackgroundImage, "hasBackgroundImage detected");
  assert(quality.hasCTA, "hasCTA detected");
  assert(quality.bindingCoverage > 0, "binding coverage > 0");
  assert(quality.confidence > 0.5, "overall confidence > 0.5");
  assert(quality.repairCount === 0, "no repairs needed for clean cover");
}

function testRepairPosterList() {
  console.log("\n── Test: Repair poster list blueprint ──");
  const bp = makePosterListBlueprint();
  const { blueprint, quality } = repairCombinedLayoutBlueprint(bp);

  assertEqual(blueprint.visualBlueprint.blocks.length, 4 + 4 * (1 + 1 + 4), "all blocks preserved");
  assertEqual(quality.sectionCount, 4, "4 sections detected");
  assertEqual(quality.estimatedItemCount, 16, "16 list_line items detected");
  assert(quality.hasListRepeater, "hasListRepeater detected");
  assert(quality.hasSectionImages, "hasSectionImages detected");
  assert(quality.bindingCoverage > 0.5, "binding coverage > 50%");
  assert(quality.listLineBlocks === 16, "16 list_line blocks");
}

function testRepairBroken() {
  console.log("\n── Test: Repair broken blueprint ──");
  const bp = makeBrokenBlueprint();
  const { blueprint, quality } = repairCombinedLayoutBlueprint(bp);

  assert(quality.repairCount > 0, "repairs were needed");
  // bad kind → text
  const badKindBlock = blueprint.visualBlueprint.blocks.find((b) => b.name.startsWith("bad_kind"));
  assert(badKindBlock?.kind === "text", "bad kind repaired to text");
  // out of bounds → clamped
  const oobBlock = blueprint.visualBlueprint.blocks.find((b) => b.name.startsWith("out_of"));
  assert(oobBlock != null && oobBlock.x >= 0 && oobBlock.y <= 1, "coordinates clamped");
  // bad role → other
  const badRoleBlock = blueprint.visualBlueprint.blocks.find((b) => b.name.startsWith("bad_role"));
  assert(badRoleBlock?.role === "other", "bad role repaired to other");
  // duplicate names → unique
  const names = blueprint.visualBlueprint.blocks.map((b) => b.name);
  const uniqueNames = new Set(names);
  assertEqual(names.length, uniqueNames.size, "all block names unique after repair");
  // unsupported binding removed
  const imgBind = blueprint.dataBlueprint?.bindings?.find((b) => b.blockName === "img_bad_bind");
  assert(imgBind?.bindingPath === undefined, "unsupported binding removed");
  // nonexistent block binding removed
  const nonExist = blueprint.dataBlueprint?.bindings?.find((b) => b.blockName === "nonexistent_block");
  assert(nonExist === undefined, "binding to nonexistent block removed");
}

function testCoverToTemplate() {
  console.log("\n── Test: Cover blueprint → template ──");
  const bp = makeCoverBlueprint();
  const { template, quality } = aiLayoutToTemplateWithQuality(bp);

  assertEqual(template.type, "cover", "template type = cover");
  assert(template.slots.length >= 3, "at least 3 slots (title, subtitle, cta)");
  assert(template.sections.length === 0, "no sections for cover");
  const bgSlot = template.slots.find((s) => s.kind === "image" && s.bindingPath === "asset.cover");
  assert(bgSlot != null, "background slot has asset.cover binding");
  const titleSlot = template.slots.find((s) => s.name?.startsWith("title"));
  assert(titleSlot != null, "title slot exists");
  assert(quality.confidence > 0.5, "quality confidence > 0.5");
}

function testPosterListToTemplate() {
  console.log("\n── Test: Poster list blueprint → template ──");
  const bp = makePosterListBlueprint();
  const { template, quality } = aiLayoutToTemplateWithQuality(bp);

  assertEqual(template.sections.length, 4, "4 sections in template");
  assertEqual(template.type, "board", "template type = board");
  // Mỗi section phải có maxItems >= 4
  for (const section of template.sections) {
    assert(section.maxItems >= 4, `section "${section.title}" maxItems >= 4 (got ${section.maxItems})`);
  }
  // Có slot bind entity.name
  const nameSlots = template.slots.filter((s) => s.bindingPath === "entity.name");
  assert(nameSlots.length === 16, `16 name slots with entity.name binding (got ${nameSlots.length})`);
  // Có slot bind asset.byRole:facade
  const facadeSlots = template.slots.filter((s) => s.bindingPath === "asset.byRole:facade");
  assert(facadeSlots.length === 4, `4 image slots with asset.byRole:facade (got ${facadeSlots.length})`);
  // list_line slots có bindingPath đúng (groupId/sectionRefId chỉ gán cho non-list_line blocks trong cluster)
  const lineSlotsWithBinding = template.slots.filter(
    (s) => s.bindingPath === "entity.name",
  );
  assert(lineSlotsWithBinding.length === 16, `16 list_line slots with entity.name binding (got ${lineSlotsWithBinding.length})`);
  // Non-list-line blocks trong cluster phải có groupId + sectionRefId
  const clusterSlotsWithGroup = template.slots.filter(
    (s) => s.groupId && s.sectionRefId && s.kind !== "section",
  );
  assert(clusterSlotsWithGroup.length > 0, "non-list-line cluster slots have groupId + sectionRefId");
  assert(quality.bindingCoverage > 0.5, "binding coverage > 50%");
}

function testSupportedBindings() {
  console.log("\n── Test: Supported binding paths ──");
  // Text bindings
  assert(isSupportedBindingPath("entity.name", "text"), "entity.name supported for text");
  assert(isSupportedBindingPath("entity.address", "text"), "entity.address supported for text");
  assert(isSupportedBindingPath("entity.phone", "text"), "entity.phone supported for text");
  assert(isSupportedBindingPath("entity.priceRange", "text"), "entity.priceRange supported for text");
  assert(isSupportedBindingPath("entity.openingHours", "text"), "entity.openingHours supported for text");
  assert(isSupportedBindingPath("entity.categoryMain", "text"), "entity.categoryMain supported for text");
  assert(isSupportedBindingPath("entity.metadata.signatureDish", "text"), "entity.metadata.signatureDish supported for text");
  assert(isSupportedBindingPath("entity.signatureDish", "text"), "entity.signatureDish supported for text");
  assert(!isSupportedBindingPath("entity.name", "image"), "entity.name NOT supported for image");
  assert(!isSupportedBindingPath("image.url", "text"), "image.url NOT supported for text");

  // Image bindings
  assert(isSupportedBindingPath("asset.cover", "image"), "asset.cover supported for image");
  assert(isSupportedBindingPath("asset.random", "image"), "asset.random supported for image");
  assert(isSupportedBindingPath("asset.byRole:facade", "image"), "asset.byRole:facade supported for image");
  assert(isSupportedBindingPath("asset.byRole:food_closeup", "image"), "asset.byRole:food_closeup supported for image");
  assert(isSupportedBindingPath("asset.byRole:section_image", "image"), "asset.byRole:section_image supported for image");
  assert(!isSupportedBindingPath("asset.cover", "text"), "asset.cover NOT supported for text");

  // Entity list bindings
  assert(isSupportedBindingPath("entity.list:1", "text"), "entity.list:1 supported for text");
}

function testRepairServiceDirectory() {
  console.log("\n── Test: Repair service directory blueprint ──");
  const bp = makeServiceDirectoryBlueprint();
  const { blueprint, quality } = repairCombinedLayoutBlueprint(bp);

  // 3 base blocks + 6 × (1 section_title + 1 image_holder + 3 list_line) = 3 + 6×5 = 33
  assertEqual(blueprint.visualBlueprint.blocks.length, 33, "33 blocks preserved");
  assertEqual(quality.sectionCount, 6, "6 sections detected");
  assertEqual(quality.estimatedItemCount, 18, "18 list_line items detected");
  assert(quality.hasListRepeater, "hasListRepeater detected");
  assert(quality.hasSectionImages, "hasSectionImages detected");
  assert(quality.hasMainTitle, "hasMainTitle detected");
  assert(quality.hasBackgroundImage, "hasBackgroundImage detected");
  assert(quality.bindingCoverage > 0.6, "binding coverage > 60%");
  assertEqual(quality.repairCount, 0, "no repairs needed for clean directory");
}

function testServiceDirectoryToTemplate() {
  console.log("\n── Test: Service directory blueprint → template ──");
  const bp = makeServiceDirectoryBlueprint();
  const { template, quality } = aiLayoutToTemplateWithQuality(bp);

  assertEqual(template.type, "board", "template type = board (service_directory → board)");
  assertEqual(template.sections.length, 6, "6 sections in template");
  // Each section should have maxItems >= 3
  for (const section of template.sections) {
    assert(section.maxItems >= 3, `section "${section.title}" maxItems >= 3 (got ${section.maxItems})`);
  }
  // 18 name slots with entity.name binding
  const nameSlots = template.slots.filter((s) => s.bindingPath === "entity.name");
  assertEqual(nameSlots.length, 18, `18 name slots with entity.name (got ${nameSlots.length})`);
  // 6 image slots with asset.byRole:facade
  const facadeSlots = template.slots.filter((s) => s.bindingPath === "asset.byRole:facade");
  assertEqual(facadeSlots.length, 6, `6 image slots with asset.byRole:facade (got ${facadeSlots.length})`);
  // 6 section slots (section_title → kind=section)
  const sectionSlots = template.slots.filter((s) => s.kind === "section");
  assertEqual(sectionSlots.length, 6, `6 section slots (got ${sectionSlots.length})`);
  // Background slot
  const bgSlot = template.slots.find((s) => s.bindingPath === "asset.cover");
  assert(bgSlot != null, "background slot with asset.cover exists");
  // Non-list-line cluster slots have groupId + sectionRefId
  const clusterSlotsWithGroup = template.slots.filter(
    (s) => s.groupId && s.sectionRefId && s.kind !== "section" && s.kind !== "text" || (s.kind === "text" && s.bindingPath !== "entity.name" && s.groupId),
  );
  assert(clusterSlotsWithGroup.length > 0, "image_holder cluster slots have groupId + sectionRefId");
  assert(quality.bindingCoverage > 0.5, "binding coverage > 50%");
}

// ── Runner ──

export function runAllFixtureTests() {
  passed = 0;
  failed = 0;

  testRepairCover();
  testRepairPosterList();
  testRepairBroken();
  testRepairServiceDirectory();
  testCoverToTemplate();
  testPosterListToTemplate();
  testServiceDirectoryToTemplate();
  testSupportedBindings();

  // Layer 3 fidelity preference test (new in 3-layer pipeline)
  testLayer3FidelityPreference();

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══`);
  return { passed, failed };
}

// ── Layer 3 test: exactRect and preferredBinding from frame are respected ──
function testLayer3FidelityPreference() {
  const bp = makeCoverBlueprint();
  const mockFrame: import("@/models").TemplateFrameSpec = {
    version: 3,
    source: { visualBlueprint: bp.visualBlueprint },
    synthesis: {
      blockFidelity: [
        {
          blockName: "title_1",
          exactRect: { x: 0.05, y: 0.08, w: 0.9, h: 0.15 },
          preferredBinding: "entity.name",
          notes: "test override",
        },
      ],
    },
  };

  const { template } = aiLayoutToTemplateWithQuality(bp, "L3 Test", { layer3Frame: mockFrame } as any);
  const titleSlot = template.slots.find((s) => s.name === "title_1");

  // The exactRect from Layer 3 should have been used (thinning the old ratio math)
  if (titleSlot) {
    const expectedX = 0.05 * 1080;
    assert(Math.abs(titleSlot.x - expectedX) < 1, "Layer 3 exactRect x respected for title_1");
    assert(titleSlot.bindingPath === "entity.name", "Layer 3 preferredBinding respected");
  } else {
    failed += 1;
    console.error("  ✗ FAIL: title_1 slot not found in Layer 3 test");
  }
}

// Chạy trực tiếp
if (typeof require !== "undefined" || typeof module !== "undefined") {
  runAllFixtureTests();
}
