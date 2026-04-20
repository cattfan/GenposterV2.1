import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import type { PackTemplate } from "@/models";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PackBuilder } from "@/features/packs/PackBuilder";

export const Route = createFileRoute("/packs")({
  component: PacksPage,
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
});

function PacksPage() {
  const search = Route.useSearch();
  const packs = useLiveQuery(() => db.packTemplates.toArray(), []);
  const tpls = useLiveQuery(() => db.pageTemplates.toArray(), []);
  const [editing, setEditing] = useState<PackTemplate | null>(null);

  // Auto-mở pack từ ?open=
  useEffect(() => {
    if (!search.open || !packs) return;
    const found = packs.find((p) => p.packTemplateId === search.open);
    if (found && (!editing || editing.packTemplateId !== found.packTemplateId)) {
      setEditing({ ...found });
    }
  }, [search.open, packs, editing]);

  const createNew = () => {
    setEditing({
      packTemplateId: nanoid(),
      name: "Pack mới",
      orderedPages: [],
      requiredPages: [],
      optionalPages: [],
      captionProfile: { mode: "save_post" },
      exportDefaults: { format: "png", scale: 2 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  const onSave = async () => {
    if (!editing) return;
    await db.packTemplates.put({ ...editing, updatedAt: Date.now() });
    toast.success("Đã lưu pack");
  };

  const onDuplicate = async () => {
    if (!editing) return;
    const dup: PackTemplate = {
      ...editing,
      packTemplateId: nanoid(),
      name: editing.name + " (copy)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.packTemplates.put(dup);
    setEditing(dup);
    toast.success("Đã duplicate pack");
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Pack Templates</h1>
          <p className="text-muted-foreground mt-1">Ghép nhiều page template thành 1 combo.</p>
        </div>
        <Button onClick={createNew}>
          <Plus className="size-4 mr-2" /> Tạo pack mới
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div>
          <h2 className="font-semibold mb-3">Danh sách</h2>
          <div className="space-y-2">
            {packs?.length === 0 && (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Chưa có pack. Tạo mới hoặc dùng "AI dựng combo" ở /templates.
                </CardContent>
              </Card>
            )}
            {packs?.map((p) => (
              <Card
                key={p.packTemplateId}
                className={`cursor-pointer hover:border-primary ${
                  editing?.packTemplateId === p.packTemplateId ? "border-primary" : ""
                }`}
                onClick={() => setEditing({ ...p })}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.orderedPages.length} page</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Xóa pack "${p.name}"?`)) {
                        await db.packTemplates.delete(p.packTemplateId);
                        if (editing?.packTemplateId === p.packTemplateId) setEditing(null);
                        toast.success("Đã xóa");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          {!editing && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Chọn 1 pack để sửa hoặc tạo mới.
              </CardContent>
            </Card>
          )}
          {editing && (
            <PackBuilder
              pack={editing}
              allTemplates={tpls ?? []}
              onChange={setEditing}
              onSave={onSave}
              onDuplicate={onDuplicate}
            />
          )}
        </div>
      </div>
    </div>
  );
}
