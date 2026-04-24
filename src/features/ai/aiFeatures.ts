// Các AI feature functions client-side, dùng aiClient.callAi.
// Thay thế server functions trong src/server/aiTemplate.ts (server fn không gọi được localhost).

import { callAi } from "./aiClient";
import { AI_POSTER_FONT_FAMILIES } from "@/features/editor/fonts";
import { buildCombinedLayoutJson } from "./visionPipeline";

// ============================================================
// 1. Generate page layout từ 1 ảnh
// ============================================================

export type LayoutFidelity = "strict" | "balanced" | "creative";

const TEMPLATE_TOOL = {
  type: "function" as const,
  function: {
    name: "build_layout",
    description:
      "Tạo khung layout dạng portrait (1080x1350) dựa trên ảnh mẫu. CHỈ tạo placeholder, KHÔNG bịa nội dung text thật.",
    parameters: {
      type: "object",
      properties: {
        canvas: {
          type: "object",
          properties: { bgColor: { type: "string" } },
        },
        slots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              kind: { type: "string", enum: ["text", "image", "shape"] },
              shapeKind: { type: "string", enum: ["rectangle", "circle", "badge", "line", "divider"] },
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
              z: { type: "number" },
              rotation: { type: "number" },
              placeholder: { type: "string" },
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
            required: ["kind", "x", "y", "w", "h"],
          },
        },
      },
      required: ["canvas", "slots"],
    },
  },
};

function fidelityInstruction(fidelity: LayoutFidelity): string {
  switch (fidelity) {
    case "strict":
      return "Ưu tiên bám sát bố cục, nhịp ảnh, số cụm text, tỷ lệ tiêu đề và vị trí các ảnh phụ giống ảnh mẫu nhất có thể. Chỉ đơn giản hóa khi chi tiết thật sự không đọc được.";
    case "creative":
      return "Giữ tinh thần ảnh mẫu nhưng được phép sáng tạo nhẹ để layout sạch hơn, miễn vẫn nhận ra cùng visual language.";
    case "balanced":
    default:
      return "Giữ bố cục và visual language gần ảnh mẫu, nhưng vẫn tối ưu để template dễ chỉnh và dễ bind dữ liệu.";
  }
}

