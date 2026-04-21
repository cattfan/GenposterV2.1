import type { CombinedLayoutBlueprint, DataBlueprint, VisualBlueprint } from "@/models";
import { AI_POSTER_FONT_FAMILIES } from "@/features/editor/fonts";
import { callAi } from "./aiClient";
import { serializeCombinedLayoutBlueprint } from "./blueprint";
import type { LayoutFidelity } from "./aiFeatures";

const VISUAL_BLUEPRINT_TOOL = {
  type: "function" as const,
  function: {
    name: "build_visual_blueprint",
    description:
      "Quan sát ảnh mẫu như designer và trả visual blueprint portrait 1080x1350, bám sát bố cục/nhịp thị giác nhất có thể.",
    parameters: {
      type: "object",
      properties: {
        visualBlueprint: {
          type: "object",
          properties: {
            canvas: {
              type: "object",
              properties: { bgColor: { type: "string" } },
            },
            confidence: { type: "number" },
            warnings: { type: "array", items: { type: "string" } },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: {
                    type: "string",
                    enum: [
                      "background",
                      "title",
                      "subtitle",
                      "eyebrow",
                      "list_line",
                      "list_group",
                      "section_title",
                      "image_holder",
                      "shape_label",
                      "badge",
                      "body_text",
                      "cta",
                      "decor",
                      "other",
                    ],
                  },
                  importance: { type: "string", enum: ["high", "medium", "low"] },
                  clusterId: { type: "string" },
                  lineIndex: { type: "number" },
                  kind: { type: "string", enum: ["text", "image", "shape"] },
                  shapeKind: {
                    type: "string",
                    enum: ["rectangle", "circle", "badge", "line", "divider"],
                  },
                  x: { type: "number" },
                  y: { type: "number" },
                  w: { type: "number" },
                  h: { type: "number" },
                  z: { type: "number" },
                  rotation: { type: "number" },
                  placeholder: { type: "string" },
                  notes: { type: "string" },
                  style: {
                    type: "object",
                    properties: {
                      fontSize: { type: "number" },
                      fontFamily: { type: "string" },
                      fontWeight: { type: "number" },
                      color: { type: "string" },
                      fill: { type: "string" },
                      borderRadius: { type: "number" },
                      textAlign: { type: "string", enum: ["left", "center", "right"] },
                      textTransform: { type: "string", enum: ["none", "uppercase", "lowercase"] },
                      lineHeight: { type: "number" },
                      letterSpacing: { type: "number" },
                      opacity: { type: "number" },
                      overlayColor: { type: "string" },
                      textShadow: { type: "string" },
                      textStrokeColor: { type: "string" },
                      textStrokeWidth: { type: "number" },
                      padding: { type: "number" },
                      fit: { type: "string", enum: ["cover", "contain", "stretch"] },
                      shadowColor: { type: "string" },
                      shadowBlur: { type: "number" },
                      shadowX: { type: "number" },
                      shadowY: { type: "number" },
                    },
                  },
                },
                required: ["name", "role", "kind", "x", "y", "w", "h"],
              },
            },
          },
          required: ["blocks"],
        },
      },
      required: ["visualBlueprint"],
    },
  },
};

