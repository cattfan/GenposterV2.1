import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import type { AppSettings } from "@/models";

interface Props {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  searchHighlightFieldId?: string;
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: "light", label: "Sáng", hint: "Luôn dùng giao diện sáng" },
  { value: "dark", label: "Tối", hint: "Luôn dùng giao diện tối" },
  { value: "system", label: "Theo hệ thống", hint: "Đổi theo cài đặt OS" },
];

export function GeneralSection({ settings, update, searchHighlightFieldId }: Props) {
  const { mode, setMode } = useTheme();
  const themeValue = (settings.theme ?? mode ?? "system") as ThemeMode;

  const onThemeChange = (next: ThemeMode) => {
    setMode(next);
    update({ theme: next });
  };

  return (
    <div className="space-y-6">
      <Card data-highlighted={searchHighlightFieldId === "theme" || undefined}>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map((opt) => {
              const selected = themeValue === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onThemeChange(opt.value)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:border-primary/40 hover:bg-accent/30",
                  )}
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{opt.hint}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ngôn ngữ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Tiếng Việt</div>
        </CardContent>
      </Card>

      <Card data-highlighted={searchHighlightFieldId === "canvas" || undefined}>
        <CardHeader>
          <CardTitle>Khổ ảnh mặc định</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label>Width</Label>
            <Input
              type="number"
              value={settings.defaultCanvas.width}
              onChange={(e) =>
                update({
                  defaultCanvas: {
                    ...settings.defaultCanvas,
                    width: Number(e.target.value) || 1588,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Height</Label>
            <Input
              type="number"
              value={settings.defaultCanvas.height}
              onChange={(e) =>
                update({
                  defaultCanvas: {
                    ...settings.defaultCanvas,
                    height: Number(e.target.value) || 2248,
                  },
                })
              }
            />
          </div>
          <div data-highlighted={searchHighlightFieldId === "exportScale" || undefined}>
            <Label>Độ nét file tải xuống</Label>
            <Input
              type="number"
              min={1}
              max={4}
              value={settings.exportScale}
              onChange={(e) =>
                update({ exportScale: Number(e.target.value) || 2 })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card data-highlighted={searchHighlightFieldId === "drive" || undefined}>
        <CardHeader>
          <CardTitle>Drive root folder</CardTitle>
        </CardHeader>
        <CardContent>
          <Label>URL thư mục Google Drive</Label>
          <Input
            value={settings.driveRootFolderUrl ?? ""}
            onChange={(e) => update({ driveRootFolderUrl: e.target.value || undefined })}
            placeholder="https://drive.google.com/drive/folders/..."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Dùng cho flow tải ảnh từ Drive ở trang Dữ liệu.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