function buildLayoutSystem(input?: {
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  roleHint?: string;
}) {
  const fidelity = input?.fidelity ?? "strict";
  const customInstructions = input?.customInstructions?.trim();
  const roleHint = input?.roleHint?.trim();

  return (
    "Bạn là designer chuyển ảnh mẫu Instagram/Threads thành khung layout JSON có thể chỉnh sửa. " +
    "Mục tiêu là bám sát visual của ảnh mẫu, không tự động biến mọi thứ thành layout generic. " +
    "Quy tắc TUYỆT ĐỐI:\n" +
    "1. CHỈ tạo khung + placeholder. KHÔNG bịa nội dung text thật.\n" +
    "2. Mọi text phải là placeholder có nghĩa như {{title}}, {{eyebrow}}, {{subtitle}}, {{section_title_1}}, {{name_1}}, {{address_1}}, {{phone_1}}, {{price_1}}, {{hero_image_1}}, {{cta}}.\n" +
    "3. Toạ độ x/y/w/h là tỉ lệ 0..1 so với canvas portrait 1080x1350.\n" +
    "4. Phải tuân thủ nguyên tắc bleed/trim/safe zone: background full-page có thể bleed ra sát mép; nhưng mọi text, shape chứa text, danh sách và image holder quan trọng phải nằm trong safe zone, tránh sát mép canvas.\n" +
    "5. Safe zone mặc định coi như cách mép khoảng 5% mỗi cạnh. Chỉ background hoặc overlay nền mới được phủ toàn canvas.\n" +
    "6. Nếu ảnh mẫu là poster có 1 ảnh nền full-page tối, hãy dùng 1 image slot phủ toàn canvas + overlayColor để giữ đúng cảm giác nền tối.\n" +
    "7. Ảnh phụ/thumbnail nên dùng kind=image với borderRadius bo góc 20-40. Chỉ dùng circle khi ảnh mẫu thực sự tròn.\n" +
    "8. Được phép dùng 12-48 slot nếu cần để bám mẫu. Đừng ép đơn giản hóa quá mức khi ảnh mẫu có nhiều cụm text/ảnh.\n" +
    "9. Với poster list như du lịch/ăn uống/dịch vụ, nếu mắt người nhìn thấy nhiều dòng item riêng biệt thì PHẢI tạo từng dòng riêng, không được dồn thành 1 text block chung. Ví dụ 16 dòng quán thì phải có các placeholder riêng như {{name_1}}..{{name_16}} và {{address_1}}..{{address_16}}.\n" +
    "10. Nếu đã tách thành {{name_n}} / {{address_n}} thì KHÔNG được tạo thêm block tổng kiểu {{items_group_1}} chồng lên trên cùng khu vực.\n" +
    "11. Bullet không được dùng placeholder kiểu {{bullet}}. Bullet phải là shape tròn nhỏ hoặc ký tự bullet tĩnh.\n" +
    "12. Các block cùng một cụm phải dùng numbering nhất quán như {{section_title_1}} + {{hero_image_1}} + {{name_1}} + {{address_1}} + {{name_2}} + {{address_2}}...\n" +
    "13. Nếu ảnh mẫu chỉ có 4 image holder nhưng có 16 dòng quán, vẫn giữ 4 image holder, nhưng text phải tách đủ từng dòng item riêng biệt.\n" +
    "14. Hãy tận dụng z, opacity, overlayColor, textShadow, textStrokeColor/textStrokeWidth, lineHeight, letterSpacing, padding, shadow và rotation khi ảnh mẫu có các hiệu ứng đó.\n" +
    "15. Với title nổi bật kiểu chữ vàng/cam trên nền tối, phải encode rõ style tương ứng để template preview nhìn gần mẫu.\n" +
    "16. Không tự xoá các ảnh nổi bật thả quanh canvas nếu đó là đặc trưng chính của bố cục. Giữ nhịp collage/editorial của ảnh mẫu.\n" +
    `17. Font family chỉ được chọn trong danh sách sau: ${AI_POSTER_FONT_FAMILIES.join(", ")}.\n` +
    "18. Nếu ảnh mẫu giống poster bullet list, đừng biến thành layout card/service generic. Hãy giữ title, image holder và các nhóm list như mắt người thường nhìn thấy.\n" +
    "19. KHÔNG trả lời bằng văn xuôi. Chỉ gọi tool build_layout.\n" +
    `20. Mức ưu tiên hiện tại: ${fidelityInstruction(fidelity)}\n` +
    (roleHint ? `21. Hint vai trò page: ${roleHint}\n` : "") +
    (customInstructions ? `22. Yêu cầu thêm từ người dùng: ${customInstructions}\n` : "")
  );
}

export async function aiGenerateTemplateFromImage(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  preferVisibleLines?: boolean;
}) {
  return buildCombinedLayoutJson(input);
}

// ============================================================
// 2. Suggest bindings
// ============================================================

const BIND_TOOL = {
  type: "function" as const,
  function: {
    name: "suggest_bindings",
    description: "Gợi ý bindingPath cho từng slot.",
    parameters: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slotId: { type: "string" },
              suggestedBindingPath: { type: "string" },
              confidence: { type: "number" },
              reason: { type: "string" },
            },
            required: ["slotId", "suggestedBindingPath", "confidence"],
          },
        },
      },
      required: ["suggestions"],
    },
  },
};

