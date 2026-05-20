import { ArrowLeft, Link2, Settings2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  selectedSlotCount: number;
  canGenerate: boolean;
  generateReason: string;
  onBack: () => void;
  onOpenConfig: () => void;
  onOpenBind: () => void;
  onGenerate: () => void;
}

export function GenerateMobileToolbar({
  selectedSlotCount,
  canGenerate,
  generateReason,
  onBack,
  onOpenConfig,
  onOpenBind,
  onGenerate,
}: Props) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur lg:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0"
        onClick={onBack}
        title="Quay lại danh sách khuôn"
        aria-label="Quay lại"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 flex-1 gap-1.5"
        onClick={onOpenConfig}
      >
        <Settings2 className="size-4" data-icon="inline-start" />
        Cấu hình
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative h-9 flex-1 gap-1.5"
        onClick={onOpenBind}
      >
        <Link2 className="size-4" data-icon="inline-start" />
        Liên kết
        {selectedSlotCount > 0 ? (
          <Badge
            variant="secondary"
            className="absolute -right-1 -top-1 size-5 justify-center p-0 text-xs"
          >
            {selectedSlotCount}
          </Badge>
        ) : null}
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-9 shrink-0 gap-1.5"
        disabled={!canGenerate}
        onClick={onGenerate}
        title={generateReason}
      >
        <Sparkles className="size-4" data-icon="inline-start" />
        Tạo
      </Button>
    </div>
  );
}