const DATA_BLUEPRINT_TOOL = {
  type: "function" as const,
  function: {
    name: "build_data_blueprint",
    description:
      "Dựa trên visual blueprint đã có, gắn ý nghĩa dữ liệu và structural hints mà không đơn giản hóa visual layout.",
    parameters: {
      type: "object",
      properties: {
        dataBlueprint: {
          type: "object",
          properties: {
            pageRole: { type: "string" },
            pageType: {
              type: "string",
              enum: [
                "cover",
                "board",
                "mixed_board",
                "itinerary",
                "checklist",
                "service_directory",
                "recap",
                "closing",
                "unknown",
              ],
            },
            summary: { type: "string" },
            layoutDensity: { type: "string", enum: ["low", "medium", "high"] },
            numberOfSections: { type: "number" },
            estimatedItemCount: { type: "number" },
            hasMainTitle: { type: "boolean" },
            hasSubtitle: { type: "boolean" },
            hasBackgroundImage: { type: "boolean" },
            hasPanel: { type: "boolean" },
            hasSectionImages: { type: "boolean" },
            hasListRepeater: { type: "boolean" },
            hasSlotRepeater: { type: "boolean" },
            hasPriceBadge: { type: "boolean" },
            hasCTA: { type: "boolean" },
            uiRegions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string" },
                  label: { type: "string" },
                  description: { type: "string" },
                  estimatedItems: { type: "number" },
                },
                required: ["kind", "label", "description"],
              },
            },
            requiredFields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fieldKey: { type: "string" },
                  label: { type: "string" },
                  scope: { type: "string", enum: ["pack", "page", "section", "item", "asset"] },
                  required: { type: "boolean" },
                  kind: {
                    type: "string",
                    enum: ["data_field", "asset", "structural", "manual_literal"],
                  },
                  bindCandidate: { type: "string" },
                  bindCandidates: { type: "array", items: { type: "string" } },
                  examples: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                  acceptsManualInput: { type: "boolean" },
                  minRecords: { type: "number" },
                  assetRoleHint: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["fieldKey", "label", "scope", "required"],
              },
            },
            bindings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  blockName: { type: "string" },
                  bindingPath: { type: "string" },
                  manualLiteral: { type: "boolean" },
                  required: { type: "boolean" },
                  notes: { type: "string" },
                  confidence: { type: "number" },
                  clusterId: { type: "string" },
                  lineIndex: { type: "number" },
                },
                required: ["blockName"],
              },
            },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  clusterId: { type: "string" },
                  title: { type: "string" },
                  repeatedItemCount: { type: "number" },
                  imageRepresentsCluster: { type: "boolean" },
                  notes: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["clusterId"],
              },
            },
            structureConfidence: { type: "number" },
            bindingConfidence: { type: "number" },
            warnings: { type: "array", items: { type: "string" } },
          },
          required: [
            "pageRole",
            "pageType",
            "summary",
            "layoutDensity",
            "numberOfSections",
            "estimatedItemCount",
            "hasMainTitle",
            "hasSubtitle",
            "hasBackgroundImage",
            "hasPanel",
            "hasSectionImages",
            "hasListRepeater",
            "hasSlotRepeater",
            "hasPriceBadge",
            "hasCTA",
            "uiRegions",
            "requiredFields",
          ],
        },
      },
      required: ["dataBlueprint"],
    },
  },
};

function fidelityInstruction(fidelity: LayoutFidelity): string {
  switch (fidelity) {
    case "strict":
      return "Ưu tiên bám sát bố cục, nhịp ảnh, số cụm text, tỷ lệ tiêu đề và vị trí các ảnh phụ giống ảnh mẫu nhất có thể.";
    case "creative":
      return "Giữ tinh thần ảnh mẫu nhưng được phép sáng tạo nhẹ để layout sạch hơn nếu vẫn nhận ra cùng visual language.";
    case "balanced":
    default:
      return "Giữ bố cục và visual language gần ảnh mẫu, nhưng vẫn tối ưu để template dễ chỉnh và dễ bind dữ liệu.";
  }
}

function visibleLinesInstruction(preferVisibleLines?: boolean) {
  return preferVisibleLines === false
    ? "Nếu có vài dòng thật sự dính sát và khó tách, bạn có thể gom nhẹ, nhưng vẫn ưu tiên line-level khi mắt người nhìn ra từng dòng."
    : "Nếu mắt người thấy nhiều dòng item riêng biệt, phải trả từng dòng riêng ở visual blueprint và giữ từng dòng đó ở data blueprint.";
}