export async function aiSuggestBindings(input: {
  slots: Array<{ slotId: string; kind: string; placeholder?: string; staticText?: string }>;
  columns: string[];
}) {
  const result = await callAi({
    messages: [
      {
        role: "system",
        content:
          "Bạn map placeholder text → bindingPath chuẩn. Chỉ chọn 1 trong: " +
          "entity.name, entity.address, entity.phone, entity.priceRange, entity.style, " +
          "entity.openingHours, entity.categoryMain, entity.categorySub, " +
          "asset.cover, asset.byRole:facade, asset.byRole:food_closeup, asset.byRole:space. " +
          "Nếu không chắc, đặt confidence < 0.5.",
      },
      {
        role: "user",
        content:
          "Cột data có sẵn: " +
          JSON.stringify(input.columns) +
          "\n\nSlot list:\n" +
          JSON.stringify(input.slots, null, 2),
      },
    ],
    tools: [BIND_TOOL],
    tool_choice: { type: "function", function: { name: "suggest_bindings" } },
    temperature: 0.1,
  });
  if (!result.ok) return { ok: false as const, error: result.error };
  if (!result.toolArgs) return { ok: false as const, error: "AI không trả suggestions" };
  const parsed = result.toolArgs as {
    suggestions?: Array<{
      slotId?: string;
      suggestedBindingPath?: string;
      confidence?: number;
      reason?: string;
    }>;
  };
  const suggestions = (parsed.suggestions ?? [])
    .filter((s) => s && typeof s.slotId === "string" && typeof s.suggestedBindingPath === "string")
    .map((s) => ({
      slotId: String(s.slotId),
      suggestedBindingPath: String(s.suggestedBindingPath),
      confidence: typeof s.confidence === "number" ? s.confidence : 0.5,
      reason: typeof s.reason === "string" ? s.reason : "",
    }));
  return { ok: true as const, suggestions };
}

// ============================================================
// 3. Caption từ entity
// ============================================================

export async function aiCaptionFromEntity(input: {
  entity: Record<string, unknown>;
  style?: "instagram" | "threads" | "facebook";
}) {
  const styleHint = {
    instagram: "Instagram caption: 2-3 dòng, có emoji vừa phải, thêm 5 hashtag liên quan ở cuối.",
    threads: "Threads post: ngắn 1-2 câu, giọng tự nhiên, KHÔNG hashtag.",
    facebook: "Facebook post: 3-5 dòng, dễ đọc, có emoji, KHÔNG hashtag.",
  }[input.style ?? "instagram"];
  const result = await callAi({
    messages: [
      {
        role: "system",
        content:
          "Bạn viết caption tiếng Việt dựa CHỈ trên data JSON. KHÔNG bịa thông tin (giá, địa chỉ, tên món...). " +
          "Nếu data thiếu trường, bỏ qua. " +
          styleHint,
      },
      {
        role: "user",
        content: "Data entity:\n```json\n" + JSON.stringify(input.entity, null, 2) + "\n```",
      },
    ],
    temperature: 0.7,
  });
  if (!result.ok) return { ok: false as const, error: result.error };
  return { ok: true as const, caption: (result.content ?? "").trim() };
}

export async function aiRewriteTextPreserveMeaning(input: {
  text: string;
  toneHint?: string;
  avoidText?: string;
  variationSeed?: string;
}) {
  const source = input.text.trim();
  if (!source) return { ok: false as const, error: "Textbox đang trống." };
  const avoidText = input.avoidText?.trim();
  const variationSeed =
    input.variationSeed ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const result = await callAi({
    messages: [
      {
        role: "system",
        content:
          "Bạn viết lại nội dung tiếng Việt cho textbox poster. Giữ nguyên ý, sự thật, tên riêng, địa chỉ, thứ tự ý và cấu trúc bullet nếu có. " +
          "Không thêm thông tin mới, không đổi nghĩa, không giải thích. Chỉ trả nội dung đã viết lại.",
      },
      {
        role: "user",
        content:
          (input.toneHint ? `Giọng văn mong muốn: ${input.toneHint}\n\n` : "") +
          (avoidText ? `Tránh lặp lại cách viết này:\n${avoidText}\n\n` : "") +
          `Mã biến thể: ${variationSeed}\n\n` +
          "Nội dung gốc:\n" +
          source,
      },
    ],
    temperature: 0.9,
  });
  if (!result.ok) return { ok: false as const, error: result.error };
  const text = (result.content ?? "").trim();
  if (!text) return { ok: false as const, error: "AI không trả nội dung mới." };
  return { ok: true as const, text };
}

