import type { ReactNode } from "react";
import {
  Eye,
  LayoutTemplate,
  Link2,
  MoreHorizontal,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onEditLayout: () => void;
  canvasReady: boolean;
  showFieldBadges: boolean;
  onShowFieldBadgesChange: (value: boolean) => void;
  showSafeFrame: boolean;
  onShowSafeFrameChange: (value: boolean) => void;
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ToolbarIconButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "size-8 shrink-0",
            pressed && "bg-primary/10 text-primary hover:bg-primary/15",
          )}
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          aria-pressed={pressed}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function GenerateCanvasToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onEditLayout,
  canvasReady,
  showFieldBadges,
  onShowFieldBadgesChange,
  showSafeFrame,
  onShowSafeFrameChange,
}: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Công cụ canvas"
        className="flex min-h-11 flex-nowrap items-center gap-1.5 overflow-x-auto border-b bg-muted/30 px-2 py-1.5"
      >
        <ToolbarGroup>
          <ToolbarIconButton
            label="Hoàn tác (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Làm lại (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 className="size-4" />
          </ToolbarIconButton>
        </ToolbarGroup>

        <ToolbarDivider />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              disabled={!canvasReady}
              onClick={onEditLayout}
            >
              <LayoutTemplate className="size-3.5" />
              <span className="hidden min-[1280px]:inline">Chỉnh bố cục</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="min-[1280px]:hidden">
            Chỉnh bố cục
          </TooltipContent>
        </Tooltip>

        <ToolbarDivider />

        <ToolbarGroup>
          <ToolbarIconButton
            label="Tên trường trên khối"
            disabled={!canvasReady}
            pressed={showFieldBadges}
            onClick={() => onShowFieldBadgesChange(!showFieldBadges)}
          >
            <Link2 className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Đường căn chỉnh"
            disabled={!canvasReady}
            pressed={showSafeFrame}
            onClick={() => onShowSafeFrameChange(!showSafeFrame)}
          >
            <Eye className="size-4" />
          </ToolbarIconButton>
        </ToolbarGroup>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto size-8 shrink-0 sm:hidden"
              disabled={!canvasReady}
              aria-label="Thêm thao tác canvas"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canUndo} onClick={onUndo}>
              Hoàn tác
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canRedo} onClick={onRedo}>
              Làm lại
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canvasReady} onClick={onEditLayout}>
              Chỉnh bố cục
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canvasReady}
              onClick={() => onShowFieldBadgesChange(!showFieldBadges)}
            >
              {showFieldBadges ? "Tắt" : "Bật"} tên trường
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canvasReady}
              onClick={() => onShowSafeFrameChange(!showSafeFrame)}
            >
              {showSafeFrame ? "Tắt" : "Bật"} đường căn chỉnh
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}
