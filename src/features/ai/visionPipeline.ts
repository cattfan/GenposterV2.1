import type {
  CombinedLayoutBlueprint,
  DataBlueprint,
  VisualBlueprint,
  TemplateFrameSpec,
} from "@/models";
import { AI_POSTER_FONT_FAMILIES } from "@/features/editor/fonts";
import { callAi } from "./aiClient";
import { serializeCombinedLayoutBlueprint } from "./blueprint";
import type { LayoutFidelity } from "./templateLayers"; // canonical source (Phase 1 cleanup)
import type { Layer3Input, Layer3Output } from "./templateLayers";

const SOURCE_ROLE_SCHEMA = {
  type: "string",
  enum: ["background", "section_image", "text_field", "literal"],
  description:
    "background = full-page image layer, section_image = auxiliary image frame, text_field = data-bound field, literal = static text/shape.",
};

const FIELD_PART_SCHEMA = {
  type: "array",
  description:
    "Optional deterministic row split hint. Use this when one visible line contains multiple data fields or literal separators.",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["field", "literal"] },
      text: {
        type: "string",
        description: "Literal text such as '-', 'SDT:', bullet, or fallback label.",
      },
      bindingPath: {
        type: "string",
        description:
          "Data field binding for kind=field, e.g. entity.name, entity.address, entity.phone, entity.metadata.<column>.",
      },
      fieldKey: { type: "string" },
      label: { type: "string" },
      xRatio: {
        type: "number",
        description: "Optional 0..1 start inside the original line block.",
      },
      widthRatio: {
        type: "number",
        description: "Optional 0..1 width inside the original line block.",
      },
    },
    required: ["kind"],
  },
};

