// Pack builder: drag-drop sắp xếp, picker với search/filter, strip preview ngang.
import { useMemo, useState } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Search,
  Plus,
  Copy,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import type { PackTemplate, PageTemplate, PageType } from "@/models";
import { PackPagePreview } from "./PackPagePreview";
import { Link, useNavigate } from "@tanstack/react-router";

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
}

const TYPE_FILTERS: Array<{ label: string; value: "all" | PageType }> = [
  { label: "Tất cả", value: "all" },
  { label: "Cover", value: "cover" },
  { label: "Itinerary", value: "itinerary" },
  { label: "Board", value: "board" },
  { label: "Mixed", value: "mixed" },
];

function detectRole(
  name: string,
): { label: string; tone: "default" | "secondary" | "destructive" } | null {
  if (/cover|bìa|bia/i.test(name)) return { label: "Cover", tone: "default" };
  if (/ng[àa]y\s*\d+|day\s*\d+/i.test(name)) return { label: "Day", tone: "secondary" };
  if (/outro|kết|ket|cta/i.test(name)) return { label: "Outro", tone: "destructive" };
  if (/tiện|tien|utility|utilities/i.test(name)) return { label: "Utilities", tone: "secondary" };
  return null;
}

function SortableRow({
  id,
  index,
  total,
  tpl,
  onMove,
  onRemove,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  id: string;
  index: number;
  total: number;
  tpl?: PageTemplate;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onOpen: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const role = tpl ? detectRole(tpl.name) : null;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 bg-muted/40 rounded text-sm border"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        aria-label="Kéo để sắp xếp"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-6 text-center font-bold">{index + 1}</span>
      <div
        className="relative w-12 shrink-0 rounded overflow-hidden border bg-background"
        style={{ aspectRatio: tpl ? `${tpl.canvas.width} / ${tpl.canvas.height}` : "4/5" }}
      >
        {tpl && <PackPagePreview tpl={tpl} />}
      </div>
      <button
        type="button"
        className="flex-1 truncate text-left hover:underline"
        onClick={onOpen}
        disabled={!tpl}
      >
        {tpl?.name ?? "(template không tồn tại)"}
      </button>
      {role && <Badge variant={role.tone}>{role.label}</Badge>}
      <Button variant="ghost" size="icon" onClick={onOpen} disabled={!tpl}>
        <ExternalLink className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDuplicate} disabled={!tpl || !onDuplicate}>
        <Copy className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" disabled={index === total - 1} onClick={() => onMove(1)}>
        <ArrowDown className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onRemove}>
        <Trash2 className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} disabled={!tpl || !onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
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
}: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | PageType>("all");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const tplMap = useMemo(
    () => new Map(allTemplates.map((t) => [t.pageTemplateId, t])),
    [allTemplates],
  );

  const orderedItems = useMemo(
    () => pack.orderedPages.map((id, idx) => ({ key: `${id}__${idx}`, id, idx })),
    [pack.orderedPages],
  );

  const filteredPicker = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTemplates
      .filter((t) => typeFilter === "all" || t.type === typeFilter)
      .filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [allTemplates, search, typeFilter]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = orderedItems.findIndex((it) => it.key === active.id);
    const to = orderedItems.findIndex((it) => it.key === over.id);
    if (from < 0 || to < 0) return;
    onChange({ ...pack, orderedPages: arrayMove(pack.orderedPages, from, to) });
  };

  const moveAt = (idx: number, dir: -1 | 1) => {
    const arr = [...pack.orderedPages];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    onChange({ ...pack, orderedPages: arr });
  };

  const removeAt = (idx: number) => {
    onChange({ ...pack, orderedPages: pack.orderedPages.filter((_, i) => i !== idx) });
  };

  const addPage = (id: string) => {
    if (pack.orderedPages.includes(id)) return;
    onChange({ ...pack, orderedPages: [...pack.orderedPages, id] });
  };

  const openPage = (id: string) => {
    navigate({
      to: "/templates/$id/edit",
      params: { id },
      search: { open: undefined, packId: pack.packTemplateId },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="truncate">Builder: {pack.name}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDuplicate}>
            <Copy className="size-4 mr-1" /> Duplicate
          </Button>
          {onCreateAiPage && (
            <Button variant="outline" size="sm" onClick={onCreateAiPage}>
              <Sparkles className="size-4 mr-1" /> AI thêm page
            </Button>
          )}
          {onCreatePage && (
            <Button variant="outline" size="sm" onClick={onCreatePage}>
              <Plus className="size-4 mr-1" /> Thêm page mới
            </Button>
          )}
          <Button size="sm" onClick={onSave}>
            <Save className="size-4 mr-1" /> Lưu
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Tên pack</Label>
            <Input
              value={pack.name}
              onChange={(e) => onChange({ ...pack, name: e.target.value })}
            />
          </div>
          <div>
            <Label>CTA</Label>
            <Input
              value={pack.cta ?? ""}
              onChange={(e) => onChange({ ...pack, cta: e.target.value })}
            />
          </div>
          <div>
            <Label>Goal</Label>
            <Input
              value={pack.goal ?? ""}
              onChange={(e) => onChange({ ...pack, goal: e.target.value })}
            />
          </div>
          <div>
            <Label>Tone</Label>
            <Input
              value={pack.tone ?? ""}
              onChange={(e) => onChange({ ...pack, tone: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Mô tả</Label>
          <Textarea
            rows={2}
            value={pack.description ?? ""}
            onChange={(e) => onChange({ ...pack, description: e.target.value })}
            placeholder="Ghi chú về pack này…"
          />
        </div>

        <div>
          <Label>Pages trong pack ({pack.orderedPages.length})</Label>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={orderedItems.map((i) => i.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1 mt-2 border rounded p-2 max-h-[400px] overflow-y-auto">
                {orderedItems.length === 0 && (
                  <div className="text-xs text-muted-foreground p-2">Chưa có page nào</div>
                )}
                {orderedItems.map((it) => (
                  <SortableRow
                    key={it.key}
                    id={it.key}
                    index={it.idx}
                    total={orderedItems.length}
                    tpl={tplMap.get(it.id)}
                    onMove={(dir) => moveAt(it.idx, dir)}
                    onRemove={() => removeAt(it.idx)}
                    onOpen={() => openPage(it.id)}
                    onDuplicate={
                      tplMap.get(it.id) ? () => onDuplicatePage?.(tplMap.get(it.id)!) : undefined
                    }
                    onDelete={
                      tplMap.get(it.id)
                        ? () => onDeletePage?.(tplMap.get(it.id)!, it.idx)
                        : undefined
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div>
          <Label>Thêm page vào pack</Label>
          <div className="flex gap-2 mt-2 mb-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm template..."
                className="pl-8"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {TYPE_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={typeFilter === f.value ? "default" : "outline"}
                  onClick={() => setTypeFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="border rounded max-h-[260px] overflow-y-auto divide-y">
            {filteredPicker.length === 0 && (
              <div className="text-xs text-muted-foreground p-3">Không có template khớp</div>
            )}
            {filteredPicker.map((t) => {
              const alreadyInPack = pack.orderedPages.includes(t.pageTemplateId);
              return (
                <div
                  key={t.pageTemplateId}
                  className="flex items-center gap-2 p-2 hover:bg-muted/50 text-sm"
                >
                  <div
                    className="relative w-10 shrink-0 rounded overflow-hidden border bg-background"
                    style={{ aspectRatio: `${t.canvas.width} / ${t.canvas.height}` }}
                  >
                    <PackPagePreview tpl={t} />
                  </div>
                  <span className="flex-1 truncate">{t.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {t.type}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => addPage(t.pageTemplateId)}
                    disabled={alreadyInPack}
                  >
                    {alreadyInPack ? "Đã thêm" : <Plus className="size-4" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {pack.orderedPages.length > 0 && (
          <div>
            <Label>Preview cả pack</Label>
            <div className="mt-2 border rounded p-3 bg-muted/30 overflow-x-auto">
              <div className="flex gap-3 items-start">
                {pack.orderedPages.map((id, idx) => {
                  const t = tplMap.get(id);
                  if (!t) {
                    return (
                      <div
                        key={id + idx}
                        className="text-[10px] text-destructive p-2 border rounded"
                      >
                        #{idx + 1} (mất)
                      </div>
                    );
                  }
                  const w = 140;
                  const h = (t.canvas.height / t.canvas.width) * w;
                  return (
                    <Link
                      key={id + idx}
                      to="/templates/$id/edit"
                      params={{ id: t.pageTemplateId }}
                      search={{ open: undefined, packId: pack.packTemplateId }}
                      target="_blank"
                      className="shrink-0 group"
                    >
                      <div
                        className="relative rounded overflow-hidden border bg-background group-hover:border-primary"
                        style={{ width: w, height: h }}
                      >
                        <PackPagePreview tpl={t} />
                      </div>
                      <div className="text-[10px] mt-1 flex items-center gap-1 max-w-[140px]">
                        <span className="font-bold">#{idx + 1}</span>
                        <span className="truncate">{t.name}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-50 group-hover:opacity-100" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