function buildVisualBlueprintSystem(input?: {
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
}) {
  const roleHint = input?.roleHint?.trim();
  const customInstructions = input?.customInstructions?.trim();

  return (
    "Bạn là designer phân tích ảnh mẫu thành visual blueprint. " +
    "Mục tiêu số 1 là sample-faithful: nhìn giống ảnh mẫu bằng mắt người, không generic hóa. " +
    "Bạn đang ở PASS 1 nên chỉ mô tả hình thức và cấu trúc thị giác, chưa map dữ liệu. " +
    "Quy tắc:\n" +
    "1. Chỉ gọi tool build_visual_blueprint.\n" +
    "2. Mỗi block phải có name duy nhất và dễ tham chiếu ở pass sau.\n" +
    "3. Dùng role rõ ràng: background, title, subtitle, eyebrow, list_line, list_group, section_title, image_holder, shape_label, badge, body_text, cta, decor.\n" +
    "4. Toạ độ x/y/w/h là tỷ lệ 0..1 trên canvas portrait 1080x1350.\n" +
    "5. Background full-page được bleed; text, list block, shape chứa text và image holder quan trọng phải nằm trong safe zone khoảng 5% mỗi cạnh.\n" +
    "6. Giữ nhịp poster/editorial của mẫu: nền tối, title treatment, image holder bo góc, collage rhythm, asymmetry trái/phải nếu có.\n" +
    "7. Với mẫu có nhiều dòng item nhìn riêng biệt, phải tạo từng block list_line riêng, có lineIndex rõ ràng. Không được dồn thành 1 list_group lớn nếu mẫu thể hiện line-by-line.\n" +
    "8. Bullet không dùng placeholder {{bullet}}. Nếu cần bullet, coi nó là shape nhỏ hoặc text tĩnh.\n" +
    "9. Placeholder, nếu có, phải là token ngắn có nghĩa như {{title}}, {{subtitle}}, {{eyebrow}}, {{section_title_1}}, {{name_1}}, {{address_1}}, {{hero_image_1}}. KHÔNG được dùng placeholder mô tả bằng văn xuôi như 'large bold uppercase heading' hay 'short yellow script text'.\n" +
    "10. Nếu block chỉ là trang trí hoặc chưa rõ placeholder, để trống placeholder thay vì bịa chữ mô tả.\n" +
    "11. Nếu các block thuộc cùng một cụm thị giác, gán clusterId nhất quán.\n" +
    "12. Encode style giàu chi tiết: lineHeight, letterSpacing, opacity, overlayColor, textShadow, textStrokeColor, textStrokeWidth, padding, fit, borderRadius, shadow, rotation.\n" +
    `13. Font family chỉ được chọn trong danh sách sau: ${AI_POSTER_FONT_FAMILIES.join(", ")}.\n` +
    `14. Ưu tiên hiện tại: ${fidelityInstruction(input?.fidelity ?? "strict")}\n` +
    `15. ${visibleLinesInstruction(input?.preferVisibleLines)}\n` +
    (roleHint ? `16. Hint vai trò page: ${roleHint}\n` : "") +
    (customInstructions ? `17. Ghi chú thêm từ người dùng: ${customInstructions}\n` : "")
  );
}

function buildDataBlueprintSystem(input?: {
  roleHint?: string;
  customInstructions?: string;
  preferVisibleLines?: boolean;
}) {
  const roleHint = input?.roleHint?.trim();
  const customInstructions = input?.customInstructions?.trim();

  return (
    "Bạn đang ở PASS 2 của pipeline vision-to-template. " +
    "Dựa trên visual blueprint đã có, hãy map block nào là manual literal, block nào bind field thật, block nào là image slot đại diện cụm item. " +
    "Không đơn giản hóa lại visual layout, không biến poster thành template generic. " +
    "Quy tắc:\n" +
    "1. Chỉ gọi tool build_data_blueprint.\n" +
    "2. Manual text như ngày, tagline, CTA, subtitle, title wording -> manual_literal, không tính là thiếu bắt buộc.\n" +
    "3. Structural requirement như repeater, số line, số section -> kind=structural, không biến thành field raw.\n" +
    "4. Field thật ưu tiên các bind: entity.name, entity.address, entity.phone, entity.priceRange, entity.openingHours, entity.categoryMain, entity.categorySub, entity.metadata.signatureDish, entity.metadata.description, asset.cover, asset.byRole:section_image, asset.byRole:facade, asset.byRole:food_closeup, asset.byRole:space.\n" +
    "5. Nếu mẫu có 16 dòng tên/địa chỉ, estimatedItemCount phải phản ánh số line item thật, không được báo như chỉ có 4 item group.\n" +
    "6. bindings phải tham chiếu blockName từ visual blueprint. Chỉ gắn binding khi bạn đủ tự tin block đó đại diện dữ liệu nào.\n" +
    "7. Với image holder đại diện cả cụm item, ghi clusterId tương ứng trong bindings/sections và notes cho rõ.\n" +
    "8. uiRegions, numberOfSections, estimatedItemCount, hasSectionImages, hasListRepeater, hasSlotRepeater phải phản ánh hình thật chứ không dựa page type generic.\n" +
    `9. ${visibleLinesInstruction(input?.preferVisibleLines)}\n` +
    (roleHint ? `10. Hint vai trò page hiện tại: ${roleHint}\n` : "") +
    (customInstructions ? `11. Ghi chú thêm từ người dùng: ${customInstructions}\n` : "")
  );
}