const VISUAL_BLUEPRINT_TOOL = {
  type: "function" as const,
  function: {
    name: "build_visual_blueprint",
    description:
      "Quan sát ảnh mẫu như designer và trả visual blueprint portrait 1080x1350, bám sát bố cục/nhịp thị giác nhất có thể. Mỗi block phải có name duy nhất, clusterId nhất quán cho các block thuộc cùng cụm, lineIndex tăng dần từ 1 cho các dòng item trong cụm.",
    parameters: {
      type: "object",
      properties: {
        visualBlueprint: {
          type: "object",
          properties: {
            canvas: {
              type: "object",
              properties: {
                bgColor: { type: "string", description: "Màu nền canvas, vd #1a1a2e, #ffffff" },
              },
            },
            confidence: {
              type: "number",
              description: "0..1, độ tự tin tổng thể về visual blueprint",
            },
            warnings: {
              type: "array",
              items: { type: "string" },
              description: "Cảnh báo nếu có block không rõ role hoặc vị trí",
            },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description:
                      "Tên duy nhất, dễ tham chiếu ở pass 2. Vd: title_1, name_1, address_1, hero_image_1, bg_1",
                  },
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
                    description:
                      "Vai trò thị giác. list_line = từng dòng item riêng, list_group = khung chứa nhóm dòng, section_title = tiêu đề nhóm, image_holder = ảnh slot, background = ảnh full-page.",
                  },
                  importance: { type: "string", enum: ["high", "medium", "low"] },
                  sourceRole: SOURCE_ROLE_SCHEMA,
                  fieldParts: FIELD_PART_SCHEMA,
                  clusterId: {
                    type: "string",
                    description:
                      "Nhóm cluster, vd cluster_1, cluster_2. Tất cả block thuộc cùng cụm thị giác (section_title + list_line + image_holder) PHẢI dùng cùng clusterId.",
                  },
                  lineIndex: {
                    type: "number",
                    description:
                      "Số thứ tự dòng item trong cluster (bắt đầu từ 1). Chỉ dùng cho role=list_line.",
                  },
                  kind: { type: "string", enum: ["text", "image", "shape"] },
                  shapeKind: {
                    type: "string",
                    enum: ["rectangle", "circle", "badge", "line", "divider"],
                  },
                  x: { type: "number", description: "0..1, tỷ lệ trên canvas 1080x1350" },
                  y: { type: "number", description: "0..1, tỷ lệ trên canvas 1080x1350" },
                  w: { type: "number", description: "0..1, tỷ lệ chiều rộng" },
                  h: { type: "number", description: "0..1, tỷ lệ chiều cao" },
                  z: { type: "number", description: "z-index, 0 = dưới cùng" },
                  rotation: { type: "number" },
                  placeholder: {
                    type: "string",
                    description:
                      "Text ngắn để hiển thị trong editor. Với chữ tĩnh đọc được, dùng đúng chữ trên ảnh; với slot bind dữ liệu, dùng token ngắn như {{title}}, {{name_1}}, {{hero_image_1}}. Không dùng văn xuôi mô tả.",
                  },
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
      "Dựa trên visual blueprint đã có, gắn ý nghĩa dữ liệu và structural hints mà không đơn giản hóa visual layout. bindingPath chỉ được dùng giá trị trong danh sách hỗ trợ.",
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
            numberOfSections: {
              type: "number",
              description:
                "Số section/cluster có list_line hoặc image_holder. PHẢI khớp số clusterId duy nhất trong visual blueprint.",
            },
            estimatedItemCount: {
              type: "number",
              description:
                "Tổng số list_line item. PHẢI bằng số block role=list_line trong visual blueprint.",
            },
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
              description:
                "Mỗi binding tham chiếu blockName từ visual blueprint. bindingPath text dùng field lõi entity.name/entity.address/entity.phone/entity.priceRange/entity.style/entity.openingHours/entity.categoryMain/entity.categorySub hoặc entity.metadata.<ten_cot> cho mọi cột dữ liệu import khác (vd entity.metadata.Loai_dich_vu, entity.metadata.Noi_bat, entity.metadata.Giai_thich, entity.metadata.Link Drive). Image dùng asset.random/asset.cover/asset.byRole:*. Không dùng entity.compose/entity.list cho các row nhìn thấy trong ảnh mẫu.",
              items: {
                type: "object",
                properties: {
                  blockName: {
                    type: "string",
                    description: "PHẢI khớp chính xác name của một block trong visual blueprint",
                  },
                  bindingPath: {
                    type: "string",
                    description:
                      "Text: entity.name/entity.address/entity.phone/entity.priceRange/entity.style/entity.openingHours/entity.categoryMain/entity.categorySub hoặc entity.metadata.<ten_cot> cho cột import bất kỳ. Image: asset.random/asset.cover/asset.byRole:cover/facade/food_closeup/space/portrait/square_thumb/section_image. Không dùng entity.compose/entity.list cho row nhìn thấy; mỗi field phải có block riêng.",
                  },
                  sourceRole: SOURCE_ROLE_SCHEMA,
                  fieldParts: FIELD_PART_SCHEMA,
                  manualLiteral: {
                    type: "boolean",
                    description:
                      "true nếu block là text tĩnh (title, subtitle, CTA, tagline) không bind field",
                  },
                  required: { type: "boolean" },
                  notes: { type: "string" },
                  confidence: { type: "number" },
                  clusterId: {
                    type: "string",
                    description: "PHẢI khớp clusterId từ visual blueprint nếu block thuộc cluster",
                  },
                  lineIndex: {
                    type: "number",
                    description: "PHẢI khớp lineIndex từ visual blueprint nếu block là list_line",
                  },
                },
                required: ["blockName"],
              },
            },
            sections: {
              type: "array",
              description:
                "Mỗi section tham chiếu clusterId từ visual blueprint. PHẢI có 1 section cho mỗi cluster có list_line.",
              items: {
                type: "object",
                properties: {
                  clusterId: {
                    type: "string",
                    description: "PHẢI khớp clusterId duy nhất từ visual blueprint",
                  },
                  title: { type: "string" },
                  repeatedItemCount: {
                    type: "number",
                    description:
                      "Số list_line trong cluster. PHẢI bằng số block list_line có cùng clusterId.",
                  },
                  imageRepresentsCluster: {
                    type: "boolean",
                    description: "true nếu cluster có image_holder đại diện cho item trong cụm",
                  },
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

/**
 * Layer 3 tool: Template Frame Synthesis.
 * The AI sees the original image + L1/L2 blueprints and produces precise
 * fidelity decisions so the final PageTemplate looks as close as possible
 * to the source design while remaining fully editable + bindable.
 */
const BUILD_TEMPLATE_FRAME_TOOL = {
  type: "function" as const,
  function: {
    name: "build_template_frame",
    description:
      "Dựa trên ảnh gốc + VisualBlueprint (pass 1) + DataBlueprint (pass 2), trả về TemplateFrameSpec để materializer tạo PageTemplate GIỐNG ẢNH MẪU 100% về mặt thị giác (vị trí, kích thước, text line breaks, spacing, alignment) nhưng vẫn là bộ khung editable + data-bindable trong Genposter. Bắt buộc dùng exactRect (tỷ lệ 0-1) cho block quan trọng và textRunParts chi tiết. Không thêm field ngoài schema.",
    parameters: {
      type: "object",
      properties: {
        templateFrame: {
          type: "object",
          additionalProperties: false,
          description: "Root output. Phải khớp chính xác TemplateFrameSpec interface.",
          properties: {
            version: { const: 3, description: "Luôn là 3" },
            source: {
              type: "object",
              additionalProperties: false,
              description: "Echo lại input để trace. visualBlueprint bắt buộc.",
              properties: {
                visualBlueprint: { type: "object", description: "Bản sao VisualBlueprint từ pass 1" },
                dataBlueprint: { type: "object", description: "Bản sao DataBlueprint từ pass 2 (nếu có)" },
              },
              required: ["visualBlueprint"],
            },
            synthesis: {
              type: "object",
              additionalProperties: false,
              description: "Các quyết định fidelity cao cấp từ Layer 3. blockFidelity bắt buộc.",
              properties: {
                blockFidelity: {
                  type: "array",
                  description: "Một entry cho mỗi block quan trọng cần điều chỉnh vị trí/text so với heuristic.",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      blockName: { type: "string", description: "PHẢI khớp chính xác name trong visualBlueprint.blocks" },
                      exactRect: {
                        type: "object",
                        additionalProperties: false,
                        description: "Vị trí chính xác theo tỷ lệ 0-1 trên canvas 1080x1350. Ưu tiên cho title, hero, group quan trọng.",
                        properties: {
                          x: { type: "number", description: "Left ratio 0-1" },
                          y: { type: "number", description: "Top ratio 0-1" },
                          w: { type: "number", description: "Width ratio 0-1 (tối thiểu 0.05)" },
                          h: { type: "number", description: "Height ratio 0-1" },
                          rotation: { type: "number", description: "Độ xoay (độ), thường 0" },
                        },
                        required: ["x", "y", "w", "h"],
                      },
                      textRunParts: {
                        type: "array",
                        description: "Chia text thành literal + field theo thứ tự xuất hiện trên ảnh. Giúp tránh lỗi parse.",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            kind: { enum: ["literal", "field"], description: "literal = chữ cứng; field = bind dữ liệu" },
                            text: { type: "string", description: "Nội dung literal (chỉ khi kind=literal)" },
                            bindingPath: { type: "string", description: "Đường dẫn bind hợp lệ (chỉ khi kind=field)" },
                            placeholder: { type: "string", description: "Gợi ý placeholder khi không có data" },
                          },
                          required: ["kind"],
                        },
                      },
                      preferredBinding: { type: "string", description: "BindingPath ưu tiên cho block này (nếu khác heuristic)" },
                      styleAnchor: { type: "object", description: "Gợi ý style (fontSize, weight, color...) để materializer tham khảo" },
                      notes: { type: "string", description: "Ghi chú cho dev hoặc lý do chọn exactRect/textRunParts này" },
                    },
                    required: ["blockName"],
                  },
                },
                sectionFidelity: {
                  type: "array",
                  description: "Gợi ý số lượng item tối đa cho mỗi cluster (list repeater).",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      clusterId: { type: "string", description: "PHẢI khớp clusterId từ visualBlueprint" },
                      suggestedMaxItems: { type: "number", description: "Số item tối đa khuyến nghị" },
                      notes: { type: "string", description: "Lý do hoặc quan sát từ ảnh" },
                    },
                    required: ["clusterId"],
                  },
                },
                overallNotes: { type: "array", items: { type: "string" }, description: "Các nhận xét tổng quát về layout (ví dụ: 'có 2 cột không đối xứng')" },
                confidence: { type: "number", description: "0-1, độ tự tin của Layer 3 về các quyết định fidelity này" },
              },
              required: ["blockFidelity"],
            },
          },
          required: ["version", "source", "synthesis"],
        },
      },
      required: ["templateFrame"],
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
    ? "Nếu có vài dòng thật sự dính sát và khó tách, bạn có thể gom nhẹ để editor dễ chỉnh, nhưng vẫn giữ các dòng nội dung chính."
    : "Giữ các dòng nội dung chính mà mắt người nhìn ra được, nhưng không tách các mẩu chữ quá nhỏ nếu chúng làm box chồng nhau. Mỗi text block phải có kích thước đủ đọc và đủ dễ kéo trong editor.";
}

function dataColumnsInstruction(dataColumns?: string[]) {
  const columns = [...new Set((dataColumns ?? []).map((column) => column.trim()).filter(Boolean))]
    .slice(0, 80)
    .join(", ");
  if (!columns) return "";
  return (
    "Current imported columns: " +
    columns +
    ". Use these columns when deciding data fields. Core aliases: Ten_quan/name -> entity.name; Dia_chi/address -> entity.address; SDT/phone/hotline -> entity.phone; Gia/price -> entity.priceRange; Gio_mo_cua/hours -> entity.openingHours; Mo_hinh/Loai_dich_vu/category -> entity.categoryMain; Phong_cach/style -> entity.categorySub. Any other column must become entity.metadata.<column>."
  );
}

function buildVisualBlueprintSystem(input?: {
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
}) {
  const roleHint = input?.roleHint?.trim();
  const customInstructions = input?.customInstructions?.trim();
  const dataColumnHint = dataColumnsInstruction(input?.dataColumns);

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
    "7. Với mẫu có nhiều dòng item nhìn riêng biệt, tạo từng block list_line cho các dòng nội dung chính và có lineIndex rõ ràng. Nếu một dòng item có nhiều field như 'Tên quán - Địa chỉ', 'Món - Giá', 'Dịch vụ - Tên quán - Địa chỉ - SĐT', PHẢI tách thành nhiều text block riêng trong cùng clusterId và cùng lineIndex: name_i, address_i, phone_i, category_i, price_i, feature_i... Mọi cột dữ liệu thật trong workbook đều là field riêng nếu xuất hiện trên ảnh. Dấu bullet, dấu gạch ngang, nhãn 'SĐT:' là text/shape tĩnh riêng, không gộp vào field data. Không tách các mẩu chữ trang trí quá nhỏ nếu chúng không phải field dữ liệu.\n" +
    "7b. Nếu không chắc vị trí từng field trong một dòng, vẫn có thể trả một list_line block nhưng PHẢI điền fieldParts để app tách thành các slot riêng sau AI. Không bao giờ gộp nhiều field thật vào một fieldParts kind=field duy nhất.\n" +
    "8. Bullet không dùng placeholder {{bullet}}. Nếu cần bullet, coi nó là shape nhỏ hoặc text tĩnh.\n" +
    "9. Với chữ tĩnh/tiêu đề/CTA đọc được trong ảnh, placeholder phải là đúng chữ ngắn đọc được. Chỉ dùng token {{...}} cho slot cần bind dữ liệu sau này, ví dụ {{title}}, {{name_1}}, {{address_1}}, {{hero_image_1}}. KHÔNG dùng placeholder mô tả như 'large bold uppercase heading'.\n" +
    "10. Nếu block chỉ là trang trí hoặc chưa rõ placeholder, để trống placeholder thay vì bịa chữ mô tả. Mọi text block phải đủ cao cho ít nhất 1 dòng chữ, lineHeight không thấp hơn 1.05, tránh cắt chân chữ hoặc overlap trừ khi đó là hiệu ứng typography cố ý.\n" +
    "11. Nếu các block thuộc cùng một cụm thị giác (vd: section_title + các list_line + image_holder cùng nhóm), PHẢI gán cùng clusterId (vd cluster_1, cluster_2). clusterId phải nhất quán: mọi block trong cụm dùng cùng giá trị.\n" +
    "12. lineIndex chỉ dùng cho role=list_line, bắt đầu từ 1, tăng dần trong mỗi cluster. Vd: cluster_1 có 4 list_line → lineIndex 1,2,3,4; cluster_2 có 3 list_line → lineIndex 1,2,3.\n" +
    "13. Encode style giàu chi tiết: lineHeight, letterSpacing, opacity, overlayColor, textShadow, textStrokeColor, textStrokeWidth, padding, fit, borderRadius, shadow, rotation.\n" +
    `14. Font family chỉ được chọn trong danh sách sau: ${AI_POSTER_FONT_FAMILIES.join(", ")}.\n` +
    `15. Ưu tiên hiện tại: ${fidelityInstruction(input?.fidelity ?? "strict")}\n` +
    `16. ${visibleLinesInstruction(input?.preferVisibleLines)}\n` +
    (dataColumnHint ? `17. ${dataColumnHint}\n` : "") +
    (roleHint ? `18. Hint vai trò page: ${roleHint}\n` : "") +
    (customInstructions ? `19. Ghi chú thêm từ người dùng: ${customInstructions}\n` : "")
  );
}

function buildDataBlueprintSystem(input?: {
  roleHint?: string;
  customInstructions?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
}) {
  const roleHint = input?.roleHint?.trim();
  const customInstructions = input?.customInstructions?.trim();
  const dataColumnHint = dataColumnsInstruction(input?.dataColumns);

  return (
    "Bạn đang ở PASS 2 của pipeline vision-to-template. " +
    "Dựa trên visual blueprint đã có, hãy map block nào là manual literal, block nào bind field thật, block nào là image slot đại diện cụm item. " +
    "Không đơn giản hóa lại visual layout, không biến poster thành template generic. " +
    "Quy tắc:\n" +
    "1. Chỉ gọi tool build_data_blueprint.\n" +
    "2. Manual text như ngày, tagline, CTA, subtitle, title wording -> manual_literal=true, không tính là thiếu bắt buộc.\n" +
    "3. Structural requirement như repeater, số line, số section -> kind=structural, không biến thành field raw.\n" +
    "4. bindingPath text CHỈ dùng field lõi entity.name, entity.address, entity.phone, entity.priceRange, entity.style, entity.openingHours, entity.categoryMain, entity.categorySub hoặc entity.metadata.<ten_cot> cho bất kỳ cột import khác trong dữ liệu thật. Ví dụ: entity.metadata.Loai_dich_vu, entity.metadata.Noi_bat, entity.metadata.Giai_thich, entity.metadata.Link Drive. bindingPath image dùng asset.random, asset.cover hoặc asset.byRole:cover/facade/food_closeup/space/portrait/square_thumb/section_image. KHÔNG dùng entity.compose hoặc entity.list cho row nhìn thấy trong ảnh mẫu.\n" +
    "5. Nếu mẫu có 16 dòng tên/địa chỉ, estimatedItemCount phải phản ánh số line item thật, không được báo như chỉ có 4 item group.\n" +
    "6. bindings.blockName PHẢI khớp chính xác name của block trong visual blueprint. Mỗi block chỉ được 1 binding.\n" +
    "7. bindings.clusterId và bindings.lineIndex PHẢI khớp clusterId và lineIndex từ visual blueprint nếu block thuộc cluster.\n" +
    "8. Với image holder đại diện cả cụm item, ghi clusterId tương ứng trong bindings/sections và notes cho rõ.\n" +
    "9. uiRegions, numberOfSections, estimatedItemCount, hasSectionImages, hasListRepeater, hasSlotRepeater phải phản ánh hình thật chứ không dựa page type generic.\n" +
    "10. sections[].clusterId PHẢI khớp clusterId duy nhất từ visual blueprint. sections[].repeatedItemCount PHẢI bằng số block list_line trong cluster đó.\n" +
    "11. numberOfSections PHẢI bằng số clusterId duy nhất có list_line hoặc image_holder trong visual blueprint.\n" +
    "12. image_holder block: dùng bindingPath asset.* (vd asset.random, asset.cover, asset.byRole:facade). text block: dùng entity.*. KHÔNG dùng entity.* cho image, KHÔNG dùng asset.* cho text.\n" +
    `13. ${visibleLinesInstruction(input?.preferVisibleLines)}\n` +
    "14. Nếu một dòng list nhìn thấy có nhiều field dữ liệu trong cùng một record, PHẢI map từng field vào từng block riêng và giữ cùng clusterId + lineIndex. Ví dụ 'The Aratana Villa - P. Xuân Hương' => bullet tĩnh + name_1 binding entity.name + dấu '-' tĩnh + address_1 binding entity.address. Ví dụ 'Spa - Gội Đầu - Mer Spa - 1 Mai Hoa Thôn - SĐT: 0945...' => category/name/address/phone là các block riêng; dấu '-' và 'SĐT:' là manual literal. Nếu field không thuộc lõi, dùng entity.metadata.<ten_cot> theo cột import thật, không gộp vào textbox chung. Không dùng entity.compose hoặc entity.list để gộp nhiều field vào một textbox.\n" +
    "14b. Nếu visual pass chỉ có một block đại diện cho cả dòng, dùng bindings[].fieldParts để mô tả đủ part tĩnh và part data. App sẽ tách fieldParts thành nhiều textbox độc lập.\n" +
    (dataColumnHint ? `15. ${dataColumnHint}\n` : "") +
    (roleHint ? `16. Hint vai trò page hiện tại: ${roleHint}\n` : "") +
    (customInstructions ? `17. Ghi chú thêm từ người dùng: ${customInstructions}\n` : "")
  );
}

async function runVisualBlueprintPass(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
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
            text: "Quan sát ảnh này như designer. Trả visual blueprint bám sát nhịp bố cục, số line, vị trí image holder, title treatment, shape nền chữ và khoảng thở thị giác.",
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
  visualBlueprint: VisualBlueprint;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
}): Promise<{ ok: true; dataBlueprint: DataBlueprint } | { ok: false; error: string }> {
  const result = await callAi({
    messages: [
      {
        role: "system",
        content: buildDataBlueprintSystem(input),
      },
      {
        role: "user",
        content:
          "Đây là visual blueprint đã dựng ở pass 1. Hãy map nó sang data blueprint mà không làm mất nhịp poster.\n\n" +
          JSON.stringify(input.visualBlueprint),
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

// ============================================================
// Layer 3: Template Frame Synthesis Pass (gated by fidelity since Phase 3)
// ============================================================

async function runTemplateFrameSynthesisPass(
  input: Layer3Input,
): Promise<{ ok: true; frame: TemplateFrameSpec } | { ok: false; error: string }> {
  const messages: any[] = [
    {
      role: "system",
      content:
        "Bạn là chuyên gia thiết kế poster và template engineer. Nhiệm vụ DUY NHẤT của bạn là tạo TemplateFrameSpec sao cho khi materializer dựng PageTemplate thì layout, vị trí, khoảng cách, cách chia text, nhóm section GIỐNG ẢNH MẪU 100% nhất có thể, đồng thời các slot/section vẫn dễ bind dữ liệu và chỉnh sửa trong editor Genposter.\n\n" +
        "Quy tắc bắt buộc (vi phạm = fail):\n" +
        "1. Dùng exactRect (tỷ lệ 0-1 trên canvas 1080x1350) cho block quan trọng. Đảm bảo text không tràn ra ngoài box và không chồng chéo block khác.\n" +
        "2. Dùng textRunParts chi tiết theo đúng thứ tự dòng trên ảnh (literal + field xen kẽ). Đây là cách duy nhất để materializer tái tạo đúng line break.\n" +
        "3. preferredBinding chỉ dùng giá trị hợp lệ (entity.name, entity.address, asset.random, entity.metadata.<tên_cột>). Không bịa đặt field.\n" +
        "4. Giữ nguyên visual hierarchy, nhịp thị giác, và khoảng cách tương đối giữa các element như ảnh mẫu.\n" +
        "5. sectionFidelity PHẢI có entry cho mọi cluster có list_line trong visualBlueprint.\n" +
        "6. Trả về JSON đúng schema (additionalProperties: false), không thêm field, không giải thích ngoài tool call.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `Fidelity: ${input.fidelity ?? "balanced"}\n` +
            (input.customInstructions ? `Yêu cầu thêm: ${input.customInstructions}\n` : "") +
            (input.roleHint ? `Role gợi ý: ${input.roleHint}\n` : "") +
            (input.fidelity === "creative"
              ? "\n[CREATIVE MAX VISUAL FIDELITY] Mục tiêu 100% giống ảnh mẫu về mọi khía cạnh visual (vị trí, size, line breaks, spacing, alignment). Ưu tiên exactRect + textRunParts chi tiết tuyệt đối, ngay cả khi làm cho binding phức tạp hơn. Chỉ tinh chỉnh nếu thực sự cải thiện recognizability của design gốc.\n"
              : "") +
            "\n=== VISUAL BLUEPRINT (pass 1) ===\n" +
            JSON.stringify(input.visualBlueprint, null, 2) +
            "\n\n=== DATA BLUEPRINT (pass 2) ===\n" +
            JSON.stringify(input.dataBlueprint ?? {}, null, 2) +
            "\n\nHãy gọi build_template_frame với quyết định fidelity chính xác nhất.",
        },
        // Vision image for grounding
        {
          type: "image_url",
          image_url: { url: input.sourceImageDataUrl ?? "" },
        },
      ],
    },
  ];

  const result = await callAi({
    useVisionModel: true,
    messages,
    tools: [BUILD_TEMPLATE_FRAME_TOOL],
    tool_choice: { type: "function", function: { name: "build_template_frame" } },
    temperature: 0.2,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const toolArgs = result.toolArgs as { templateFrame?: TemplateFrameSpec } | null;
  const frame = toolArgs?.templateFrame;

  if (!frame || frame.version !== 3) {
    return { ok: false, error: "AI không trả TemplateFrameSpec hợp lệ (version 3)." };
  }

  return { ok: true, frame };
}

export async function runVisionTemplatePipeline(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
}): Promise<{ ok: true; blueprint: CombinedLayoutBlueprint } | { ok: false; error: string }> {
  const visualPass = await runVisualBlueprintPass(input);
  if (!visualPass.ok) return visualPass;

  const dataPass = await runDataBlueprintPass({
    visualBlueprint: visualPass.visualBlueprint,
    customInstructions: input.customInstructions,
    roleHint: input.roleHint,
    preferVisibleLines: input.preferVisibleLines,
    dataColumns: input.dataColumns,
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

  // Layer 3 gating policy (Phase 3):
  // - "strict":   skip entirely (fast, cheap, predictable; relies on L1+L2 + JS heuristics only)
  // - "balanced": run L3 (current default behavior, good trade-off)
  // - "creative": run L3 with maximum effort (strongest visual fidelity instructions)
  //
  // Graceful: when skipped or failed, materializer falls back cleanly (no layer3Frame).
  const shouldRunLayer3 = (input.fidelity ?? "balanced") !== "strict";

  let layer3Frame: TemplateFrameSpec | undefined;
  if (shouldRunLayer3) {
    const l3Start = Date.now();
    try {
      const l3 = await runTemplateFrameSynthesisPass({
        visualBlueprint: visualPass.visualBlueprint,
        dataBlueprint: dataPass.dataBlueprint,
        sourceImageDataUrl: input.imageDataUrl,
        fidelity: input.fidelity,
        customInstructions: input.customInstructions,
        dataColumns: input.dataColumns,
      });
    if (l3.ok) {
      layer3Frame = l3.frame;
      const conf = l3.frame.synthesis?.confidence;
      if (typeof conf === "number" && conf < 0.6) {
        visualPass.visualBlueprint.warnings = [
          ...(visualPass.visualBlueprint.warnings ?? []),
          `Layer 3 confidence thấp (${conf.toFixed(2)}). Kết quả có thể cần chỉnh tay nhiều hơn.`,
        ];
      }
    } else {
        visualPass.visualBlueprint.warnings = [
          ...(visualPass.visualBlueprint.warnings ?? []),
          `Layer 3 (fidelity=${input.fidelity ?? "balanced"}) fallback: ${l3.error}. Template vẫn dùng L1+L2 heuristics.`,
        ];
      }
    } catch (e: any) {
      visualPass.visualBlueprint.warnings = [
        ...(visualPass.visualBlueprint.warnings ?? []),
        `Layer 3 (fidelity=${input.fidelity ?? "balanced"}) error: ${e?.message ?? e}. Template vẫn dùng L1+L2 heuristics.`,
      ];
    } finally {
      if (process.env.NODE_ENV !== "production") {
        const ms = Date.now() - l3Start;
        console.debug(`[Layer3] synthesis took ${ms}ms (fidelity=${input.fidelity ?? "balanced"})`);
      }
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.debug(`[Layer3] skipped (fidelity=strict)`);
  }

  const blueprint: CombinedLayoutBlueprint = {
    version: 2,
    visualBlueprint: visualPass.visualBlueprint,
    dataBlueprint: dataPass.dataBlueprint,
    ...(layer3Frame ? { layer3Frame } : {}),
  };

  return { ok: true, blueprint };
}

export async function buildCombinedLayoutJson(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
}): Promise<{ ok: true; layoutJson: string } | { ok: false; error: string }> {
  const result = await runVisionTemplatePipeline(input);
  if (!result.ok) return result;
  return {
    ok: true,
    layoutJson: serializeCombinedLayoutBlueprint(result.blueprint),
  };
}
