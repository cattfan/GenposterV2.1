// Các AI feature functions client-side, dùng aiClient.callAi.
// Thay thế server functions trong src/server/aiTemplate.ts (server fn không gọi được localhost).

import { callAi } from "./aiClient";
import { buildCombinedLayoutJson } from "./visionPipeline";

// ============================================================
// 1. Generate page layout từ 1 ảnh
// ============================================================

export type LayoutFidelity = "strict" | "balanced" | "creative";

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
