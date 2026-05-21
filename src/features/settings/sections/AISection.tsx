import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AI_PRESETS, defaultAiConfig, testAiConfig } from "@/features/ai/aiClient";
import type { AiProviderConfig, AiProviderPreset, AppSettings } from "@/models";

interface Props {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  searchHighlightFieldId?: string;
}

export function AISection({ settings, update, searchHighlightFieldId }: Props) {
  const ai = settings.ai ?? defaultAiConfig("deepseek");
  const presetSpec = AI_PRESETS[ai.preset];
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const setAi = (next: AiProviderConfig) => update({ ai: next });

  const onPresetChange = (preset: AiProviderPreset) => {
    if (preset === ai.preset) return;
    const fresh = defaultAiConfig(preset);
    if (ai.apiKey) fresh.apiKey = ai.apiKey;
    setAi(fresh);
    setTestResult(null);
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testAiConfig(ai);
      if (r.ok) {
        setTestResult({
          ok: true,
          msg: `Provider OK. Trả về: "${(r.content ?? "").slice(0, 40)}"`,
        });
      } else {
        setTestResult({ ok: false, msg: r.error });
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Tất cả tính năng AI sẽ gọi qua endpoint OpenAI-compatible này. App gửi qua server
          local trước để tránh lỗi CORS của provider.
        </p>

        <div data-highlighted={searchHighlightFieldId === "preset" || undefined}>
          <Label>Preset</Label>
          <Select value={ai.preset} onValueChange={(v) => onPresetChange(v as AiProviderPreset)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AI_PRESETS) as AiProviderPreset[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {AI_PRESETS[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{presetSpec.hint}</p>
        </div>

        <div data-highlighted={searchHighlightFieldId === "baseUrl" || undefined}>
          <Label>Base URL</Label>
          <Input
            value={ai.baseUrl}
            onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-highlighted={searchHighlightFieldId === "model" || undefined}>
            <Label>Model</Label>
            <Input
              value={ai.model}
              onChange={(e) => setAi({ ...ai, model: e.target.value })}
              placeholder="deepseek-chat"
            />
          </div>
          <div data-highlighted={searchHighlightFieldId === "visionModel" || undefined}>
            <Label>Vision model (tùy chọn)</Label>
            <Input
              value={ai.visionModel ?? ""}
              onChange={(e) => setAi({ ...ai, visionModel: e.target.value || undefined })}
              placeholder="bỏ trống → dùng cùng Model"
            />
          </div>
        </div>

        <div data-highlighted={searchHighlightFieldId === "apiKey" || undefined}>
          <Label>API key {presetSpec.needsApiKey ? "" : "(tùy chọn)"}</Label>
          <div className="flex items-center gap-2">
            <Input
              type={showApiKey ? "text" : "password"}
              value={ai.apiKey ?? ""}
              onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
              placeholder={presetSpec.needsApiKey ? "sk-..." : "(không cần với local LLM)"}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowApiKey((v) => !v)}
              aria-label={showApiKey ? "Ẩn API key" : "Hiện API key"}
            >
              {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Lưu local trong trình duyệt. Khi gọi AI, key chỉ được gửi tới server local và provider
            đã cấu hình.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Test kết nối
          </Button>
          {testResult && (
            <span
              className={`flex items-center gap-1 text-sm ${
                testResult.ok ? "text-green-600" : "text-destructive"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              <span className="truncate">{testResult.msg}</span>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
