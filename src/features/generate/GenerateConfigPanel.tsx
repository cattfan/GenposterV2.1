import { Minus, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PackGenerateActions } from "@/features/generate/PackGenerateActions";
import { cn } from "@/lib/utils";

interface GenerateConfigState {
  prioritizePartner: boolean;
  onlyPartner: boolean;
  partnerQuotaPerPage: number;
}

interface Props {
  maxEntities: number;
  onMaxEntitiesChange: (value: number) => void;
  normalizeCount: (value: number, fallback: number) => number;
  config: GenerateConfigState;
  onConfigChange: (patch: Partial<GenerateConfigState>) => void;
  varyFontsFromSecondBundle: boolean;
  onVaryFontsChange: (value: boolean) => void;
  activeTargetCount: number;
  stats: {
    entityCount: number;
    pageCount: number;
    boundCount: number;
    estimatedPages: number;
  };
  canGenerate: boolean;
  generateReason: string;
  hasEntities: boolean;
  onGenerate: () => void;
  bare?: boolean;
}

function ConfigToolbar({ estimatedPages }: { estimatedPages: number }) {
  return (
    <div
      role="toolbar"
      aria-label="Cấu hình bộ ảnh"
      className="flex min-h-11 flex-nowrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0 text-primary" />
        <span className="truncate text-xs font-medium">Cấu hình</span>
      </div>
      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-xs">
        ~{estimatedPages} trang
      </Badge>
    </div>
  );
}

function ConfigBody({
  maxEntities,
  onMaxEntitiesChange,
  normalizeCount,
  config,
  onConfigChange,
  activeTargetCount,
  stats,
  canGenerate,
  generateReason,
  hasEntities,
  onGenerate,
}: Omit<Props, "bare" | "varyFontsFromSecondBundle" | "onVaryFontsChange">) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label className="text-xs">Số lượng tạo bộ ảnh</Label>
        <div className="mt-1 flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onMaxEntitiesChange(Math.max(1, maxEntities - 1))}
            aria-label="Giảm số lượng tạo"
            title="Giảm số lượng tạo"
          >
            <Minus className="size-3.5" />
          </Button>
          <Input
            type="number"
            min={1}
            value={maxEntities}
            onChange={(e) => onMaxEntitiesChange(normalizeCount(Number(e.target.value), 5))}
            className="h-8 text-center text-sm"
            aria-label="Số lượng tạo bộ ảnh"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onMaxEntitiesChange(maxEntities + 1)}
            aria-label="Tăng số lượng tạo"
            title="Tăng số lượng tạo"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs">
        <Checkbox
          checked={config.prioritizePartner}
          onCheckedChange={(v) => onConfigChange({ prioritizePartner: v === true })}
          className="mt-0.5"
        />
        <span className="min-w-0 font-medium">Ưu tiên dữ liệu đối tác</span>
      </label>

      <div>
        <Label className="text-xs">Số đối tác / trang</Label>
        <Input
          type="number"
          min={0}
          max={Math.max(1, activeTargetCount)}
          value={config.onlyPartner ? activeTargetCount || 1 : config.partnerQuotaPerPage}
          disabled={config.onlyPartner}
          onChange={(e) =>
            onConfigChange({
              partnerQuotaPerPage: Math.max(0, Number(e.target.value) || 0),
            })
          }
          className="mt-1 h-8 text-sm max-lg:h-9"
        />
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
        <span>Dữ liệu</span>
        <b className="text-right text-foreground">{stats.entityCount}</b>
        <span>Trang</span>
        <b className="text-right text-foreground">{stats.pageCount}</b>
        <span>Đã gắn</span>
        <b className="text-right text-foreground">{stats.boundCount}</b>
      </div>

      <PackGenerateActions
        canGenerate={canGenerate}
        reason={generateReason}
        hasEntities={hasEntities}
        onGenerate={onGenerate}
      />
    </div>
  );
}

export function GenerateConfigPanel(props: Props) {
  if (props.bare) {
    return <ConfigBody {...props} />;
  }

  return (
    <Card className={cn("overflow-hidden border-0 shadow-none lg:border lg:shadow-sm")}>
      <ConfigToolbar estimatedPages={props.stats.estimatedPages} />
      <CardContent className="p-3">
        <ConfigBody {...props} />
      </CardContent>
    </Card>
  );
}
