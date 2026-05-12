// Client-side AI gateway. The browser calls a local server function, then the
// server calls the OpenAI-compatible provider. This avoids provider CORS issues.

import type { AiProviderConfig, AiProviderPreset } from "@/models";
import { callAiServer } from "@/server/aiProxy";
import { getSettings } from "@/storage/settings";

export interface AiPresetSpec {
  label: string;
  baseUrl: string;
  model: string;
  visionModel?: string;
  needsApiKey: boolean;
  hint: string;
}

export const AI_PRESETS: Record<AiProviderPreset, AiPresetSpec> = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    needsApiKey: true,
    hint: "Lay API key tai https://platform.deepseek.com",
  },
  lovable: {
    label: "Lovable AI Gateway",
    baseUrl: "https://ai.gateway.lovable.dev/v1",
    model: "google/gemini-2.5-pro",
    visionModel: "google/gemini-2.5-pro",
    needsApiKey: true,
    hint: "Dan LOVABLE_API_KEY trong Workspace Settings cua Lovable.",
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    baseUrl: "http://localhost:20128/v1",
    model: "cx/gpt-5.4",
    needsApiKey: false,
    hint: "Tu dien base URL + model name. Ho tro LM Studio, vLLM, Ollama hoac endpoint OpenAI-compatible.",
  },
};

export function defaultAiConfig(preset: AiProviderPreset = "deepseek"): AiProviderConfig {
  const p = AI_PRESETS[preset];
  return {
    preset,
    baseUrl: p.baseUrl,
    model: p.model,
    visionModel: p.visionModel,
    apiKey: "",
  };
}

interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

interface GatewayTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface AiCallOptions {
  messages: GatewayMessage[];
  tools?: GatewayTool[];
  tool_choice?: { type: "function"; function: { name: string } } | "auto";
  temperature?: number;
  useVisionModel?: boolean;
  /** Override config, used by Settings before saving. */
  config?: AiProviderConfig;
}

export type AiCallResult =
  | { ok: true; content: string | null; toolArgs: unknown | null }
  | { ok: false; status: number; error: string };

async function loadConfig(): Promise<AiProviderConfig | null> {
  const s = await getSettings();
  return s.ai ?? null;
}

export async function callAi(opts: AiCallOptions): Promise<AiCallResult> {
  const cfg = opts.config ?? (await loadConfig());
  if (!cfg || !cfg.baseUrl) {
    return {
      ok: false,
      status: 0,
      error: "Chua cau hinh AI provider - vao Cai dat de dien Base URL va model.",
    };
  }

  const model = opts.useVisionModel && cfg.visionModel ? cfg.visionModel : cfg.model;
  if (!model) {
    return { ok: false, status: 0, error: "Chua dien model AI trong Cai dat." };
  }

  try {
    const result = await callAiServer({
      data: {
        config: cfg,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: opts.tool_choice,
        temperature: opts.temperature,
        useVisionModel: opts.useVisionModel,
      },
    });
    return result as AiCallResult;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      error:
        `Khong goi duoc AI qua server local: ${msg}. ` +
        "Kiem tra dev server va provider co truy cap duoc tu may nay khong.",
    };
  }
}

/** Test one small ping to verify provider, key, model and network. */
export async function testAiConfig(cfg: AiProviderConfig): Promise<AiCallResult> {
  return callAi({
    config: cfg,
    messages: [
      { role: "system", content: "Reply with exactly the word: OK" },
      { role: "user", content: "ping" },
    ],
    temperature: 0,
  });
}
