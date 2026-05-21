import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppSettings, GenerateDefaults } from "@/models";

interface Props {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  searchHighlightFieldId?: string;
}

const DEFAULT_GENERATE: GenerateDefaults = {
  maxEntities: 5,
  prioritizePartner: true,
  onlyPartner: false,
  partnerQuotaPerPage: 1,
};

export function AdvancedSection({ settings, update, searchHighlightFieldId }: Props) {
  const gen = settings.generateDefaults ?? DEFAULT_GENERATE;
  const updateGenerate = (patch: Partial<GenerateDefaults>) =>
    update({ generateDefaults: { ...gen, ...patch } });

  return (
    <div className="space-y-6">
      <Card data-highlighted={searchHighlightFieldId === "generateDefaults" || undefined}>
        <CardHeader>
          <CardTitle>Generate defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Giá trị mặc định cho mẻ generate mới ở trang Tạo nội dung. Đổi ở từng mẻ vẫn được.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Số mẻ tối đa (maxEntities)</Label>
              <Input
                type="number"
                min={1}
                value={gen.maxEntities}
                onChange={(e) =>
                  updateGenerate({ maxEntities: Math.max(1, Number(e.target.value) || 5) })
                }
              />
            </div>
            <div>
              <Label>Số ô đối tác mỗi trang</Label>
              <Input
                type="number"
                min={0}
                value={gen.partnerQuotaPerPage}
                onChange={(e) =>
                  updateGenerate({
                    partnerQuotaPerPage: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <div>
              <div className="text-sm font-medium">Ưu tiên đối tác</div>
              <div className="text-xs text-muted-foreground">
                Đối tác xuất hiện trước trong mỗi mẻ.
              </div>
            </div>
            <Switch
              checked={gen.prioritizePartner}
              onCheckedChange={(v) => updateGenerate({ prioritizePartner: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <div>
              <div className="text-sm font-medium">Chỉ đối tác</div>
              <div className="text-xs text-muted-foreground">
                Chỉ generate cho rows có flag đối tác.
              </div>
            </div>
            <Switch
              checked={gen.onlyPartner}
              onCheckedChange={(v) => updateGenerate({ onlyPartner: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card data-highlighted={searchHighlightFieldId === "captionProvider" || undefined}>
        <CardHeader>
          <CardTitle>Caption provider</CardTitle>
        </CardHeader>
        <CardContent>
          <Label>Provider tạo caption</Label>
          <Select
            value={settings.captionProvider}
            onValueChange={(v) => update({ captionProvider: v as AppSettings["captionProvider"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local (mặc định)</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
            </SelectContent>
          </Select>
          {settings.captionProvider === "openai" && (
            <div className="mt-3">
              <Label>OpenAI API key (cho caption)</Label>
              <Input
                type="password"
                value={settings.captionApiKey ?? ""}
                onChange={(e) => update({ captionApiKey: e.target.value || undefined })}
                placeholder="sk-..."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
