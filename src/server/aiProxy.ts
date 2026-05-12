import { createServerFn } from "@tanstack/react-start";

import type { AiProviderConfig } from "@/models";

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type GatewayTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type GatewayToolChoice = { type: "function"; function: { name: string } } | "auto";

type AiServerCallInput = {
  config: AiProviderConfig;
  messages: GatewayMessage[];
  tools?: GatewayTool[];
  tool_choice?: GatewayToolChoice;
  temperature?: number;
  useVisionModel?: boolean;
};

type OpenAiCompatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { arguments?: string } }>;
    };
  }>;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]),
    );
  }
  return null;
}

function validateAiServerInput(input: unknown): AiServerCallInput {
  if (!isRecord(input)) throw new Error("Thieu cau hinh AI.");
  const config = input.config;
  if (!isRecord(config)) throw new Error("Thieu cau hinh provider AI.");

  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  const model = typeof config.model === "string" ? config.model.trim() : "";
  const visionModel = typeof config.visionModel === "string" ? config.visionModel.trim() : undefined;
  const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : undefined;
  const preset =
    config.preset === "deepseek" || config.preset === "lovable" || config.preset === "custom"
      ? config.preset
      : "custom";

  if (!baseUrl) throw new Error("Chua dien Base URL AI.");
  if (baseUrl.length > 2000) throw new Error("Base URL AI qua dai.");
  if (!model) throw new Error("Chua dien model AI.");

  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Thieu noi dung de goi AI.");
  }

  return {
    config: { preset, baseUrl, model, visionModel, apiKey },
    messages: messages as GatewayMessage[],
    tools: Array.isArray(input.tools) ? (input.tools as GatewayTool[]) : undefined,
    tool_choice: input.tool_choice as GatewayToolChoice | undefined,
    temperature: typeof input.temperature === "number" ? input.temperature : undefined,
    useVisionModel: Boolean(input.useVisionModel),
  };
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

function validateHttpUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Base URL AI chi ho tro http/https.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function normalizeContent(content: unknown): string | null {
  if (typeof content === "string" || content === null) return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return content == null ? null : String(content);
}

function providerError(status: number, text: string) {
  if (status === 429) return "AI rate limit - thu lai sau.";
  if (status === 402) return "Het credits AI.";
  if (status === 401) return "API key sai/het han - kiem tra lai trong Cai dat.";
  if (status === 404) return "Base URL hoac model khong dung. Kiem tra endpoint /v1 va ten model.";
  return `AI loi ${status}: ${text.slice(0, 600)}`;
}

export const callAiServer = createServerFn({ method: "POST" })
  .inputValidator(validateAiServerInput)
  .handler(async ({ data }) => {
    let url: string;
    try {
      url = joinUrl(validateHttpUrl(data.config.baseUrl), "chat/completions");
    } catch (error) {
      return {
        ok: false as const,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const model =
      data.useVisionModel && data.config.visionModel ? data.config.visionModel : data.config.model;
    if (!model) {
      return { ok: false as const, status: 0, error: "Chua dien model AI." };
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (data.config.apiKey) headers.Authorization = `Bearer ${data.config.apiKey}`;

    const body: Record<string, unknown> = {
      model,
      messages: data.messages,
      temperature: data.temperature ?? 0.3,
    };
    if (data.tools) body.tools = data.tools;
    if (data.tool_choice) body.tool_choice = data.tool_choice;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false as const, status: res.status, error: providerError(res.status, text) };
      }

      const json = (await res.json()) as OpenAiCompatResponse;
      const choice = json.choices?.[0]?.message;
      let toolArgs: JsonValue | null = null;
      const argStr = choice?.tool_calls?.[0]?.function?.arguments;
      if (argStr) {
        try {
          toolArgs = toJsonValue(JSON.parse(argStr));
        } catch {
          toolArgs = null;
        }
      }

      return {
        ok: true as const,
        content: normalizeContent(choice?.content),
        toolArgs,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Qua thoi gian cho AI phan hoi."
          : error instanceof Error
            ? error.message
            : String(error);
      return {
        ok: false as const,
        status: 0,
        error: `Khong goi duoc ${url}: ${message}. Kiem tra Base URL, mang hoac provider.`,
      };
    } finally {
      clearTimeout(timeout);
    }
  });
