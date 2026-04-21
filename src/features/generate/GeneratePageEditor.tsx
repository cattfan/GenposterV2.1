import { useEffect, useMemo, useState } from "react";
import {
  Crop,
  Image as ImageIcon,
  Move,
  Palette,
  RotateCw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import type { Asset, Entity, PageTemplate, RenderedItem, Slot } from "@/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageRenderer } from "@/features/render/PageRenderer";
import { CropOverlay } from "@/features/editor/CropOverlay";
import { LayoutGuides } from "@/features/render/LayoutGuides";
import { FontPicker } from "@/features/editor/FontPicker";
import { buildExpandedSlotImagePlan } from "@/engines/binding/imagePlan";
import { useResolvedImageSrc } from "@/storage/imageSrc";
import { saveBlob } from "@/storage/db";
import { clonePageTemplate } from "./templateState";

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function GeneratePageEditor({
  open,
  onOpenChange,
  title,
  template,
  baseTemplate,
  entities,
  assets,
  entity,
  entityPool,
  slotItems,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  template: PageTemplate;
  baseTemplate: PageTemplate;
  entities: Entity[];
  assets: Asset[];
  entity?: Entity;
  entityPool?: Entity[];
  slotItems?: RenderedItem[];
  onApply: (nextTemplate: PageTemplate | null) => void;
}) {
  const [draft, setDraft] = useState<PageTemplate>(() => clonePageTemplate(template));
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [primarySlotId, setPrimarySlotId] = useState<string | null>(null);
  const [cropSlotId, setCropSlotId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(clonePageTemplate(template));
    setSelectedSlotIds([]);
    setPrimarySlotId(null);
    setCropSlotId(null);
  }, [open, template]);

  const canvasScale = useMemo(
    () => Math.min(780 / draft.canvas.width, 860 / draft.canvas.height, 1),
    [draft.canvas.height, draft.canvas.width],
  );

  const entityLookup = useMemo(() => {
    const ordered = [entity, ...(entityPool ?? [])].filter((item): item is Entity => !!item);
    return new Map(ordered.map((item) => [item.entityId, item]));
  }, [entity, entityPool]);

  const slotEntityOverride = useMemo(() => {
    const map = new Map<string, { entityId?: string; assetId?: string }>();
    for (const item of slotItems ?? []) {
      if (item.slotId) {
        map.set(item.slotId, { entityId: item.entityId, assetId: item.assetId });
      }
    }
    return map;
  }, [slotItems]);

  const resolveEntityForSlot = (slot: Slot) => {
    const override = slotEntityOverride.get(slot.slotId);
    if (override?.entityId) return entityLookup.get(override.entityId);
    if (slot.sectionRefId) {
      const sectionEntity = (slotItems ?? []).find((item) => item.sectionId === slot.sectionRefId)?.entityId;
      if (sectionEntity) return entityLookup.get(sectionEntity);
    }
    if (slotItems && slotItems.length > 0) return undefined;
    return entity;
  };

  const imagePlan = useMemo(
    () => buildExpandedSlotImagePlan(draft.slots, assets, resolveEntityForSlot),
    [draft.slots, assets, entityLookup, slotEntityOverride, slotItems, entity],
  );

  const selectedSlots = useMemo(
    () =>
      selectedSlotIds
        .map((slotId) => draft.slots.find((slot) => slot.slotId === slotId))
        .filter((slot): slot is Slot => !!slot),
    [draft.slots, selectedSlotIds],
  );

  const primarySlot =
    (primarySlotId ? draft.slots.find((slot) => slot.slotId === primarySlotId) : undefined) ??
    selectedSlots[selectedSlots.length - 1];

  const cropSlot = cropSlotId ? draft.slots.find((slot) => slot.slotId === cropSlotId) : undefined;
  const cropSource = cropSlot
    ? imagePlan.get(cropSlot.slotId)?.src ?? cropSlot.staticImage ?? ""
    : "";

  const updateDraft = (updater: (next: PageTemplate) => void) => {
    setDraft((prev) => {
      const next = clonePageTemplate(prev);
      updater(next);
      return next;
    });
  };

  const patchSlots = (patches: Array<{ slotId: string; patch: Partial<Slot> }>) => {
    if (patches.length === 0) return;
    updateDraft((next) => {
      next.slots = next.slots.map((slot) => {
        const found = patches.find((entry) => entry.slotId === slot.slotId);
        return found ? { ...slot, ...found.patch } : slot;
      });
    });
  };

  const patchPrimarySlot = (patch: Partial<Slot>) => {
    if (!primarySlot) return;
    patchSlots([{ slotId: primarySlot.slotId, patch }]);
  };

  const selectSlot = (slotId: string | null, additive = false) => {
    if (!slotId) {
      setSelectedSlotIds([]);
      setPrimarySlotId(null);
      return;
    }
    setSelectedSlotIds((prev) => {
      if (!additive) return [slotId];
      return prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId];
    });
    setPrimarySlotId(slotId);
  };

  const addSlot = (kind: "text" | "image" | "shape") => {
    const slotId = crypto.randomUUID();
    const newSlot: Slot =
      kind === "text"
        ? {
            slotId,
            kind,
            x: Math.round(draft.canvas.width * 0.16),
            y: Math.round(draft.canvas.height * 0.18),
            width: Math.round(draft.canvas.width * 0.32),
            height: 120,
            zIndex: Math.max(1, ...draft.slots.map((slot) => slot.zIndex ?? 0)) + 1,
            staticText: "Text mới",
            style: {
              fontFamily: "Be Vietnam Pro",
              fontSize: 44,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.2,
            },
          }
        : kind === "image"
          ? {
              slotId,
              kind,
              x: Math.round(draft.canvas.width * 0.14),
              y: Math.round(draft.canvas.height * 0.24),
              width: Math.round(draft.canvas.width * 0.28),
              height: Math.round(draft.canvas.height * 0.22),
              zIndex: Math.max(1, ...draft.slots.map((slot) => slot.zIndex ?? 0)) + 1,
              style: { fit: "cover", borderRadius: 24 },
            }
          : {
              slotId,
              kind,
              shapeKind: "rectangle",
              x: Math.round(draft.canvas.width * 0.18),
              y: Math.round(draft.canvas.height * 0.22),
              width: Math.round(draft.canvas.width * 0.3),
              height: 96,
              zIndex: Math.max(1, ...draft.slots.map((slot) => slot.zIndex ?? 0)) + 1,
              staticText: "",
              style: { fill: "rgba(0,0,0,0.45)", borderRadius: 20 },
            };

    updateDraft((next) => {
      next.slots.push(newSlot);
    });
    setSelectedSlotIds([slotId]);
    setPrimarySlotId(slotId);
  };

  const deleteSelected = () => {
    if (selectedSlotIds.length === 0) return;
    updateDraft((next) => {
      next.slots = next.slots.filter((slot) => !selectedSlotIds.includes(slot.slotId));
    });
    setSelectedSlotIds([]);
    setPrimarySlotId(null);
  };

  const resetPrimarySlot = () => {
    if (!primarySlot) return;
    const baseSlot = baseTemplate.slots.find((slot) => slot.slotId === primarySlot.slotId);
    if (!baseSlot) {
      updateDraft((next) => {
        next.slots = next.slots.filter((slot) => slot.slotId !== primarySlot.slotId);
      });
      setSelectedSlotIds((prev) => prev.filter((slotId) => slotId !== primarySlot.slotId));
      setPrimarySlotId(null);
      return;
    }
    updateDraft((next) => {
      next.slots = next.slots.map((slot) =>
        slot.slotId === primarySlot.slotId
          ? (JSON.parse(JSON.stringify(baseSlot)) as Slot)
          : slot,
      );
    });
  };

  const resetPage = () => {
    setDraft(clonePageTemplate(baseTemplate));
    setSelectedSlotIds([]);
    setPrimarySlotId(null);
    setCropSlotId(null);
  };

  const saveLocalFile = async (file: File): Promise<string> => {
    const blobKey = await saveBlob(file);
    return `idb://${blobKey}`;
  };

  const promptImageUpload = (onPick: (src: string) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const src = await saveLocalFile(file);
      onPick(src);
    };
    input.click();
  };

  const clearBindingForPrimary = () => {
    if (!primarySlot) return;
    patchPrimarySlot({ bindingPath: undefined });
  };

  const setPrimaryText = (value: string) => {
    if (!primarySlot) return;
    patchPrimarySlot({ bindingPath: undefined, staticText: value });
  };

  const setPrimaryImage = (src: string) => {
    if (!primarySlot) return;
    patchPrimarySlot({ bindingPath: undefined, staticImage: src });
  };

  const pickRandomGlobalImage = () => {
    if (assets.length === 0) {
      toast.error("Chưa có ảnh nào trong thư viện.");
      return;
    }
    const asset = assets[Math.floor(Math.random() * assets.length)];
    return asset.sourceValue;
  };

  const startCropPrimary = () => {
    if (!primarySlot || (primarySlot.kind !== "image" && primarySlot.kind !== "shape")) return;
    const resolvedSrc = imagePlan.get(primarySlot.slotId)?.src ?? primarySlot.staticImage;
    if (!resolvedSrc) {
      toast.error("Block này chưa có ảnh để crop.");
      return;
    }
    if (!primarySlot.staticImage || primarySlot.bindingPath) {
      patchPrimarySlot({
        bindingPath: undefined,
        staticImage: resolvedSrc,
      });
    }
    setCropSlotId(primarySlot.slotId);
  };

  const setBackgroundRandom = () => {
    const src = pickRandomGlobalImage();
    if (!src) return;
    updateDraft((next) => {
      next.canvas.backgroundImage = src;
    });
  };

  const selectionLabel =
    selectedSlotIds.length === 0
      ? "Chưa chọn block"
      : `${selectedSlotIds.length} block${primarySlot ? ` · ${primarySlot.kind}` : ""}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[96vw] max-w-none sm:max-w-none p-0">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b px-6 py-4">
            <div className="flex items-start justify-between gap-4 pr-10">
              <div>
                <SheetTitle>{title}</SheetTitle>
                <SheetDescription>
                  Chỉnh page output cục bộ trong /generate. Mẫu gốc ở Page Templates sẽ không bị đổi.
                </SheetDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={resetPage}>
                  <Undo2 className="mr-2 size-4" /> Reset page edits
                </Button>
                <Button
                  onClick={() => {
                    onApply(clonePageTemplate(draft));
                    onOpenChange(false);
                  }}
                >
                  <Save className="mr-2 size-4" /> Lưu vào page output
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">
            <div className="min-h-0 overflow-y-auto border-r px-4 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Thêm block</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <Button variant="outline" className="justify-start" onClick={() => addSlot("text")}>
                      <Type className="mr-2 size-4" /> Text
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => addSlot("image")}>
                      <ImageIcon className="mr-2 size-4" /> Image
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={() => addSlot("shape")}>
                      <Square className="mr-2 size-4" /> Shape
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Palette className="size-4 text-muted-foreground" />
                    <Label className="text-xs uppercase text-muted-foreground">Ảnh nền / canvas</Label>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Màu nền</Label>
                    <Input
                      type="color"
                      value={draft.canvas.background ?? "#ffffff"}
                      onChange={(event) =>
                        updateDraft((next) => {
                          next.canvas.background = event.target.value;
                        })
                      }
                      className="h-10 p-1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Ảnh nền</Label>
                    <Input
                      value={draft.canvas.backgroundImage ?? ""}
                      onChange={(event) =>
                        updateDraft((next) => {
                          next.canvas.backgroundImage = event.target.value || undefined;
                        })
                      }
                      placeholder="https://... hoặc idb://..."
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() =>
                        promptImageUpload((src) =>
                          updateDraft((next) => {
                            next.canvas.backgroundImage = src;
                          }),
                        )
                      }
                    >
                      <Upload className="mr-2 size-4" /> Tải ảnh nền
                    </Button>
                    <Button variant="outline" className="justify-start" onClick={setBackgroundRandom}>
                      <Wand2 className="mr-2 size-4" /> Ảnh ngẫu nhiên toàn bộ
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() =>
                        updateDraft((next) => {
                          next.canvas.background = baseTemplate.canvas.background;
                          next.canvas.backgroundImage = baseTemplate.canvas.backgroundImage;
                        })
                      }
                    >
                      <Undo2 className="mr-2 size-4" /> Reset nền gốc
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-auto bg-muted/20 px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="text-sm font-medium">{selectionLabel}</div>
                <div className="text-xs text-muted-foreground">
                  Click để chọn · Shift/Ctrl/Cmd + click để chọn nhiều · Kéo để di chuyển
                </div>
              </div>
              <div className="grid place-items-center">
                <div className="relative">
                  <GenerateEditorCanvas
                    template={draft}
                    scale={canvasScale}
                    selectedSlotIds={selectedSlotIds}
                    primarySlotId={primarySlot?.slotId ?? null}
                    onSelectSlot={selectSlot}
                    onPatchSlots={patchSlots}
                    onStartCrop={setCropSlotId}
                    renderContent={
                      <PageRenderer
                        template={draft}
                        entities={entities}
                        assets={assets}
                        entity={entity}
                        entityPool={entityPool}
                        slotItems={slotItems}
                        scale={canvasScale}
                      />
                    }
                  />
                  {cropSlot && (
                    <CropLayer
                      slot={cropSlot}
                      scale={canvasScale}
                      src={cropSource}
                      onCommit={(crop) => {
                        patchSlots([{ slotId: cropSlot.slotId, patch: { crop } }]);
                        setCropSlotId(null);
                      }}
                      onCancel={() => setCropSlotId(null)}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto border-l px-4 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs uppercase text-muted-foreground">Selection</Label>
                    {selectedSlotIds.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => selectSlot(null)}>
                        Bỏ chọn
                      </Button>
                    )}
                  </div>
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    {selectionLabel}
                  </div>
                </div>

                {selectedSlotIds.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 border-t pt-4">
                    <Button variant="destructive" className="justify-start" onClick={deleteSelected}>
                      <Trash2 className="mr-2 size-4" /> Xoá block đã chọn
                    </Button>
                    {primarySlot && (
                      <Button variant="outline" className="justify-start" onClick={resetPrimarySlot}>
                        <Undo2 className="mr-2 size-4" /> Reset block gốc
                      </Button>
                    )}
                  </div>
                )}

                {primarySlot && (
                  <>
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center gap-2">
                        <Move className="size-4 text-muted-foreground" />
                        <Label className="text-xs uppercase text-muted-foreground">Vị trí & layer</Label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <FieldNumber label="X" value={primarySlot.x} onChange={(value) => patchPrimarySlot({ x: value })} />
                        <FieldNumber label="Y" value={primarySlot.y} onChange={(value) => patchPrimarySlot({ y: value })} />
                        <FieldNumber
                          label="Width"
                          value={primarySlot.width}
                          onChange={(value) => patchPrimarySlot({ width: Math.max(20, value) })}
                        />
                        <FieldNumber
                          label="Height"
                          value={primarySlot.height}
                          onChange={(value) => patchPrimarySlot({ height: Math.max(20, value) })}
                        />
                        <FieldNumber
                          label="Rotation"
                          value={primarySlot.rotation ?? 0}
                          onChange={(value) => patchPrimarySlot({ rotation: value })}
                        />
                        <FieldNumber
                          label="Z-index"
                          value={primarySlot.zIndex ?? 0}
                          onChange={(value) => patchPrimarySlot({ zIndex: value })}
                        />
                      </div>
                    </div>

                    {(primarySlot.kind === "text" ||
                      (primarySlot.kind === "shape" && typeof primarySlot.staticText === "string")) && (
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center gap-2">
                          <Type className="size-4 text-muted-foreground" />
                          <Label className="text-xs uppercase text-muted-foreground">Text</Label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Nội dung</Label>
                          <textarea
                            value={primarySlot.staticText ?? ""}
                            onChange={(event) => setPrimaryText(event.target.value)}
                            className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <FontPicker
                          value={primarySlot.style?.fontFamily}
                          onChange={(family) =>
                            patchPrimarySlot({
                              bindingPath: undefined,
                              style: { ...(primarySlot.style ?? {}), fontFamily: family },
                            })
                          }
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <FieldNumber
                            label="Font size"
                            value={primarySlot.style?.fontSize ?? 32}
                            onChange={(value) =>
                              patchPrimarySlot({
                                bindingPath: undefined,
                                style: { ...(primarySlot.style ?? {}), fontSize: value },
                              })
                            }
                          />
                          <FieldNumber
                            label="Font weight"
                            value={Number(primarySlot.style?.fontWeight ?? 600)}
                            onChange={(value) =>
                              patchPrimarySlot({
                                bindingPath: undefined,
                                style: { ...(primarySlot.style ?? {}), fontWeight: value },
                              })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label className="text-xs">Màu chữ</Label>
                            <Input
                              type="color"
                              value={primarySlot.style?.color ?? "#ffffff"}
                              onChange={(event) =>
                                patchPrimarySlot({
                                  bindingPath: undefined,
                                  style: { ...(primarySlot.style ?? {}), color: event.target.value },
                                })
                              }
                              className="h-10 p-1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Align</Label>
                            <Select
                              value={primarySlot.style?.textAlign ?? "left"}
                              onValueChange={(value) =>
                                patchPrimarySlot({
                                  bindingPath: undefined,
                                  style: { ...(primarySlot.style ?? {}), textAlign: value as "left" | "center" | "right" },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="left">left</SelectItem>
                                <SelectItem value="center">center</SelectItem>
                                <SelectItem value="right">right</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {primarySlot.bindingPath && (
                          <Button variant="outline" className="justify-start" onClick={clearBindingForPrimary}>
                            <Undo2 className="mr-2 size-4" /> Tách khỏi binding để sửa tay
                          </Button>
                        )}
                      </div>
                    )}

                    {(primarySlot.kind === "image" || primarySlot.kind === "shape") && (
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="size-4 text-muted-foreground" />
                          <Label className="text-xs uppercase text-muted-foreground">Ảnh</Label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Nguồn ảnh tĩnh</Label>
                          <Input
                            value={primarySlot.staticImage ?? ""}
                            onChange={(event) => setPrimaryImage(event.target.value)}
                            placeholder="https://... hoặc idb://..."
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <Button
                            variant="outline"
                            className="justify-start"
                            onClick={() => promptImageUpload((src) => setPrimaryImage(src))}
                          >
                            <Upload className="mr-2 size-4" /> Tải ảnh cho block
                          </Button>
                          <Button
                            variant="outline"
                            className="justify-start"
                            onClick={() => {
                              const src = pickRandomGlobalImage();
                              if (!src) return;
                              setPrimaryImage(src);
                            }}
                          >
                            <Wand2 className="mr-2 size-4" /> Ảnh ngẫu nhiên toàn bộ
                          </Button>
                          <Button variant="outline" className="justify-start" onClick={startCropPrimary}>
                            <Crop className="mr-2 size-4" /> Crop ảnh block
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label className="text-xs">Fit</Label>
                            <Select
                              value={primarySlot.style?.fit ?? "cover"}
                              onValueChange={(value) =>
                                patchPrimarySlot({
                                  bindingPath: undefined,
                                  style: { ...(primarySlot.style ?? {}), fit: value as "cover" | "contain" | "stretch" },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cover">cover</SelectItem>
                                <SelectItem value="contain">contain</SelectItem>
                                <SelectItem value="stretch">stretch</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <FieldNumber
                            label="Border radius"
                            value={primarySlot.style?.borderRadius ?? 0}
                            onChange={(value) =>
                              patchPrimarySlot({
                                bindingPath: undefined,
                                style: { ...(primarySlot.style ?? {}), borderRadius: value },
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Overlay</Label>
                          <Input
                            value={primarySlot.style?.overlayColor ?? ""}
                            onChange={(event) =>
                              patchPrimarySlot({
                                bindingPath: undefined,
                                style: { ...(primarySlot.style ?? {}), overlayColor: event.target.value },
                              })
                            }
                            placeholder="rgba(0,0,0,0.35)"
                          />
                        </div>
                      </div>
                    )}

                    {primarySlot.kind === "shape" && (
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center gap-2">
                          <RotateCw className="size-4 text-muted-foreground" />
                          <Label className="text-xs uppercase text-muted-foreground">Shape</Label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Shape kind</Label>
                          <Select
                            value={primarySlot.shapeKind ?? "rectangle"}
                            onValueChange={(value) =>
                              patchPrimarySlot({ shapeKind: value as Slot["shapeKind"] })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rectangle">rectangle</SelectItem>
                              <SelectItem value="circle">circle</SelectItem>
                              <SelectItem value="triangle">triangle</SelectItem>
                              <SelectItem value="line">line</SelectItem>
                              <SelectItem value="badge">badge</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Fill</Label>
                          <Input
                            type="color"
                            value={primarySlot.style?.fill ?? "#111827"}
                            onChange={(event) =>
                              patchPrimarySlot({
                                style: { ...(primarySlot.style ?? {}), fill: event.target.value },
                              })
                            }
                            className="h-10 p-1"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GenerateEditorCanvas({
  template,
  scale,
  selectedSlotIds,
  primarySlotId,
  onSelectSlot,
  onPatchSlots,
  onStartCrop,
  renderContent,
}: {
  template: PageTemplate;
  scale: number;
  selectedSlotIds: string[];
  primarySlotId: string | null;
  onSelectSlot: (slotId: string | null, additive?: boolean) => void;
  onPatchSlots: (patches: Array<{ slotId: string; patch: Partial<Slot> }>) => void;
  onStartCrop: (slotId: string) => void;
  renderContent: React.ReactNode;
}) {
  const selectedSlots = useMemo(
    () => template.slots.filter((slot) => selectedSlotIds.includes(slot.slotId)),
    [template.slots, selectedSlotIds],
  );

  const groupBounds = useMemo(() => {
    if (selectedSlots.length < 2) return null;
    const minX = Math.min(...selectedSlots.map((slot) => slot.x));
    const minY = Math.min(...selectedSlots.map((slot) => slot.y));
    const maxX = Math.max(...selectedSlots.map((slot) => slot.x + slot.width));
    const maxY = Math.max(...selectedSlots.map((slot) => slot.y + slot.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [selectedSlots]);

  const primarySlot = primarySlotId
    ? template.slots.find((slot) => slot.slotId === primarySlotId) ?? null
    : null;

  const beginMove = (event: React.MouseEvent, slot: Slot) => {
    event.stopPropagation();
    event.preventDefault();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (additive) {
      onSelectSlot(slot.slotId, true);
      return;
    }

    const selectionIds = selectedSlotIds.includes(slot.slotId) ? selectedSlotIds : [slot.slotId];
    onSelectSlot(slot.slotId, false);

    const origin = selectionIds
      .map((slotId) => template.slots.find((entry) => entry.slotId === slotId))
      .filter((entry): entry is Slot => !!entry)
      .map((entry) => ({
        slotId: entry.slotId,
        x: entry.x,
        y: entry.y,
        locked: !!entry.locked,
      }));

    const startX = event.clientX;
    const startY = event.clientY;
    const onMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / scale;
      const dy = (moveEvent.clientY - startY) / scale;
      onPatchSlots(
        origin
          .filter((entry) => !entry.locked)
          .map((entry) => ({
            slotId: entry.slotId,
            patch: {
              x: Math.round(entry.x + dx),
              y: Math.round(entry.y + dy),
            },
          })),
      );
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beginResize = (event: React.MouseEvent, slot: Slot, handle: ResizeHandle) => {
    event.stopPropagation();
    event.preventDefault();
    onSelectSlot(slot.slotId, false);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
    const onMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / scale;
      const dy = (moveEvent.clientY - startY) / scale;
      let { x, y, width, height } = origin;
      if (handle.includes("e")) width = Math.max(20, origin.width + dx);
      if (handle.includes("s")) height = Math.max(20, origin.height + dy);
      if (handle.includes("w")) {
        width = Math.max(20, origin.width - dx);
        x = origin.x + (origin.width - width);
      }
      if (handle.includes("n")) {
        height = Math.max(20, origin.height - dy);
        y = origin.y + (origin.height - height);
      }
      onPatchSlots([
        {
          slotId: slot.slotId,
          patch: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
          },
        },
      ]);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-background shadow-2xl"
      style={{
        width: template.canvas.width * scale,
        height: template.canvas.height * scale,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onSelectSlot(null, false);
      }}
    >
      <div className="pointer-events-none absolute inset-0">{renderContent}</div>
      <div className="pointer-events-none absolute inset-0">
        <LayoutGuides width={template.canvas.width} height={template.canvas.height} scale={scale} />
      </div>

      {template.slots
        .slice()
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((slot) => {
          const selected = selectedSlotIds.includes(slot.slotId);
          const primary = primarySlotId === slot.slotId;
          return (
            <div
              key={slot.slotId}
              onMouseDown={(event) => beginMove(event, slot)}
              onDoubleClick={() => {
                if (slot.kind === "image" || slot.kind === "shape") onStartCrop(slot.slotId);
              }}
              style={{
                position: "absolute",
                left: slot.x * scale,
                top: slot.y * scale,
                width: slot.width * scale,
                height: slot.height * scale,
                transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
                transformOrigin: "center",
                cursor: slot.locked ? "default" : "move",
                border: primary
                  ? "2px solid hsl(var(--primary))"
                  : selected
                    ? "1px solid hsl(var(--primary) / 0.85)"
                    : "1px solid rgba(255,255,255,0.18)",
                boxSizing: "border-box",
                background: selected ? "rgba(59,130,246,0.08)" : "transparent",
              }}
            >
              <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {slot.name ?? slot.kind}
              </div>
              {primary && !slot.locked && (
                <>
                  {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                    <ResizeKnob
                      key={handle}
                      handle={handle}
                      onMouseDown={(event) => beginResize(event, slot, handle)}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}

      {groupBounds && (
        <div
          className="pointer-events-none absolute rounded-md border border-dashed border-primary/70"
          style={{
            left: groupBounds.x * scale - 4,
            top: groupBounds.y * scale - 4,
            width: groupBounds.width * scale + 8,
            height: groupBounds.height * scale + 8,
          }}
        />
      )}
    </div>
  );
}

function ResizeKnob({
  handle,
  onMouseDown,
}: {
  handle: "nw" | "ne" | "sw" | "se";
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  const styleByHandle: Record<typeof handle, React.CSSProperties> = {
    nw: { left: -6, top: -6, cursor: "nwse-resize" },
    ne: { right: -6, top: -6, cursor: "nesw-resize" },
    sw: { left: -6, bottom: -6, cursor: "nesw-resize" },
    se: { right: -6, bottom: -6, cursor: "nwse-resize" },
  };
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        width: 12,
        height: 12,
        borderRadius: 9999,
        background: "hsl(var(--primary))",
        border: "2px solid white",
        ...styleByHandle[handle],
      }}
    />
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </div>
  );
}

function CropLayer({
  slot,
  scale,
  src,
  onCommit,
  onCancel,
}: {
  slot: Slot;
  scale: number;
  src: string;
  onCommit: (crop: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
}) {
  const resolvedCrop = useResolvedImageSrc(src);
  const resolved =
    resolvedCrop && !resolvedCrop.startsWith("idb://")
      ? resolvedCrop
      : src && !src.startsWith("idb://")
        ? src
        : "";
  if (!resolved) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: slot.x * scale,
        top: slot.y * scale,
        width: slot.width * scale,
        height: slot.height * scale,
      }}
    >
      <CropOverlay
        src={resolved}
        initial={slot.crop}
        zoom={scale}
        width={slot.width}
        height={slot.height}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}
