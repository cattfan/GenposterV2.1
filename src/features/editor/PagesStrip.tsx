// Horizontal pages strip shown under the canvas, Canva-style.
//
// Generic + presentational: the parent (DesignWorkspace) builds the items for
// either pack-page mode or single-document multi-page mode and passes simple
// callbacks. Supports click-to-open, add, duplicate, delete and drag reorder.

import { useState, type ReactNode } from "react";
import { Plus, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PagesStripItem {
  id: string;
  label: string;
  thumbnail: ReactNode;
  active: boolean;
}

interface PagesStripProps {
  items: PagesStripItem[];
  onSelect: (id: string) => void;
  onAdd?: () => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Reorder via drag-drop; receives the dragged id and the target index. */
  onReorder?: (fromId: string, toIndex: number) => void;
  /** When false, the delete button is hidden (e.g. last remaining page). */
  canDelete?: boolean;
}

export function PagesStrip({
  items,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
  canDelete = true,
}: PagesStripProps) {
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 items-stretch gap-2 border-t bg-card/60 px-4 py-2.5">
      <div className="flex flex-1 items-stretch gap-2 overflow-x-auto pack-horizontal-scroll">
        {items.map((item, index) => (
          <div
            key={item.id}
            draggable={!!onReorder}
            onDragStart={(e) => {
              setDragId(item.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              if (dragId && dragId !== item.id) onReorder(dragId, index);
              setDragId(null);
            }}
            className={cn(
              "group relative flex shrink-0 flex-col items-center gap-1",
              onReorder && "cursor-grab active:cursor-grabbing",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-lg border bg-background transition",
                item.active
                  ? "border-primary ring-2 ring-primary/40"
                  : "hover:border-primary/60",
              )}
              title={item.label}
            >
              {item.thumbnail}
            </button>
            <span className="text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>

            {(onDuplicate || (onDelete && canDelete)) && (
              <div className="absolute -top-1 right-0 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(item.id);
                    }}
                    className="grid size-5 place-items-center rounded border bg-background text-muted-foreground shadow-sm hover:text-foreground"
                    title="Nhân bản trang"
                    aria-label="Nhân bản trang"
                  >
                    <Copy className="size-3" />
                  </button>
                )}
                {onDelete && canDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item.id);
                    }}
                    className="grid size-5 place-items-center rounded border bg-background text-muted-foreground shadow-sm hover:text-destructive"
                    title="Xoá trang"
                    aria-label="Xoá trang"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex shrink-0 flex-col items-center justify-center gap-1 self-start rounded-lg border border-dashed bg-background px-3 py-2 text-muted-foreground transition hover:border-primary hover:text-primary"
          title="Thêm trang"
          aria-label="Thêm trang"
        >
          <Plus className="size-5" />
          <span className="text-[10px]">Thêm</span>
        </button>
      )}
    </div>
  );
}