async function runVisualBlueprintPass(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
}): Promise<{ ok: true; visualBlueprint: VisualBlueprint } | { ok: false; error: string }> {
  const result = await callAi({
    useVisionModel: true,
    messages: [
      {
        role: "system",
        content: buildVisualBlueprintSystem(input),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Quan sát ảnh này như designer. Trả visual blueprint bám sát nhịp bố cục, số line, vị trí image holder, title treatment, shape nền chữ và khoảng thở thị giác.",
          },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ],
      },
    ],
    tools: [VISUAL_BLUEPRINT_TOOL],
    tool_choice: { type: "function", function: { name: "build_visual_blueprint" } },
    temperature: 0.15,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const toolArgs = result.toolArgs as { visualBlueprint?: VisualBlueprint } | null;
  if (!toolArgs?.visualBlueprint) {
    return { ok: false, error: "AI không trả visual blueprint hợp lệ." };
  }
  return { ok: true, visualBlueprint: toolArgs.visualBlueprint };
}

async function runDataBlueprintPass(input: {
  imageDataUrl: string;
  visualBlueprint: VisualBlueprint;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
}): Promise<{ ok: true; dataBlueprint: DataBlueprint } | { ok: false; error: string }> {
  const result = await callAi({
    useVisionModel: true,
    messages: [
      {
        role: "system",
        content: buildDataBlueprintSystem(input),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Đây là visual blueprint đã dựng ở pass 1. Hãy map nó sang data blueprint mà không làm mất nhịp poster.\n\n" +
              JSON.stringify(input.visualBlueprint),
          },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ],
      },
    ],
    tools: [DATA_BLUEPRINT_TOOL],
    tool_choice: { type: "function", function: { name: "build_data_blueprint" } },
    temperature: 0.15,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const toolArgs = result.toolArgs as { dataBlueprint?: DataBlueprint } | null;
  if (!toolArgs?.dataBlueprint) {
    return { ok: false, error: "AI không trả data blueprint hợp lệ." };
  }
  return { ok: true, dataBlueprint: toolArgs.dataBlueprint };
}

export async function runVisionTemplatePipeline(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
}): Promise<{ ok: true; blueprint: CombinedLayoutBlueprint } | { ok: false; error: string }> {
  const visualPass = await runVisualBlueprintPass(input);
  if (!visualPass.ok) return visualPass;

  const dataPass = await runDataBlueprintPass({
    imageDataUrl: input.imageDataUrl,
    visualBlueprint: visualPass.visualBlueprint,
    customInstructions: input.customInstructions,
    roleHint: input.roleHint,
    preferVisibleLines: input.preferVisibleLines,
  });

  if (!dataPass.ok) {
    return {
      ok: true,
      blueprint: {
        version: 2,
        visualBlueprint: {
          ...visualPass.visualBlueprint,
          warnings: [
            ...(visualPass.visualBlueprint.warnings ?? []),
            `Pass 2 bị fallback: ${dataPass.error}`,
          ],
        },
      },
    };
  }

  return {
    ok: true,
    blueprint: {
      version: 2,
      visualBlueprint: visualPass.visualBlueprint,
      dataBlueprint: dataPass.dataBlueprint,
    },
  };
}

export async function buildCombinedLayoutJson(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
}): Promise<{ ok: true; layoutJson: string } | { ok: false; error: string }> {
  const result = await runVisionTemplatePipeline(input);
  if (!result.ok) return result;
  return {
    ok: true,
    layoutJson: serializeCombinedLayoutBlueprint(result.blueprint),
  };
}