// ============================================================
// 4. Combo từ nhiều ảnh: classify + gen từng page
// ============================================================

const CLASSIFY_TOOL = {
  type: "function" as const,
  function: {
    name: "classify_pages",
    description: "Phân loại từng ảnh + đoán packMeta.",
    parameters: {
      type: "object",
      properties: {
        packMeta: {
          type: "object",
          properties: {
            name: { type: "string" },
            goal: { type: "string" },
            tone: { type: "string" },
            cta: { type: "string" },
          },
          required: ["name"],
        },
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "number" },
              role: { type: "string", enum: ["cover", "utilities", "day", "outro", "other"] },
              dayNumber: { type: "number" },
              suggestedName: { type: "string" },
            },
            required: ["index", "role", "suggestedName"],
          },
        },
      },
      required: ["packMeta", "pages"],
    },
  },
};

export interface ComboResultPage {
  index: number;
  role: "cover" | "utilities" | "day" | "outro" | "other";
  dayNumber?: number;
  suggestedName: string;
  layoutJson: string;
}

export interface ComboResult {
  ok: true;
  pages: ComboResultPage[];
  packMeta: { name: string; goal?: string; tone?: string; cta?: string };
  warnings: string[];
}

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function genOnePageWithHint(
  input: {
    imageDataUrl: string;
    roleHint: string;
    fidelity?: LayoutFidelity;
    customInstructions?: string;
    preferVisibleLines?: boolean;
  },
): Promise<{ ok: true; layoutJson: string } | { ok: false; error: string }> {
  return buildCombinedLayoutJson(input);
}

