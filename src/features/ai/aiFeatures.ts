// Các AI feature functions client-side, dùng aiClient.callAi.
// Thay thế server functions trong src/server/aiTemplate.ts (server fn không gọi được localhost).

import { callAi } from "./aiClient";
import { buildCombinedLayoutJson } from "./visionPipeline";

// ============================================================
// 1. Generate page layout từ 1 ảnh (3-layer AI pipeline)
// ============================================================

// Fidelity levels. "creative" enables stronger Layer 3 (Template Frame Synthesis)
// for maximum visual match to the source design image.
export type LayoutFidelity = "strict" | "balanced" | "creative";

export async function aiGenerateTemplateFromImage(input: {
  imageDataUrl: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
}) {
  // Layer 3 is automatically engaged inside the pipeline for all fidelities
  // (with increasing emphasis on exact visual match for "creative").
  return buildCombinedLayoutJson(input);
}

/** Convenience wrapper that forces the highest-fidelity 3-layer path. */
export async function aiGenerateHighFidelityTemplateFromImage(
  input: Omit<Parameters<typeof aiGenerateTemplateFromImage>[0], "fidelity">,
) {
  return aiGenerateTemplateFromImage({ ...input, fidelity: "creative" });
}

// ============================================================
// 2. Caption từ entity
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
// 3. Combo từ nhiều ảnh: classify + gen từng page
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
  sourceImageDataUrl?: string;
}

export interface ComboResult {
  ok: true;
  pages: ComboResultPage[];
  packMeta: { name: string; goal?: string; tone?: string; cta?: string };
  warnings: string[];
}

const COMBO_PAGE_CONCURRENCY = 5;

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

async function genOnePageWithHint(input: {
  imageDataUrl: string;
  roleHint: string;
  fidelity?: LayoutFidelity;
  customInstructions?: string;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
}): Promise<{ ok: true; layoutJson: string } | { ok: false; error: string }> {
  return buildCombinedLayoutJson(input);
}

export async function aiGenerateComboFromImages(input: {
  images: Array<{ dataUrl: string }>;
  packNameHint?: string;
  customInstructions?: string;
  layoutFidelity?: LayoutFidelity;
  preferVisibleLines?: boolean;
  dataColumns?: string[];
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
  const layouts = await runWithLimit(classified, COMBO_PAGE_CONCURRENCY, async (c) => {
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
      dataColumns: input.dataColumns,
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
        sourceImageDataUrl: input.images[x.classified.index].dataUrl,
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
