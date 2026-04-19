import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/storage/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import type { PackTemplate } from "@/models";
import { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from "lucide-react";

export const Route = createFileRoute("/packs")({
  component: PacksPage,
});

function PacksPage() {
  const packs = useLiveQuery(() => db.packTemplates.toArray(), []);
  const tpls = useLiveQuery(() => db.pageTemplates.toArray(), []);
  const [editing, setEditing] = useState<PackTemplate | null>(null);

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

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Pack Templates</h1>
          <p className="text-muted-foreground mt-1">Ghép nhiều page template thành 1 pack.</p>
        </div>
        <Button onClick={createNew}>
          <Plus className="size-4 mr-2" /> Tạo pack mới
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-3">Danh sách</h2>
          <div className="space-y-2">
            {packs?.map((p) => (
              <Card key={p.packTemplateId} className="cursor-pointer hover:border-primary" onClick={() => setEditing({ ...p })}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.orderedPages.length} page</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Xóa pack "${p.name}"?`)) {
                        await db.packTemplates.delete(p.packTemplateId);
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
          <h2 className="font-semibold mb-3">Builder</h2>
          {!editing && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Chọn 1 pack để sửa hoặc tạo mới.</CardContent>
            </Card>
          )}
          {editing && (
            <Card>
              <CardHeader>
                <CardTitle>{editing.packTemplateId === editing.packTemplateId ? "Sửa pack" : "Pack mới"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Tên pack</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label>Goal</Label>
                  <Input value={editing.goal ?? ""} onChange={(e) => setEditing({ ...editing, goal: e.target.value })} />
                </div>
                <div>
                  <Label>CTA</Label>
                  <Input value={editing.cta ?? ""} onChange={(e) => setEditing({ ...editing, cta: e.target.value })} />
                </div>

                <div>
                  <Label>Pages trong pack (đã sắp xếp)</Label>
                  <div className="space-y-1 mt-2 border rounded p-2">
                    {editing.orderedPages.length === 0 && (
                      <div className="text-xs text-muted-foreground p-2">Chưa có page nào</div>
                    )}
                    {editing.orderedPages.map((pid, idx) => {
                      const t = tpls?.find((x) => x.pageTemplateId === pid);
                      return (
                        <div key={pid + idx} className="flex items-center gap-2 p-2 bg-muted/40 rounded text-sm">
                          <span className="w-6 text-center font-bold">{idx + 1}</span>
                          <span className="flex-1 truncate">{t?.name ?? "(template không tồn tại)"}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={idx === 0}
                            onClick={() => {
                              const arr = [...editing.orderedPages];
                              [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                              setEditing({ ...editing, orderedPages: arr });
                            }}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={idx === editing.orderedPages.length - 1}
                            onClick={() => {
                              const arr = [...editing.orderedPages];
                              [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                              setEditing({ ...editing, orderedPages: arr });
                            }}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing({ ...editing, orderedPages: editing.orderedPages.filter((_, i) => i !== idx) })}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label>Thêm page vào pack</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tpls?.map((t) => (
                      <Button
                        key={t.pageTemplateId}
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditing({ ...editing, orderedPages: [...editing.orderedPages, t.pageTemplateId] })
                        }
                      >
                        + {t.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={async () => {
                    await db.packTemplates.put({ ...editing, updatedAt: Date.now() });
                    toast.success("Đã lưu pack");
                  }}
                  className="w-full"
                >
                  <Save className="size-4 mr-2" />
                  Lưu pack
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