export async function aiGenerateComboFromImages(input: {
  images: Array<{ dataUrl: string }>;
  packNameHint?: string;
  customInstructions?: string;
  layoutFidelity?: LayoutFidelity;
  preferVisibleLines?: boolean;
  onProgress?: (step: string, progress: number) => void;
}): Promise<ComboResult | { ok: false; error: string }> {
  if (input.images.length === 0) return { ok: false, error: "Cần ít nhất 1 ảnh" };

  input.onProgress?.(`Phân loại ${input.images.length} ảnh...`, 10);

  const userContent: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text:
        `Có ${input.images.length} ảnh (index 0..${input.images.length - 1}). ` +
        (input.packNameHint ? `Pack hint: "${input.packNameHint}". ` : "") +
        (input.customInstructions ? `Yêu cầu thêm: "${input.customInstructions}". ` : "") +
        "Phân loại + suy ra packMeta.",
    },
  ];
  input.images.forEach((im) =>
    userContent.push({ type: "image_url", image_url: { url: im.dataUrl } }),
  );

  const classifyRes = await callAi({
    useVisionModel: true,
    messages: [
      {
        role: "system",
        content:
          "Bạn nhìn tổng thể nhiều ảnh content pack du lịch/ẩm thực → suy ra vai trò mỗi page và pack metadata. " +
          "Quy tắc: ảnh đầu thường cover; ảnh có 'NGÀY X'/lịch trình là day; transport/homestay tổng hợp là utilities; CTA cuối là outro. " +
          "Nếu bộ ảnh có visual language rất đồng nhất, hãy giữ naming và phân vai trò đủ cụ thể để các page sau dựng lại được gần ảnh mẫu.",
      },
      { role: "user", content: userContent },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "function", function: { name: "classify_pages" } },
    temperature: 0.2,
  });

  if (!classifyRes.ok) return { ok: false, error: classifyRes.error };
  if (!classifyRes.toolArgs) return { ok: false, error: "AI không phân loại được" };

  const parsed = classifyRes.toolArgs as {
    packMeta?: { name?: string; goal?: string; tone?: string; cta?: string };
    pages?: Array<{
      index?: number;
      role?: ComboResultPage["role"];
      dayNumber?: number;
      suggestedName?: string;
    }>;
  };

  const packMeta = {
    name: parsed.packMeta?.name ?? input.packNameHint ?? "Combo AI",
    goal: parsed.packMeta?.goal,
    tone: parsed.packMeta?.tone,
    cta: parsed.packMeta?.cta,
  };

  const classified = (parsed.pages ?? [])
    .filter((p) => typeof p.index === "number" && p.index! >= 0 && p.index! < input.images.length)
    .map((p) => ({
      index: p.index!,
      role: (p.role ?? "other") as ComboResultPage["role"],
      dayNumber: typeof p.dayNumber === "number" ? p.dayNumber : undefined,
      suggestedName: p.suggestedName ?? `Page ${p.index! + 1}`,
    }));
  for (let i = 0; i < input.images.length; i++) {
    if (!classified.find((c) => c.index === i)) {
      classified.push({
        index: i,
        role: "other" as const,
        dayNumber: undefined,
        suggestedName: `Page ${i + 1}`,
      });
    }
  }
  classified.sort((a, b) => a.index - b.index);

  let done = 0;
  const layouts = await runWithLimit(classified, 3, async (c) => {
      const roleHint =
      c.role === "cover"
        ? "Trang bìa / poster hero: 1 ảnh nền lớn full-page, eyebrow nhỏ, title lớn nổi bật, có thể có subtitle ngắn. Giữ đúng cảm giác poster của ảnh mẫu."
        : c.role === "utilities"
          ? "Trang tiện ích / directory poster: nền ảnh full-page tối, title lớn ở top-center, 2-4 cụm bullet list, 3-4 ảnh bo góc floating quanh canvas, ưu tiên rất giống ảnh mẫu."
          : c.role === "day"
            ? `Trang lịch trình / quán ăn Ngày ${c.dayNumber ?? "?"}: poster nền full-page, title mạnh, nhiều cụm list theo bữa hoặc theo block, ảnh minh họa bo góc xen kẽ, ưu tiên bám sát mẫu thay vì generic card list.`
            : c.role === "outro"
              ? "Trang kết / CTA: ít thành phần, tập trung 1 lời kêu gọi hành động rõ ràng."
              : "Page nội dung editorial: có thể dùng nền ảnh lớn, title nổi, vài cụm text và ảnh phụ nổi bật. Đừng ép thành layout generic nếu mẫu có cá tính rõ.";
    const r = await genOnePageWithHint({
      imageDataUrl: input.images[c.index].dataUrl,
      roleHint,
      fidelity: input.layoutFidelity,
      customInstructions: input.customInstructions,
      preferVisibleLines: input.preferVisibleLines,
    });
    done++;
    input.onProgress?.(
      `Dựng ${done}/${classified.length}...`,
      20 + Math.round((70 * done) / classified.length),
    );
    return { classified: c, gen: r };
  });

  const pages: ComboResultPage[] = [];
  const warnings: string[] = [];
  for (const x of layouts) {
    if (x.gen.ok) {
      pages.push({
        index: x.classified.index,
        role: x.classified.role,
        dayNumber: x.classified.dayNumber,
        suggestedName: x.classified.suggestedName,
        layoutJson: x.gen.layoutJson,
      });
    } else {
      warnings.push(`Page ${x.classified.index + 1}: ${x.gen.error}`);
    }
  }

  if (pages.length === 0) {
    return { ok: false, error: "Tất cả page đều fail:\n" + warnings.join("\n") };
  }

  input.onProgress?.("Tạo pack...", 95);
  return { ok: true, pages, packMeta, warnings };
}
