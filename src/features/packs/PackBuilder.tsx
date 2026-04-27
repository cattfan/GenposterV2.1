import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FilePlus2,
  GripVertical,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PackTemplate, PageTemplate } from "@/models";
import { PackPagePreview } from "./PackPagePreview";

interface Props {
  pack: PackTemplate;
  allTemplates: PageTemplate[];
  onChange: (next: PackTemplate) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onCreatePage?: () => void;
  onCreateAiPage?: () => void;
  onDuplicatePage?: (template: PageTemplate) => void;
  onDeletePage?: (template: PageTemplate, index: number) => void;
  onRenamePage?: (template: PageTemplate, name: string) => void | Promise<void>;
  onDeletePack?: () => void;
  onCollapse?: () => void;
}

function PageThumb({ tpl, className }: { tpl?: PageTemplate; className?: string }) {
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-md border bg-background", className)}
      style={{ aspectRatio: tpl ? `${tpl.canvas.width} / ${tpl.canvas.height}` : "4 / 5" }}
    >
      {tpl ? (
        <PackPagePreview tpl={tpl} />
      ) : (
        <div className="grid size-full place-items-center text-[10px] text-muted-foreground">
          Mất
        </div>
      )}
    </div>
  );
}

function SortablePageCard({
  id,
  index,
  tpl,
  onOpen,
  onDuplicate,
  onDelete,
  onRename,
}: {
  id: string;
  index: number;
  tpl?: PageTemplate;
  onOpen: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onRename?: (name: string) => void | Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(tpl?.name ?? "");
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  useEffect(() => {
    setDraftName(tpl?.name ?? "");
  }, [tpl?.name]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const commitRename = () => {
    const nextName = draftName.trim();
    setRenaming(false);
    if (!tpl) return;
    if (!nextName || nextName === tpl.name) {
      setDraftName(tpl.name);
      return;
    }
    void onRename?.(nextName);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex w-[220px] shrink-0 flex-col gap-3 rounded-xl border bg-background p-3 text-sm shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/20 sm:w-[240px] xl:w-[260px]"
    >
      <div className="flex items-start justify-between gap-2 rounded-lg">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab rounded-md p-1 text-muted-foreground active:cursor-grabbing group-hover:bg-muted group-hover:text-foreground"
            aria-label="Kéo để sắp xếp"
          >
            <GripVertical className="size-4" />
          </button>

          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground shadow-sm">
            {index + 1}
          </div>

          <div className="min-w-0 flex-1" onPointerDown={(event) => event.stopPropagation()}>
            {renaming ? (
              <Input
                ref={inputRef}
                value={draftName}
                className="h-8 bg-background"
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setDraftName(tpl?.name ?? "");
                    setRenaming(false);
                  }
                }}
                aria-label="Đổi tên page"
              />
            ) : (
              <button
                type="button"
                className="max-w-full truncate text-left font-medium leading-5"
                onDoubleClick={() => {
                  if (tpl) setRenaming(true);
                }}
                disabled={!tpl}
                title="Double-click để đổi tên"
              >
                {tpl?.name ?? "Template không tồn tại"}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center" onPointerDown={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={!tpl || !onDelete}
            title="Xóa page"
            aria-label="Xóa page"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div
        {...listeners}
        className="relative cursor-grab rounded-lg active:cursor-grabbing"
        aria-label="Kéo để sắp xếp"
      >
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Button
            variant="secondary"
            size="icon"
            className="size-8 shadow-sm"
            onClick={onOpen}
            disabled={!tpl}
            title="Mở editor"
            aria-label="Mở editor"
          >
            <ExternalLink />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="size-8 shadow-sm"
            onClick={onDuplicate}
            disabled={!tpl || !onDuplicate}
            title="Nhân bản page"
            aria-label="Nhân bản page"
          >
            <Copy />
          </Button>
        </div>
        <PageThumb tpl={tpl} className="w-full shadow-sm" />
      </div>
    </div>
  );
}

export function PackBuilder({
  pack,
  allTemplates,
  onChange,
  onSave,
  onDuplicate,
  onCreatePage,
  onCreateAiPage,
  onDuplicatePage,
  onDeletePage,
  onRenamePage,
  onDeletePack,
  onCollapse,
}: Props) {
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const tplMap = useMemo(
    () => new Map(allTemplates.map((template) => [template.pageTemplateId, template])),
    [allTemplates],
  );
  const orderedItems = useMemo(
    () => pack.orderedPages.map((id, idx) => ({ key: `${id}__${idx}`, id, idx })),
    [pack.orderedPages],
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = orderedItems.findIndex((item) => item.key === active.id);
    const to = orderedItems.findIndex((item) => item.key === over.id);
    if (from < 0 || to < 0) return;
    onChange({ ...pack, orderedPages: arrayMove(pack.orderedPages, from, to) });
  };

  const openPage = (id: string) => {
    navigate({
      to: "/templates/$id/edit",
      params: { id },
      search: { open: undefined, packId: pack.packTemplateId },
    });
  };

  return (
    <Card className="overflow-hidden border-primary/50 shadow-sm">
      <CardContent className="p-0">
        <div className="border-b bg-muted/20 p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Button
                variant="secondary"
                size="icon"
                className="size-10 shrink-0 shadow-sm"
                onClick={onCollapse}
                title="Thu nhỏ pack"
                aria-label="Thu nhỏ pack"
              >
                <ArrowLeft />
              </Button>
              <div className="min-w-0 flex-1">
                <Input
                  className="h-10 max-w-xl bg-background text-base font-semibold"
                  value={pack.name}
                  onChange={(event) => onChange({ ...pack, name: event.target.value })}
                  aria-label="Tên pack"
                />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onDuplicate}>
                <Copy data-icon="inline-start" />
                Duplicate
              </Button>
              {onCreateAiPage ? (
                <Button variant="outline" size="sm" onClick={onCreateAiPage}>
                  <Sparkles data-icon="inline-start" />
                  AI từ ảnh
                </Button>
              ) : null}
              {onCreatePage ? (
                <Button variant="outline" size="sm" onClick={onCreatePage}>
                  <FilePlus2 data-icon="inline-start" />
                  Page mới
                </Button>
              ) : null}
              <Button size="sm" onClick={onSave}>
                <Save data-icon="inline-start" />
                Lưu thay đổi
              </Button>
              {onDeletePack ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDeletePack}
                  title="Xóa pack"
                  aria-label="Xóa pack"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4 md:p-5">
          <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={orderedItems.map((item) => item.key)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="-mx-1 overflow-x-auto px-1 pb-1">
                  {orderedItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
                      Pack chưa có page. Bấm Page mới để bắt đầu.
                    </div>
                  ) : null}
                  <div className="flex min-w-full gap-3">
                    {orderedItems.map((item) => (
                      <SortablePageCard
                        key={item.key}
                        id={item.key}
                        index={item.idx}
                        tpl={tplMap.get(item.id)}
                        onOpen={() => openPage(item.id)}
                        onDuplicate={
                          tplMap.get(item.id)
                            ? () => onDuplicatePage?.(tplMap.get(item.id)!)
                            : undefined
                        }
                        onDelete={
                          tplMap.get(item.id)
                            ? () => onDeletePage?.(tplMap.get(item.id)!, item.idx)
                            : undefined
                        }
                        onRename={
                          tplMap.get(item.id)
                            ? (name) => onRenamePage?.(tplMap.get(item.id)!, name)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              </SortableContext>
            </DndContext>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
