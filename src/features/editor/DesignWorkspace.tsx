import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "@/storage/useLiveQuery";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  FlipHorizontal,
  FlipVertical,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  Grid2X2,
  Grid3X3,
  Group,
  Hand,
  Image as ImageIcon,
  Info,
  Layers,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Plus,
  RotateCcw,
  RotateCw,
  ScanLine,
  Save,
  Settings2,
  Shapes,
  SquareDashed,
  SlidersHorizontal,
  Table2,
  Trash2,
  Type,
  Ungroup,
  Upload,
  Undo2,
  Redo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ux";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildTextStyle, textVerticalFlexAlign } from "@/engines/binding/dataBinding";
import { LayoutGuides } from "@/features/render/LayoutGuides";
import { PageRenderer } from "@/features/render/PageRenderer";
import { db, saveBlob } from "@/storage/db";
import { makeIdbSrc, resolveImageSrcAsync } from "@/storage/imageSrc";
import { resizeImageBlob } from "@/storage/imageResize";
import type {
  AssetItem,
  BrandKit,
  DesignDocument,
  DesignElement,
  DesignPage,
  DesignShapeElement,
  DesignTextElement,
  DesignTextRun,
  EditorMode,
  ElementStyle,
  FontAsset,
  ImageCrop,
  PageTemplate,
  SymbolDefinition,
} from "@/models";
import { packPageLabel } from "@/features/packs/packTemplateUtils";
import { DesignRenderer } from "./DesignRenderer";
import { FONTS, ensureExtendedFontsLoaded } from "./fonts";
import { usePageCommands, type CommandEntry } from "@/components/CommandPalette";
import {
  getBuiltInIconSvg,
  getBuiltInAssetLibrary,
  isHeroiconAsset,
  loadExtendedIconLibrary,
  normalizeIconSearch,
  type HeroiconAsset,
} from "./designAssets";
import { useDesignEditor } from "./designStore";
import type { CommitOptions } from "./designStore";
import {
  buildSymbolInstanceGroup,
  deleteSymbol,
  findSymbolInstances,
  instantiateSymbolElements,
  isInstanceOutdated,
  sanitizeAndCaptureBounds,
  saveSymbol,
} from "./symbols";
import { TextToolbar } from "./TextToolbar";
import {
  applyTextRunStyle,
  parseRichTextEditorContent,
  richTextToHtml,
  type TextSelectionRange,
} from "./richText";
import { CropOverlay } from "./CropOverlay";
import { CanvasRuler } from "./CanvasRuler";
import { SmartSpacing, computeSpacingLines } from "./SmartSpacing";
import { ColorPicker } from "./ColorPicker";
import { ElementBindingControls } from "./ElementBindingControls";
import { LayersPanel } from "./LayersPanel";

import {
  buildElementStylePatch,
  formatZoom,
  getToolCursor,
  getCanvasPoint,
  getDescendantIds,
  getDesignCanvasElement,
  getMarqueeSelection,
  getMoveTargets,
  getSelectedElementsByIds,
  getSelectionBounds,
  getSelectionFromMarquee,
  isEditableTarget,
  isPanToolActive,
  normalizeMarqueeRect,
  resetPreviewMarkers,
  snapMove,
  snapResize,
  startPointerSession,
  type DesignTool,
  type MovePayload,
  type ResizePayload,
} from "./designCanvasInteraction";
import { DesignStage } from "./DesignStage";
import { useDesignAutosave } from "./useDesignAutosave";
import { useDesignViewport } from "./useDesignViewport";

type WorkspaceMode = EditorMode;
type AssetPanelItem = AssetItem | HeroiconAsset;
type IconVariantFilter = "all" | HeroiconAsset["styleGroup"];
const EMPTY_ASSETS: AssetItem[] = [];
const EMPTY_BRAND_KITS: BrandKit[] = [];
const EMPTY_FONT_ASSETS: FontAsset[] = [];
const EMPTY_PAGE_TEMPLATES: PageTemplate[] = [];
const EMPTY_SYMBOLS: SymbolDefinition[] = [];
const ICON_PICKER_RESULT_LIMIT = 360;
const LETTER_SPACING_MIN = -5;
const LETTER_SPACING_MAX = 32;
const LETTER_SPACING_STEP = 0.5;

async function registerFontAsset(fontAsset: FontAsset) {
  const src = await resolveImageSrcAsync(fontAsset.sourceValue);
  const usableSrc = src ?? fontAsset.sourceValue;
  if (!usableSrc) return;
  const font = new FontFace(fontAsset.family, `url(${usableSrc})`, {
    style: fontAsset.style ?? "normal",
    weight: String(fontAsset.weight ?? 400),
  });
  await font.load();
  document.fonts.add(font);
}

function IconAssetGlyph({ asset, className }: { asset: HeroiconAsset; className?: string }) {
  const IconComponent = asset.component;
  if (IconComponent) return <IconComponent className={className} />;

  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: getBuiltInIconSvg(asset) }} />
  );
}

export function DesignWorkspace({
  initialDocument,
  mode,
  contextTitle,
  onSave,
  onClose,
  showCloseButton = false,
  headerLeading,
  allowMultiplePages = true,
  autosave = false,
  packPages = EMPTY_PAGE_TEMPLATES,
  activeTemplateId,
  onOpenTemplatePage,
  onCreatePackPage,
  onDuplicatePackPage,
  onDeletePackPage,
  onReorderPackPage,
}: {
  initialDocument: DesignDocument;
  mode?: WorkspaceMode;
  contextTitle?: string;
  onSave?: (document: DesignDocument) => void | Promise<void>;
  onClose?: () => void;
  showCloseButton?: boolean;
  headerLeading?: ReactNode;
  allowMultiplePages?: boolean;
  autosave?: boolean;
  packPages?: PageTemplate[];
  activeTemplateId?: string;
  onOpenTemplatePage?: (pageTemplateId: string) => void;
  onCreatePackPage?: () => void | Promise<void>;
  onDuplicatePackPage?: (pageTemplateId: string) => void | Promise<void>;
  onDeletePackPage?: (pageTemplateId: string) => void | Promise<void>;
  onReorderPackPage?: (pageTemplateId: string, toIndex: number) => void | Promise<void>;
}) {
  const workspaceDocument = useMemo(
    () => ({
      ...initialDocument,
      mode: mode ?? initialDocument.mode,
    }),
    [initialDocument, mode],
  );
  const editor = useDesignEditor(workspaceDocument);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [leftTab, setLeftTab] = useState("insert");
  const [rightTab, setRightTab] = useState("properties");
  const [assetSearch, setAssetSearch] = useState("");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [symbolTagFilter, setSymbolTagFilter] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState("");
  const deferredIconSearch = useDeferredValue(iconSearch);
  const [iconVariantFilter, setIconVariantFilter] = useState<IconVariantFilter>("all");
  const [extendedIconAssets, setExtendedIconAssets] = useState<HeroiconAsset[]>([]);
  const [extendedIconsLoading, setExtendedIconsLoading] = useState(false);
  const [selectedIconId, setSelectedIconId] = useState("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [snapTargetIds, setSnapTargetIds] = useState<string[]>([]);
  const [tool, setTool] = useState<DesignTool>("select");
  const [spacePressed, setSpacePressed] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const stagePanLayerRef = useRef<HTMLDivElement | null>(null);
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const lastComputedDocumentSignatureRef = useRef("");
  const [spacingLines, setSpacingLines] = useState<
    Array<{ axis: "x" | "y"; from: number; to: number; pos: number; gap: number }>
  >([]);

  useEffect(() => {
    // rightTab giờ cho phép "properties" + "layers". Bỏ force-pin cũ.
  }, []);

  const assetLibraryQuery = useLiveQuery(
    () => db.assetLibrary.orderBy("updatedAt").reverse().toArray(),
    [],
    ["assetLibrary"],
  );
  const brandKitsQuery = useLiveQuery(
    () => db.brandKits.orderBy("updatedAt").reverse().toArray(),
    [],
    ["brandKits"],
  );
  const fontAssetsQuery = useLiveQuery(
    () => db.fontAssets.orderBy("updatedAt").reverse().toArray(),
    [],
    ["fontAssets"],
  );
  const symbolsQuery = useLiveQuery(
    () => db.symbols.orderBy("updatedAt").reverse().toArray(),
    [],
    ["symbols"],
  );
  const assetLibrary = assetLibraryQuery ?? EMPTY_ASSETS;
  const brandKits = brandKitsQuery ?? EMPTY_BRAND_KITS;
  const fontAssets = fontAssetsQuery ?? EMPTY_FONT_ASSETS;
  const symbols = symbolsQuery ?? EMPTY_SYMBOLS;
  const builtInAssets = useMemo(() => getBuiltInAssetLibrary(), []);
  const uploadedAssets = assetLibrary.filter((asset) => !isHeroiconAsset(asset));
  const iconAssets = useMemo(
    () => [...builtInAssets.filter(isHeroiconAsset), ...extendedIconAssets],
    [builtInAssets, extendedIconAssets],
  );

  const symbolTagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const symbol of symbols) {
      for (const tag of symbol.tags ?? []) {
        const clean = tag.trim();
        if (clean) set.add(clean);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [symbols]);

  const filteredSymbols = useMemo(() => {
    const query = symbolSearch.trim().toLowerCase();
    return symbols.filter((symbol) => {
      if (symbolTagFilter && !(symbol.tags ?? []).includes(symbolTagFilter)) return false;
      if (!query) return true;
      if (symbol.name.toLowerCase().includes(query)) return true;
      if ((symbol.description ?? "").toLowerCase().includes(query)) return true;
      return (symbol.tags ?? []).some((tag) => tag.toLowerCase().includes(query));
    });
  }, [symbols, symbolSearch, symbolTagFilter]);

  // Editor needs the full Google Fonts catalogue for previews — load once per session.
  useEffect(() => {
    ensureExtendedFontsLoaded();
  }, []);

  const clearElementPreviewState = useCallback(() => {
    resetPreviewMarkers(getDesignCanvasElement(stageWrapRef.current), { restoreTransform: true });
  }, []);
  const filteredIconAssets = useMemo(() => {
    const query = normalizeIconSearch(deferredIconSearch.trim());
    return iconAssets.filter((asset) => {
      if (iconVariantFilter !== "all" && asset.styleGroup !== iconVariantFilter) return false;
      if (!query) return true;
      const haystack =
        asset.searchText ?? normalizeIconSearch([asset.name, ...(asset.tags ?? [])].join(" "));
      return haystack.includes(query);
    });
  }, [iconAssets, deferredIconSearch, iconVariantFilter]);
  const visibleIconAssets = useMemo(
    () => filteredIconAssets.slice(0, ICON_PICKER_RESULT_LIMIT),
    [filteredIconAssets],
  );
  const iconResultsAreLimited = filteredIconAssets.length > visibleIconAssets.length;

  useEffect(() => {
    if (leftTab !== "insert" || extendedIconAssets.length > 0) return;
    let cancelled = false;
    setExtendedIconsLoading(true);
    loadExtendedIconLibrary()
      .then((assets) => {
        if (!cancelled) setExtendedIconAssets(assets);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Khong tai duoc thu vien icon mo rong",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setExtendedIconsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [extendedIconAssets.length, leftTab]);

  const documentIdentity = `${workspaceDocument.designDocumentId}:${workspaceDocument.mode}`;
  const { autosaveStatus, beginElementTransform, endElementTransform } = useDesignAutosave({
    autosave,
    onSave,
    document: editor.document,
    documentIdentity,
    editorState: editor.state,
    lastComputedDocumentSignatureRef,
  });
  const availableFontFamilies = useMemo(() => {
    const fromGoogle = FONTS.map((font) => font.family);
    const fromUpload = fontAssets.map((fontAsset) => fontAsset.family);
    return Array.from(new Set([...fromGoogle, ...fromUpload])).sort((a, b) => a.localeCompare(b));
  }, [fontAssets]);
  const libraryAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    const merged = uploadedAssets;
    return merged.filter((asset) => {
      const haystack = [asset.name, ...(asset.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [uploadedAssets, assetSearch]);

  useEffect(() => {
    fontAssets.forEach((fontAsset) => {
      registerFontAsset(fontAsset).catch(() => undefined);
    });
  }, [fontAssets]);

  useEffect(() => {
    if (!selectedIconId && iconAssets[0]) {
      setSelectedIconId(iconAssets[0].assetId);
    }
  }, [iconAssets, selectedIconId]);

  useEffect(() => {
    if (!editingTextId) return;
    const current = editor.activeElements.find((element) => element.elementId === editingTextId);
    if (!current || (current.kind !== "text" && current.kind !== "shape")) {
      setEditingTextId(null);
      setEditingTextValue("");
    }
  }, [editingTextId, editor.activeElements]);

  const activePage = editor.activePage;
  const {
    handleZoomStep,
    handleResetZoom,
    beginPan,
    updatePan,
    endPan,
    isPanning,
    panCursor,
    setPanCursor,
    resetPanInteraction,
    handleStageWrapMouseMove,
  } = useDesignViewport({
    editor,
    activePage,
    stageWrapRef,
    stagePanLayerRef,
    tool,
    spacePressed,
  });
  const selected = editor.selectedElements;
  const primary = selected.at(-1) ?? null;

  // Paste images from the OS clipboard into the canvas (Ctrl+V / long-press paste).
  // Only reacts when focus is outside an input/textarea and the clipboard has image data.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;
      event.preventDefault();
      (async () => {
        for (let i = 0; i < files.length; i++) {
          await importImageFile(files[i], {
            position: activePage
              ? {
                  x: activePage.width / 2 - 160 + i * 24,
                  y: activePage.height / 2 - 160 + i * 24,
                }
              : undefined,
          });
        }
        toast.success(files.length === 1 ? "Đã dán ảnh" : `Đã dán ${files.length} ảnh`);
      })().catch((error) => {
        toast.error(`Không dán được ảnh: ${error instanceof Error ? error.message : String(error)}`);
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.pageId, activePage?.width, activePage?.height]);
  const hasPackPages = packPages.length > 0;
  const zoom = editor.state.viewport.zoom;
  const currentBrandKit =
    brandKits.find((kit) => kit.brandKitId === editor.state.brandKitId) ?? brandKits[0] ?? null;

  // Brand kit colors cho ColorPicker swatches — hiển thị ở đầu mọi color picker.
  const brandKitColors = useMemo(
    () => currentBrandKit?.colors?.filter((c): c is string => !!c && c.length > 0) ?? [],
    [currentBrandKit],
  );

  const persistBrandKitSelection = async (brandKitId: string | undefined) => {
    editor.setBrandKit(brandKitId);
  };

  const handleSave = async () => {
    if (!onSave) return;
    await onSave(editor.document);
    toast.success("Đã lưu thay đổi");
  };

  const runExport = async (label: "json" | "png" | "jpg" | "svg" | "pdf") => {
    try {
      const exporter = await import("./exportDesign");
      if (label === "json") exporter.exportDesignDocumentJson(editor.document);
      if (label === "png") await exporter.exportDesignPagePng({ document: editor.document });
      if (label === "jpg") await exporter.exportDesignPageJpg({ document: editor.document });
      if (label === "svg") await exporter.exportDesignPageSvg({ document: editor.document });
      if (label === "pdf") await exporter.exportDesignDocumentPdf({ document: editor.document });
      toast.success(`Đã export ${label.toUpperCase()}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Export ${label.toUpperCase()} thất bại`,
      );
    }
  };

  // Contribute editor-specific commands into the global Ctrl+K palette.
  usePageCommands(
    useMemo<CommandEntry[]>(
      () => [
        {
          id: "editor:save",
          label: "Lưu thiết kế",
          group: "Editor",
          keywords: ["save", "luu"],
          shortcut: "Ctrl+S",
          icon: <Download className="size-4" />,
          action: () => void handleSave(),
        },
        {
          id: "editor:undo",
          label: "Hoàn tác",
          group: "Editor",
          keywords: ["undo"],
          shortcut: "Ctrl+Z",
          icon: <Undo2 className="size-4" />,
          action: () => editor.undo(),
        },
        {
          id: "editor:redo",
          label: "Làm lại",
          group: "Editor",
          keywords: ["redo"],
          shortcut: "Ctrl+Shift+Z",
          icon: <Redo2 className="size-4" />,
          action: () => editor.redo(),
        },
        {
          id: "editor:export-png",
          label: "Xuất PNG",
          group: "Editor",
          keywords: ["export", "png"],
          icon: <Download className="size-4" />,
          action: () => void runExport("png"),
        },
        {
          id: "editor:export-jpg",
          label: "Xuất JPG",
          group: "Editor",
          keywords: ["export", "jpg"],
          action: () => void runExport("jpg"),
        },
        {
          id: "editor:export-svg",
          label: "Xuất SVG",
          group: "Editor",
          keywords: ["export", "svg"],
          action: () => void runExport("svg"),
        },
        {
          id: "editor:export-pdf",
          label: "Xuất PDF",
          group: "Editor",
          keywords: ["export", "pdf"],
          action: () => void runExport("pdf"),
        },
        {
          id: "editor:export-json",
          label: "Xuất JSON",
          group: "Editor",
          keywords: ["export", "json"],
          action: () => void runExport("json"),
        },
        {
          id: "editor:save-symbol",
          label: "Lưu selection thành symbol",
          group: "Editor",
          keywords: ["symbol", "save"],
          icon: <Layers className="size-4" />,
          action: () => void saveSelectionAsSymbol(),
        },
        {
          id: "editor:group",
          label: "Gom nhóm",
          group: "Editor",
          keywords: ["group"],
          shortcut: "Ctrl+G",
          action: () => editor.groupSelection(),
        },
        {
          id: "editor:ungroup",
          label: "Bỏ nhóm",
          group: "Editor",
          keywords: ["ungroup"],
          shortcut: "Ctrl+Shift+G",
          action: () => editor.ungroupSelection(),
        },
        {
          id: "editor:toggle-grid",
          label: editor.state.documentSettings.showGrid ? "Ẩn lưới" : "Hiện lưới",
          group: "Editor",
          keywords: ["grid", "luoi"],
          icon: <Grid3X3 className="size-4" />,
          action: () =>
            editor.updateDocumentSettings({
              showGrid: !editor.state.documentSettings.showGrid,
            }),
        },
        {
          id: "editor:toggle-safe-zone",
          label: editor.state.documentSettings.showSafeZone
            ? "Ẩn vùng an toàn"
            : "Hiện vùng an toàn",
          group: "Editor",
          keywords: ["safe zone", "vung an toan"],
          action: () =>
            editor.updateDocumentSettings({
              showSafeZone: !editor.state.documentSettings.showSafeZone,
            }),
        },
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        editor.state.documentSettings.showGrid,
        editor.state.documentSettings.showSafeZone,
      ],
    ),
  );

  const insertText = () => {
    if (!activePage) return;
    const elementId = nanoid();
    editor.insertElement({
      elementId,
      pageId: activePage.pageId,
      kind: "text",
      name: "Chữ",
      x: 120,
      y: 120,
      width: 420,
      height: 120,
      zIndex: editor.activeElements.length,
      text: "Chữ mới",
      style: {
        fontFamily: currentBrandKit?.fontAssetIds.length
          ? (fontAssets.find((item) => item.fontAssetId === currentBrandKit.fontAssetIds[0])
              ?.family ?? "Be Vietnam Pro")
          : "Be Vietnam Pro",
        fontSize: 48,
        fontWeight: 700,
        color: "#0f172a",
        lineHeight: 1.2,
      },
      textRuns: [],
    });
  };

  const insertShape = (shapeKind: "rectangle" | "circle" | "triangle" | "line" = "rectangle") => {
    if (!activePage) return;
    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "shape",
      name: "Hình",
      x: 160,
      y: 180,
      width: shapeKind === "line" ? 320 : 240,
      height: shapeKind === "line" ? 20 : 180,
      zIndex: editor.activeElements.length,
      shapeKind,
      text: "",
      textRuns: [],
      style: {
        fill: shapeKind === "line" ? "#0f172a" : "#f97316",
        borderRadius: shapeKind === "circle" ? 9999 : 18,
        strokeWidth: shapeKind === "line" ? 4 : undefined,
        fontFamily: "Be Vietnam Pro",
        fontSize: 32,
        fontWeight: 700,
        color: "#0f172a",
        lineHeight: 1.2,
        textAlign: "center",
      },
    });
  };

  const insertTable = () => {
    if (!activePage) return;
    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "table",
      name: "Bảng",
      x: 120,
      y: 220,
      width: 560,
      height: 300,
      zIndex: editor.activeElements.length,
      columns: 3,
      rows: 4,
      cells: Array.from({ length: 12 }, (_, index) => ({
        cellId: `cell-${index}`,
        text: index < 3 ? `Tiêu đề ${index + 1}` : "",
      })),
      style: {
        fill: "#ffffff",
        color: "#0f172a",
        fontSize: 18,
      },
    });
  };

  const insertImageFrame = () => {
    if (!activePage) return;
    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "image",
      name: "Ảnh",
      x: 140,
      y: 160,
      width: 320,
      height: 420,
      zIndex: editor.activeElements.length,
      src: "",
      style: {
        fit: "cover",
        borderRadius: 24,
      },
    });
  };

  const insertAsset = (asset: AssetPanelItem) => {
    if (!activePage) return;
    if (isHeroiconAsset(asset)) {
      const svgContent = getBuiltInIconSvg(asset);
      editor.insertElement({
        elementId: nanoid(),
        pageId: activePage.pageId,
        kind: "icon",
        name: asset.name,
        x: 160,
        y: 160,
        width: 180,
        height: 180,
        zIndex: editor.activeElements.length,
        iconName: asset.iconName,
        svgContent: svgContent || asset.svgContent,
        assetId: asset.assetId,
        style: {
          tint: "#0f172a",
          color: "#0f172a",
        },
      });
      return;
    }

    if (asset.kind === "svg") {
      editor.insertElement({
        elementId: nanoid(),
        pageId: activePage.pageId,
        kind: "svg",
        name: asset.name,
        x: 160,
        y: 160,
        width: 180,
        height: 180,
        zIndex: editor.activeElements.length,
        svgContent: asset.sourceValue,
        assetId: asset.assetId,
        style: {
          tint: "#0f172a",
          color: "#0f172a",
        },
      });
      return;
    }

    editor.insertElement({
      elementId: nanoid(),
      pageId: activePage.pageId,
      kind: "image",
      name: asset.name,
      x: 160,
      y: 160,
      width: 320,
      height: 320,
      zIndex: editor.activeElements.length,
      src: asset.sourceValue,
      assetId: asset.assetId,
      style: {
        fit: "cover",
        borderRadius: 24,
      },
    });
  };

  // Import a File/Blob as an image asset (saves to Dexie + adds element).
  // Reused by manual upload, drag-drop, and clipboard paste.
  const importImageFile = async (
    file: File | Blob,
    options?: {
      kind?: AssetItem["kind"];
      position?: { x: number; y: number };
      insert?: boolean;
      name?: string;
    },
  ) => {
    const kind = options?.kind ?? "image";
    const needsResize = kind === "image" || kind === "logo";
    const payload = needsResize ? await resizeImageBlob(file) : file;
    const blobKey = await saveBlob(payload);
    const fallbackName = file instanceof File ? file.name : "image";
    const asset: AssetItem = {
      assetId: nanoid(),
      name: (options?.name ?? fallbackName).replace(/\.[^.]+$/, "") || "image",
      kind,
      sourceType: "local",
      sourceValue: makeIdbSrc(blobKey),
      blobKey,
      mime: payload.type || file.type || "image/jpeg",
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.assetLibrary.put(asset);
    editor.setAssetIds([...editor.state.assetIds, asset.assetId]);

    if (options?.insert !== false && kind !== "logo" && activePage) {
      const width = 320;
      const height = 320;
      const fallbackX = (activePage.width - width) / 2;
      const fallbackY = (activePage.height - height) / 2;
      editor.insertElement({
        elementId: nanoid(),
        pageId: activePage.pageId,
        kind: "image",
        name: asset.name,
        x: Math.round(options?.position?.x ?? fallbackX),
        y: Math.round(options?.position?.y ?? fallbackY),
        width,
        height,
        zIndex: editor.activeElements.length,
        src: asset.sourceValue,
        assetId: asset.assetId,
        style: {
          fit: "cover",
          borderRadius: 24,
        },
      });
    }
    return asset;
  };

  const uploadAsset = async (kind: AssetItem["kind"] = "image") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "image" || kind === "logo" ? "image/*" : ".svg";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (kind === "image" || kind === "logo") {
        await importImageFile(file, { kind });
      } else {
        // Non-image kinds (svg/icon/etc): keep old behaviour without resize.
        const blobKey = await saveBlob(file);
        const asset: AssetItem = {
          assetId: nanoid(),
          name: file.name.replace(/\.[^.]+$/, ""),
          kind,
          sourceType: "local",
          sourceValue: makeIdbSrc(blobKey),
          blobKey,
          mime: file.type,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.assetLibrary.put(asset);
        editor.setAssetIds([...editor.state.assetIds, asset.assetId]);
        insertAsset(asset);
      }
      toast.success("Đã thêm asset");
    };
    input.click();
  };

  const deleteAsset = async (asset: AssetItem) => {
    await db.assetLibrary.delete(asset.assetId);
    editor.setAssetIds(editor.state.assetIds.filter((id) => id !== asset.assetId));
    toast.success(`Đã xoá asset "${asset.name}"`);
  };

  // ─── Symbols (reusable component bundles) ────────────────────────────────
  const saveSelectionAsSymbol = async (name?: string, ids = editor.state.selection.ids) => {
    if (!activePage) return;
    const actionIds = getSelectionActionIds(ids);
    const selection = getSelectedElementsByIds(editor.activeElements, actionIds);
    if (selection.length === 0) {
      toast.error("Chọn phần tử muốn lưu thành symbol");
      return;
    }
    const existingSymbolId = (() => {
      if (selection.length !== 1) return undefined;
      const meta = selection[0]?.meta as Record<string, unknown> | undefined;
      return typeof meta?.symbolId === "string" ? meta.symbolId : undefined;
    })();
    const existing = existingSymbolId ? await db.symbols.get(existingSymbolId) : undefined;
    const defaultName = existing?.name ?? selection[0]?.name ?? "Symbol";
    const nameInput =
      typeof window !== "undefined" ? window.prompt("Tên symbol", name ?? defaultName) : defaultName;
    if (nameInput == null) return;
    const finalName = nameInput.trim() || defaultName;
    try {
      // Capture thumbnail (non-blocking — if it fails, symbol still saves without one).
      let thumbnail: string | undefined;
      try {
        const normalized = sanitizeAndCaptureBounds(selection);
        const { renderSymbolThumbnail } = await import("./exportDesign");
        thumbnail = await renderSymbolThumbnail({
          elements: normalized.elements,
          width: normalized.width,
          height: normalized.height,
        });
      } catch {
        thumbnail = undefined;
      }
      const symbol = await saveSymbol({
        name: finalName,
        elements: selection,
        symbolId: existing?.symbolId,
        currentVersion: existing?.version,
        thumbnail,
      });
      // Tag current selection as an instance of the saved symbol.
      editor.updateElements(
        selection.map((el) => el.elementId),
        (element) => ({
          meta: {
            ...(element.meta ?? {}),
            symbolId: symbol.symbolId,
            symbolVersion: symbol.version,
          },
        }),
        { history: true },
      );
      toast.success(
        existing ? `Đã cập nhật symbol "${finalName}" (v${symbol.version})` : `Đã lưu symbol "${finalName}"`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được symbol");
    }
  };

  const insertSymbolInstance = (symbol: SymbolDefinition) => {
    if (!activePage) return;
    const offsetX = Math.max(0, (activePage.width - symbol.width) / 2);
    const offsetY = Math.max(0, (activePage.height - symbol.height) / 2);
    const zIndexStart = editor.activeElements.length;
    const elements = instantiateSymbolElements(symbol, {
      pageId: activePage.pageId,
      offsetX,
      offsetY,
      zIndexStart,
    });
    // Wrap in a group so the instance can be moved as a unit.
    const { group, children } = buildSymbolInstanceGroup(elements, symbol, activePage.pageId);
    for (const child of children) editor.insertElement(child);
    editor.insertElement(group);
    editor.setSelection([group.elementId], group.elementId);
    toast.success(`Đã thêm symbol "${symbol.name}"`);
  };

  const syncInstanceWithLatest = async (
    instanceRoot: DesignElement,
    symbol: SymbolDefinition,
  ) => {
    if (!activePage) return;
    // Replace instance: delete current group + its descendants, then insert fresh copy at same position.
    const rootMeta = instanceRoot.meta as Record<string, unknown> | undefined;
    const keepX = instanceRoot.x;
    const keepY = instanceRoot.y;
    editor.deleteSelection([instanceRoot.elementId]);
    const elements = instantiateSymbolElements(symbol, {
      pageId: activePage.pageId,
      offsetX: keepX,
      offsetY: keepY,
      zIndexStart: instanceRoot.zIndex ?? editor.activeElements.length,
    });
    const { group, children } = buildSymbolInstanceGroup(elements, symbol, activePage.pageId);
    // Preserve legacy meta keys from the old instance except symbolVersion.
    if (rootMeta) {
      group.meta = {
        ...rootMeta,
        symbolId: symbol.symbolId,
        symbolVersion: symbol.version,
      };
    }
    for (const child of children) editor.insertElement(child);
    editor.insertElement(group);
    editor.setSelection([group.elementId], group.elementId);
    toast.success(`Đã đồng bộ symbol "${symbol.name}" (v${symbol.version})`);
  };

  const removeSymbol = async (symbol: SymbolDefinition) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Xoá symbol "${symbol.name}"? Các instance hiện có sẽ giữ nguyên nhưng không còn sync được nữa.`,
      );
      if (!ok) return;
    }
    try {
      await deleteSymbol(symbol.symbolId);
      toast.success(`Đã xoá symbol "${symbol.name}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không xoá được symbol");
    }
  };

  const editSymbolTags = async (symbol: SymbolDefinition) => {
    if (typeof window === "undefined") return;
    const current = (symbol.tags ?? []).join(", ");
    const input = window.prompt(`Tag cho "${symbol.name}" (phân cách bằng dấu phẩy)`, current);
    if (input == null) return;
    const tags = input
      .split(",")
      .map((tag) => tag.trim().replace(/^#+/, ""))
      .filter(Boolean);
    try {
      await db.symbols.put({ ...symbol, tags, updatedAt: Date.now() });
      toast.success(`Đã cập nhật tag cho "${symbol.name}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không cập nhật được tag");
    }
  };

  const uploadFont = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".woff,.woff2,.ttf,.otf";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const blobKey = await saveBlob(file);
      const family = file.name.replace(/\.[^.]+$/, "");
      const fontAsset: FontAsset = {
        fontAssetId: nanoid(),
        family,
        sourceValue: makeIdbSrc(blobKey),
        blobKey,
        format: file.name.split(".").pop()?.toLowerCase(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.fontAssets.put(fontAsset);
      await registerFontAsset(fontAsset);
      toast.success(`Đã thêm font ${family}`);
    };
    input.click();
  };

  const createBrandKit = async () => {
    const brandKit: BrandKit = {
      brandKitId: nanoid(),
      name: `Bộ thương hiệu ${brandKits.length + 1}`,
      colors: ["#0f172a", "#f97316", "#f8fafc"],
      logoAssetIds: [],
      fontAssetIds: [],
      presets: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.brandKits.put(brandKit);
    await persistBrandKitSelection(brandKit.brandKitId);
    toast.success("Đã tạo bộ thương hiệu");
  };

  const updateBrandKit = async (patch: Partial<BrandKit>) => {
    if (!currentBrandKit) return;
    await db.brandKits.put({
      ...currentBrandKit,
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const toggleSafeZone = () => {
    editor.updateDocumentSettings({
      showSafeZone: !editor.state.documentSettings.showSafeZone,
    });
  };

  const openPropertiesPanel = () => {
    setRightOpen(true);
    setRightTab("properties");
  };

  const getSelectionActionIds = (ids = editor.state.selection.ids) => {
    const actionIds = new Set<string>(ids);
    getSelectedElementsByIds(editor.activeElements, ids).forEach((element) => {
      if (element.kind !== "group") return;
      getDescendantIds(editor.activeElements, element.elementId).forEach((id) =>
        actionIds.add(id),
      );
    });
    return Array.from(actionIds);
  };

  const moveSelectionBy = (dx: number, dy: number, ids?: string[]) => {
    const actionIds = getSelectionActionIds(ids);
    if (actionIds.length === 0) return;
    editor.updateElements(actionIds, (element) => ({
      x: Math.round(element.x + dx),
      y: Math.round(element.y + dy),
    }));
  };

  const alignSelectionToPage = (
    mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
    ids = editor.state.selection.ids,
  ) => {
    const targets = getSelectedElementsByIds(editor.activeElements, ids);
    if (!activePage || targets.length === 0) return;
    const bounds = getSelectionBounds(targets);
    if (!bounds) return;
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = -bounds.x;
    if (mode === "center") dx = activePage.width / 2 - (bounds.x + bounds.width / 2);
    if (mode === "right") dx = activePage.width - (bounds.x + bounds.width);
    if (mode === "top") dy = -bounds.y;
    if (mode === "middle") dy = activePage.height / 2 - (bounds.y + bounds.height / 2);
    if (mode === "bottom") dy = activePage.height - (bounds.y + bounds.height);
    moveSelectionBy(dx, dy, ids);
  };

  const alignSelectionFromToolbar = (
    mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) => {
    alignSelectionToPage(mode);
  };

  const showSelectionInfo = () => {
    const bounds = getSelectionBounds(selected);
    if (!primary) return;
    const info = bounds
      ? `${primary.name ?? primary.kind} · ${Math.round(bounds.width)}×${Math.round(bounds.height)}`
      : (primary.name ?? primary.kind);
    toast.message(info);
    openPropertiesPanel();
  };

  const setSelectionForElements = (ids: string[]) => {
    editor.setSelection(ids, ids.at(-1) ?? null);
  };

  const updatePrimaryElement = (patch: Partial<DesignElement>) => {
    if (!primary) return;
    editor.updateElements([primary.elementId], patch, { history: false });
  };

  const updatePrimaryElementWithDescendants = (patch: Partial<DesignElement>) => {
    if (!primary) return;
    editor.updateElements(getSelectionActionIds([primary.elementId]), patch, { history: false });
  };

  const updateElementStyle = (elementId: string, patch: Partial<ElementStyle>) => {
    editor.updateElements(
      [elementId],
      (element) => buildElementStylePatch(element, patch),
      { history: false },
    );
  };

  const updatePrimaryStyle = (patch: Partial<ElementStyle>) => {
    if (!primary) return;
    updateElementStyle(primary.elementId, patch);
  };

  const commitElementStyle = (elementId: string, patch: Partial<ElementStyle>) => {
    editor.updateElements([elementId], (element) => buildElementStylePatch(element, patch));
  };

  const commitPrimaryStyle = (patch: Partial<ElementStyle>) => {
    if (!primary) return;
    commitElementStyle(primary.elementId, patch);
  };

  const updatePagePreview = (
    pageId: string,
    patch: Partial<DesignPage>,
    options: CommitOptions = { history: false },
  ) => {
    editor.updatePage(pageId, patch, options);
  };

  const commitPagePatch = (pageId: string, patch: Partial<DesignPage>) => {
    editor.updatePage(pageId, patch);
  };

  const startInlineTextEdit = (elementId: string) => {
    const element = editor.activeElements.find((item) => item.elementId === elementId);
    if (!element || (element.kind !== "text" && element.kind !== "shape")) return;
    editor.setSelection([elementId], elementId);
    setEditingTextId(elementId);
    setEditingTextValue(element.text ?? "");
  };

  const commitInlineTextEdit = (textValue = editingTextValue, textRuns?: DesignTextRun[]) => {
    if (!editingTextId) return;
    editor.updateElements(
      [editingTextId],
      { text: textValue, ...(textRuns ? { textRuns } : {}) } as Partial<DesignElement>,
      { history: false },
    );
    setEditingTextId(null);
    setEditingTextValue("");
  };

  const updateTextRunStyle = (
    elementId: string,
    range: TextSelectionRange,
    patch: Partial<ElementStyle>,
  ) => {
    editor.updateElements(
      [elementId],
      (element) => {
        if (element.kind !== "text" && element.kind !== "shape") return {};
        return {
          textRuns: applyTextRunStyle(element.text ?? "", element.textRuns, range, patch),
        } as Partial<DesignElement>;
      },
      { history: false },
    );
  };

  const cancelInlineTextEdit = () => {
    setEditingTextId(null);
    setEditingTextValue("");
  };

  const keyboardStateRef = useRef({
    editor,
    selected,
    editingTextId,
    insertText,
    insertShape,
    cancelInlineTextEdit,
    clearElementPreviewState,
  });
  keyboardStateRef.current = {
    editor,
    selected,
    editingTextId,
    insertText,
    insertShape,
    cancelInlineTextEdit,
    clearElementPreviewState,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        setSpacePressed(true);
        return;
      }

      if (isEditableTarget(event.target)) return;

      const keyboard = keyboardStateRef.current;
      const currentEditor = keyboard.editor;
      const currentSelected = keyboard.selected;
      const mod = event.ctrlKey || event.metaKey;
      const lower = event.key.toLowerCase();

      if (lower === "v" && !mod) {
        event.preventDefault();
        setTool("select");
        return;
      }
      if (lower === "h" && !mod) {
        event.preventDefault();
        setTool("pan");
        return;
      }
      if (lower === "t" && !mod) {
        event.preventDefault();
        keyboard.insertText();
        return;
      }
      if (lower === "r" && !mod) {
        event.preventDefault();
        keyboard.insertShape("rectangle");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (keyboard.editingTextId) {
          keyboard.cancelInlineTextEdit();
          return;
        }
        currentEditor.setSelection([]);
        setMarqueeRect(null);
        return;
      }
      if (mod && lower === "a") {
        event.preventDefault();
        const selectableIds = currentEditor.activeElements
          .filter((element) => !element.hidden)
          .map((element) => element.elementId);
        currentEditor.setSelection(selectableIds, selectableIds.at(-1) ?? null);
        return;
      }
      if (mod && lower === "z" && !event.shiftKey) {
        event.preventDefault();
        keyboard.clearElementPreviewState();
        currentEditor.undo();
        return;
      }
      if (mod && ((lower === "z" && event.shiftKey) || lower === "y")) {
        event.preventDefault();
        keyboard.clearElementPreviewState();
        currentEditor.redo();
        return;
      }
      if (mod && lower === "c") {
        event.preventDefault();
        currentEditor.copySelection();
        return;
      }
      if (mod && lower === "v") {
        event.preventDefault();
        currentEditor.pasteClipboard();
        return;
      }
      if (mod && lower === "d") {
        event.preventDefault();
        currentEditor.duplicateSelection();
        return;
      }
      if (mod && (event.key === "0" || event.code === "Digit0")) {
        event.preventDefault();
        handleResetZoom();
        return;
      }
      if (mod && lower === "g" && event.shiftKey) {
        event.preventDefault();
        currentEditor.ungroupSelection();
        return;
      }
      if (mod && lower === "g") {
        event.preventDefault();
        currentEditor.groupSelection();
        return;
      }
      if (mod && event.key === "]") {
        event.preventDefault();
        if (event.altKey) currentEditor.orderSelection("front");
        else currentEditor.orderSelection("forward");
        return;
      }
      if (mod && event.key === "[") {
        event.preventDefault();
        if (event.altKey) currentEditor.orderSelection("back");
        else currentEditor.orderSelection("backward");
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && currentSelected.length > 0) {
        event.preventDefault();
        currentEditor.deleteSelection();
        return;
      }
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        if (currentSelected.length === 0) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const moveTargets = new Set<string>();
        currentSelected.forEach((element) => {
          moveTargets.add(element.elementId);
          getDescendantIds(currentEditor.activeElements, element.elementId).forEach((id) =>
            moveTargets.add(id),
          );
        });
        currentEditor.updateElements(Array.from(moveTargets), (element) => ({
          x: element.x + dx,
          y: element.y + dy,
        }));
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") {
        setSpacePressed(false);
        resetPanInteraction();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // handleResetZoom is declared below and accessed via closure at call-time;
    // safe because it reads latest state from refs/editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStageBackgroundPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const canvas = event.currentTarget;
    if (isPanToolActive(tool, spacePressed)) {
      beginPan(event.clientX, event.clientY);
      const onMove = (moveEvent: PointerEvent) =>
        updatePan(moveEvent.clientX, moveEvent.clientY);
      const onEnd = () => {
        endPan();
      };
      startPointerSession(event, { onMove, onEnd, onCancel: onEnd });
      return;
    }

    editor.setSelection([]);
    const additive = event.shiftKey;
    const toggle = event.ctrlKey || event.metaKey;
    const start = getCanvasPoint(canvas, zoom, event.clientX, event.clientY, 0, 0);
    setMarqueeRect({ x: start.x, y: start.y, width: 0, height: 0 });

    const onMove = (moveEvent: PointerEvent) => {
      const point = getCanvasPoint(canvas, zoom, moveEvent.clientX, moveEvent.clientY, 0, 0);
      const rect = normalizeMarqueeRect(start, point);
      setMarqueeRect(rect);
      const nextIds = getSelectionFromMarquee(
        editor.state.selection.ids,
        getMarqueeSelection(editor.activeElements, rect),
        additive,
        toggle,
      );
      editor.setSelection(nextIds, nextIds.at(-1) ?? null);
    };

    const onEnd = () => {
      setMarqueeRect(null);
    };

    startPointerSession(event, { onMove, onEnd, onCancel: onEnd });
  };

  const handleStageWrapPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-design-canvas]")) return;
    if (isPanToolActive(tool, spacePressed)) return;
    editor.setSelection([]);
    setMarqueeRect(null);
  };

  const selectedBounds = getSelectionBounds(selected);
  const stageCursor = isPanning ? panCursor : getToolCursor(tool, spacePressed);

  const renderElementContextMenu = (element: DesignElement) => {
    const contextIds = editor.state.selection.ids.includes(element.elementId)
      ? editor.state.selection.ids
      : [element.elementId];
    const contextElements = getSelectedElementsByIds(editor.activeElements, contextIds);
    const hasContextSelection = contextElements.length > 0;
    const contextActionIds = getSelectionActionIds(contextIds);
    const canGroup = contextElements.length > 1;
    const canUngroup = contextElements.some((item) => item.kind === "group");
    if (import.meta.env.DEV) {
      console.debug("[ContextMenu]", {
        elementId: element.elementId,
        contextIds,
        contextActionIds,
        hasContextSelection,
        activeElementsCount: editor.activeElements.length,
      });
    }
    const showContextInfo = () => {
      const bounds = getSelectionBounds(contextElements.length ? contextElements : [element]);
      const label =
        contextElements.length > 1
          ? `${contextElements.length} thành phần`
          : (element.name ?? element.kind);
      const info = bounds
        ? `${label} · ${Math.round(bounds.width)}×${Math.round(bounds.height)}`
        : label;
      toast.message(info);
      setSelectionForElements(contextIds);
      openPropertiesPanel();
    };
    return (
      <ContextMenuContent className="w-72">
        <ContextMenuItem
          onSelect={() => editor.copySelection(contextIds)}
          disabled={!hasContextSelection}
        >
          <Copy className="mr-2 size-4" />
          Sao chép
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.pasteClipboard()}
          disabled={!editor.state.clipboard?.length}
        >
          <ClipboardPaste className="mr-2 size-4" />
          Dán
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.duplicateSelection(contextIds)}
          disabled={!hasContextSelection}
        >
          <Layers className="mr-2 size-4" />
          Tạo bản sao
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.deleteSelection(contextIds)}
          disabled={!hasContextSelection}
        >
          <Trash2 className="mr-2 size-4" />
          Xóa
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            if (import.meta.env.DEV) console.debug("[ContextMenu] orderSelection front", contextIds);
            editor.orderSelection("front", contextIds);
          }}
          disabled={!hasContextSelection}
        >
          Lên trên cùng
          <ContextMenuShortcut>Ctrl+Alt+]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.orderSelection("forward", contextIds)}
          disabled={!hasContextSelection}
        >
          Lên một lớp
          <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.orderSelection("backward", contextIds)}
          disabled={!hasContextSelection}
        >
          Xuống một lớp
          <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => editor.orderSelection("back", contextIds)}
          disabled={!hasContextSelection}
        >
          Xuống dưới cùng
          <ContextMenuShortcut>Ctrl+Alt+[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Căn chỉnh theo trang</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem onSelect={() => alignSelectionToPage("left", contextIds)}>
              Căn trái
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("center", contextIds)}>
              Căn giữa ngang
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("right", contextIds)}>
              Căn phải
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => alignSelectionToPage("top", contextIds)}>
              Căn trên
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("middle", contextIds)}>
              Căn giữa dọc
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => alignSelectionToPage("bottom", contextIds)}>
              Căn dưới
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => editor.groupSelection(contextIds)} disabled={!canGroup}>
          <Group className="mr-2 size-4" />
          Tạo thành phần
          <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.ungroupSelection(contextIds)} disabled={!canUngroup}>
          <Ungroup className="mr-2 size-4" />
          Bỏ nhóm
          <ContextMenuShortcut>Ctrl+Shift+G</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (import.meta.env.DEV) console.debug("[ContextMenu] lock", contextActionIds, !element.locked);
            editor.updateElements(
              contextActionIds,
              { locked: !element.locked },
            );
          }}
        >
          {element.locked ? <LockOpen className="mr-2 size-4" /> : <Lock className="mr-2 size-4" />}
          {element.locked ? "Mở khóa" : "Khóa"}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (import.meta.env.DEV) console.debug("[ContextMenu] hidden", contextActionIds, !element.hidden);
            editor.updateElements(
              contextActionIds,
              { hidden: !element.hidden },
            );
          }}
        >
          {element.hidden ? <Eye className="mr-2 size-4" /> : <EyeOff className="mr-2 size-4" />}
          {element.hidden ? "Hiện thành phần" : "Ẩn thành phần"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            if (import.meta.env.DEV) console.debug("[ContextMenu] flipH", contextActionIds);
            editor.updateElements(
              contextActionIds,
              {
                style: { ...(element.style ?? {}), flipH: !element.style?.flipH },
              } as Partial<DesignElement>,
            );
          }}
        >
          <FlipHorizontal className="mr-2 size-4" />
          Lật ngang
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (import.meta.env.DEV) console.debug("[ContextMenu] flipV", contextActionIds);
            editor.updateElements(
              contextActionIds,
              {
                style: { ...(element.style ?? {}), flipV: !element.style?.flipV },
              } as Partial<DesignElement>,
            );
          }}
        >
          <FlipVertical className="mr-2 size-4" />
          Lật dọc
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void saveSelectionAsSymbol(undefined, contextIds)}>
          <Layers className="mr-2 size-4" />
          Lưu thành symbol
        </ContextMenuItem>
        {element.kind === "image" ? (
          <>
            <ContextMenuItem onSelect={() => setCropTargetId(element.elementId)}>
              <ImageIcon className="mr-2 size-4" />
              Cắt ảnh
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = async (event) => {
                  const file = (event.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  try {
                    const asset = await importImageFile(file, { insert: false });
                    editor.updateElements(
                      [element.elementId],
                      { src: asset.sourceValue, assetId: asset.assetId } as Partial<DesignElement>,
                      { history: true },
                    );
                    toast.success(`Đã đổi ảnh "${element.name ?? ""}"`.trim());
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Đổi ảnh thất bại",
                    );
                  }
                };
                input.click();
              }}
            >
              <Upload className="mr-2 size-4" />
              Đổi ảnh khác
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            setSelectionForElements(contextIds);
            openPropertiesPanel();
          }}
        >
          <PanelRight className="mr-2 size-4" />
          Mở thuộc tính
        </ContextMenuItem>
        <ContextMenuItem onSelect={showContextInfo}>
          <Info className="mr-2 size-4" />
          Thông tin
        </ContextMenuItem>
      </ContextMenuContent>
    );
  };

  const renderCanvasContextMenu = () => (
    <ContextMenuContent className="w-64">
      <ContextMenuLabel>Vùng thiết kế</ContextMenuLabel>
      <ContextMenuItem
        onSelect={() => editor.pasteClipboard()}
        disabled={!editor.state.clipboard?.length}
      >
        <ClipboardPaste className="mr-2 size-4" />
        Dán
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={insertText}>
        <Type className="mr-2 size-4" />
        Thêm text
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => insertShape("rectangle")}>
        <Shapes className="mr-2 size-4" />
        Thêm shape
      </ContextMenuItem>
      <ContextMenuItem onSelect={insertImageFrame}>
        <ImageIcon className="mr-2 size-4" />
        Thêm khung ảnh
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuCheckboxItem
        checked={editor.state.documentSettings.showSafeZone}
        onCheckedChange={toggleSafeZone}
      >
        Hiện khung an toàn
      </ContextMenuCheckboxItem>
    </ContextMenuContent>
  );

  const renderViewToggleGroup = (className = "") => (
    <div className={`flex shrink-0 items-center rounded-md border bg-background p-0.5 ${className}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={`size-8 ${
              editor.state.documentSettings.showSafeZone
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : ""
            }`}
            onClick={toggleSafeZone}
            aria-label="Bật tắt vùng an toàn"
            aria-pressed={editor.state.documentSettings.showSafeZone}
          >
            <SquareDashed className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Vùng an toàn</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={`size-8 ${
              editor.state.documentSettings.showGrid
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : ""
            }`}
            onClick={() =>
              editor.updateDocumentSettings({
                showGrid: !editor.state.documentSettings.showGrid,
              })
            }
            aria-label="Bật tắt lưới"
            aria-pressed={editor.state.documentSettings.showGrid}
          >
            <Grid3X3 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Lưới</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={`size-8 ${
              editor.state.documentSettings.showGuides
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : ""
            }`}
            onClick={() =>
              editor.updateDocumentSettings({
                showGuides: !editor.state.documentSettings.showGuides,
              })
            }
            aria-label="Bật tắt đường căn"
            aria-pressed={editor.state.documentSettings.showGuides}
          >
            <ScanLine className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Đường căn</TooltipContent>
      </Tooltip>
    </div>
  );

  const renderWorkspaceActions = (className = "") => (
    <div className={`flex shrink-0 items-center justify-end gap-1.5 ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <Download className="mr-2 size-4" />
            Tải xuống
            <ChevronDown className="ml-1 size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Xuất thiết kế</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => runExport("png")}>PNG</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runExport("jpg")}>JPG</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runExport("svg")}>SVG</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runExport("pdf")}>PDF</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => runExport("json")}>JSON (kỹ thuật)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolbarDivider />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={leftOpen ? "default" : "ghost"}
            className="size-8"
            onClick={() => setLeftOpen((value) => !value)}
            aria-label="Bật tắt panel trái"
            aria-pressed={leftOpen}
          >
            <PanelLeft className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Panel trái</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={rightOpen ? "default" : "ghost"}
            className="size-8"
            onClick={() => setRightOpen((value) => !value)}
            aria-label="Bật tắt panel phải"
            aria-pressed={rightOpen}
          >
            <PanelRight className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Panel phải</TooltipContent>
      </Tooltip>

      {autosave && onSave ? (
        <span
          className="px-1 text-xs text-muted-foreground"
          aria-live="polite"
          title="Editor lưu tự động khi có thay đổi"
        >
          {autosaveStatus === "pending" || autosaveStatus === "saving"
            ? "Đang lưu"
            : autosaveStatus === "error"
              ? "Đang lưu"
              : "Đã lưu"}
        </span>
      ) : null}

      {!autosave && onSave ? (
        <Button onClick={handleSave}>
          <Save className="mr-2 size-4" />
          Lưu
        </Button>
      ) : null}

      {showCloseButton && onClose ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8 rounded-full"
              onClick={onClose}
              aria-label="Đóng editor"
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Đóng editor</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );

  if (!activePage) return null;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
        {headerLeading ? (
          <div className="flex min-h-[54px] items-center gap-2 border-b px-4 py-2">
            <div className="flex shrink-0 items-center">{headerLeading}</div>
            {renderWorkspaceActions("ml-auto")}
          </div>
        ) : null}

        <div className="flex min-h-[54px] flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b bg-card/40 px-3 py-2">
          {headerLeading ? (
            renderViewToggleGroup()
          ) : mode === "generated" ? (
            <div className="flex shrink-0 items-center gap-2">
              {contextTitle ? (
                <div className="truncate rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {contextTitle}
                </div>
              ) : null}
            </div>
          ) : (
            <Input
              value={editor.document.name}
              onChange={(event) => editor.setName(event.target.value)}
              className="h-8 w-[220px] shrink-0"
              aria-label="Tên design"
            />
          )}

          {contextTitle && mode !== "generated" ? (
            <div
              className="max-w-[240px] shrink-0 truncate rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
              title={contextTitle}
            >
              {contextTitle}
            </div>
          ) : null}

          <ToolbarDivider />

          {/* Undo / Redo */}
          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={!editor.canUndo}
                  onClick={() => {
                    clearElementPreviewState();
                    editor.undo();
                  }}
                >
                  <Undo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Hoàn tác · Ctrl+Z</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={!editor.canRedo}
                  onClick={() => {
                    clearElementPreviewState();
                    editor.redo();
                  }}
                >
                  <Redo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Làm lại · Ctrl+Shift+Z</TooltipContent>
            </Tooltip>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => handleZoomStep(-1)}
                  aria-label="Thu nhỏ"
                >
                  <ZoomOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Thu nhỏ · Ctrl/Cmd + −</TooltipContent>
            </Tooltip>
            <div className="w-14 text-center text-xs font-medium tabular-nums">
              {formatZoom(zoom)}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => handleZoomStep(1)}
                  aria-label="Phóng to"
                >
                  <ZoomIn className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Phóng to · Ctrl/Cmd + +</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={handleResetZoom}
                  aria-label="Đặt lại khung nhìn"
                >
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Đặt lại khung nhìn</TooltipContent>
            </Tooltip>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={tool === "select" ? "default" : "ghost"}
                  className="size-8"
                  onClick={() => setTool("select")}
                  aria-label="Chọn"
                  aria-pressed={tool === "select"}
                >
                  <MousePointer2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Chọn · V</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={tool === "pan" || spacePressed ? "default" : "ghost"}
                  className="size-8"
                  onClick={() => setTool("pan")}
                  aria-label="Di chuyển khung nhìn"
                  aria-pressed={tool === "pan"}
                >
                  <Hand className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Di chuyển khung nhìn · H / Space</TooltipContent>
            </Tooltip>
          </ToolbarGroup>

          <ToolbarDivider />

          {headerLeading ? null : (
            <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={`size-8 ${
                    editor.state.documentSettings.showSafeZone
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : ""
                  }`}
                  onClick={toggleSafeZone}
                  aria-label="Bật tắt vùng an toàn"
                  aria-pressed={editor.state.documentSettings.showSafeZone}
                >
                  <SquareDashed className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Vùng an toàn</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={`size-8 ${
                    editor.state.documentSettings.showGrid
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : ""
                  }`}
                  onClick={() =>
                    editor.updateDocumentSettings({
                      showGrid: !editor.state.documentSettings.showGrid,
                    })
                  }
                  aria-label="Bật tắt lưới"
                  aria-pressed={editor.state.documentSettings.showGrid}
                >
                  <Grid3X3 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Lưới</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={`size-8 ${
                    editor.state.documentSettings.showGuides
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : ""
                  }`}
                  onClick={() =>
                    editor.updateDocumentSettings({
                      showGuides: !editor.state.documentSettings.showGuides,
                    })
                  }
                  aria-label="Bật tắt đường căn"
                  aria-pressed={editor.state.documentSettings.showGuides}
                >
                  <ScanLine className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Đường căn</TooltipContent>
            </Tooltip>
            </ToolbarGroup>
          )}

          <ToolbarDivider />

          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("left")}
                >
                  <AlignStartVertical className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Căn trái</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("center")}
                >
                  <AlignCenterVertical className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Căn giữa ngang</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("right")}
                >
                  <AlignEndVertical className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Căn phải</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("top")}
                >
                  <AlignStartHorizontal className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Căn trên</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("middle")}
                >
                  <AlignCenterHorizontal className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Căn giữa dọc</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => alignSelectionFromToolbar("bottom")}
                >
                  <AlignEndHorizontal className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Căn dưới</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.distributeSelection("horizontal")}
                >
                  <AlignHorizontalSpaceBetween className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dàn đều ngang</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.distributeSelection("vertical")}
                >
                  <AlignVerticalSpaceBetween className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dàn đều dọc</TooltipContent>
            </Tooltip>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.groupSelection()}
                  disabled={selected.length < 2}
                >
                  <Group className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nhóm · Ctrl+G</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => editor.ungroupSelection()}
                  disabled={!selected.some((e) => e.kind === "group")}
                >
                  <Ungroup className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bỏ nhóm · Ctrl+Shift+G</TooltipContent>
            </Tooltip>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={!primary}
                  onClick={() => editor.copySelection()}
                >
                  <Copy className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sao chÃ©p</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={!primary}
                  onClick={() => editor.duplicateSelection()}
                >
                  <ClipboardPaste className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nhân bản</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={primary?.hidden ? "default" : "ghost"}
                  className="size-8"
                  disabled={!primary}
                  onClick={() =>
                    primary && updatePrimaryElementWithDescendants({ hidden: !primary.hidden })
                  }
                >
                  {primary?.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{primary?.hidden ? "Hiện" : "Ẩn"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={primary?.locked ? "default" : "ghost"}
                  className="size-8"
                  disabled={!primary}
                  onClick={() =>
                    primary && updatePrimaryElementWithDescendants({ locked: !primary.locked })
                  }
                >
                  {primary?.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{primary?.locked ? "Mở khóa" : "Khóa"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:text-destructive"
                  disabled={!primary}
                  onClick={() => editor.deleteSelection()}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Xóa</TooltipContent>
            </Tooltip>
          </ToolbarGroup>

          <ToolbarDivider />

          <ToolbarGroup>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2">
                  <Settings2 className="size-4" />
                  Trang
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-[70vh] w-80 overflow-y-auto p-3">
                <div className="flex flex-col gap-3">
                  <InspectorSection
                    title="Trang"
                    action={
                      <Button
                        size="sm"
                        variant={editor.state.documentSettings.snapToGrid ? "default" : "outline"}
                        className="h-7 gap-1.5 px-2 text-[11px]"
                        onClick={() =>
                          editor.updateDocumentSettings({
                            snapToGrid: !editor.state.documentSettings.snapToGrid,
                          })
                        }
                      >
                        <Grid2X2 className="size-3.5" />
                        Hút lưới {editor.state.documentSettings.snapToGrid ? "Bật" : "Tắt"}
                      </Button>
                    }
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField
                        label="W"
                        value={activePage.width}
                        onChange={(value) => editor.updatePage(activePage.pageId, { width: value })}
                      />
                      <NumberField
                        label="H"
                        value={activePage.height}
                        onChange={(value) =>
                          editor.updatePage(activePage.pageId, { height: value })
                        }
                      />
                    </div>
                    <CompactColorControl
                      brandColors={brandKitColors}
                      label="Nền"
                      value={activePage.background ?? "#ffffff"}
                      onChange={(color) =>
                        updatePagePreview(activePage.pageId, { background: color })
                      }
                      onCommit={(color) =>
                        commitPagePatch(activePage.pageId, { background: color })
                      }
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant={editor.state.documentSettings.showSafeZone ? "default" : "outline"}
                        onClick={toggleSafeZone}
                      >
                        Vùng an toàn
                      </Button>
                      <Button
                        size="sm"
                        variant={editor.state.documentSettings.showGrid ? "default" : "outline"}
                        onClick={() =>
                          editor.updateDocumentSettings({
                            showGrid: !editor.state.documentSettings.showGrid,
                          })
                        }
                      >
                        Lưới
                      </Button>
                      <Button
                        size="sm"
                        variant={editor.state.documentSettings.showGuides ? "default" : "outline"}
                        onClick={() =>
                          editor.updateDocumentSettings({
                            showGuides: !editor.state.documentSettings.showGuides,
                          })
                        }
                      >
                        Đường căn
                      </Button>
                    </div>
                  </InspectorSection>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant={primary ? "ghost" : "outline"}
                  className="h-8 gap-1.5 px-2"
                  disabled={!primary}
                >
                  <SlidersHorizontal className="size-4" />
                  Đối tượng
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-[70vh] w-96 overflow-y-auto p-3">
                {primary ? (
                  <div className="flex flex-col gap-3">
                    <InspectorSection
                      title="Đối tượng"
                      action={
                        <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                          {selected.length > 1 ? `${selected.length} mục` : primary.kind}
                        </span>
                      }
                    >
                      <div className="flex flex-col gap-2">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          Tên layer
                        </Label>
                        <Input
                          value={primary.name ?? ""}
                          onChange={(event) => updatePrimaryElement({ name: event.target.value })}
                          placeholder="Tên layer"
                          className="h-8"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <NumberField
                          label="X"
                          value={primary.x}
                          onChange={(value) =>
                            editor.updateSelectedElements({ x: value }, { history: false })
                          }
                        />
                        <NumberField
                          label="Y"
                          value={primary.y}
                          onChange={(value) =>
                            editor.updateSelectedElements({ y: value }, { history: false })
                          }
                        />
                        <NumberField
                          label="W"
                          value={primary.width}
                          onChange={(value) =>
                            editor.updateSelectedElements({ width: value }, { history: false })
                          }
                        />
                        <NumberField
                          label="H"
                          value={primary.height}
                          onChange={(value) =>
                            editor.updateSelectedElements({ height: value }, { history: false })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                        <NumberField
                          label="Xoay"
                          value={primary.rotation ?? 0}
                          suffix="°"
                          onChange={(value) =>
                            editor.updateSelectedElements({ rotation: value }, { history: false })
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-10 px-0"
                          onClick={() =>
                            editor.updateSelectedElements(
                              { rotation: (primary.rotation ?? 0) - 15 },
                              { history: false },
                            )
                          }
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-10 px-0"
                          onClick={() =>
                            editor.updateSelectedElements(
                              { rotation: (primary.rotation ?? 0) + 15 },
                              { history: false },
                            )
                          }
                        >
                          <RotateCw className="size-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => editor.copySelection()}
                        >
                          <Copy className="mr-2 size-4" /> Sao chép
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => editor.duplicateSelection()}
                        >
                          <Layers className="mr-2 size-4" /> Nhân bản
                        </Button>
                        <Button
                          size="sm"
                          variant={primary.hidden ? "default" : "outline"}
                          onClick={() =>
                            updatePrimaryElementWithDescendants({ hidden: !primary.hidden })
                          }
                        >
                          {primary.hidden ? "Hiện" : "Ẩn"}
                        </Button>
                        <Button
                          size="sm"
                          variant={primary.locked ? "default" : "outline"}
                          onClick={() =>
                            updatePrimaryElementWithDescendants({ locked: !primary.locked })
                          }
                        >
                          {primary.locked ? "Mở khóa" : "Khóa"}
                        </Button>
                      </div>
                    </InspectorSection>

                    <InspectorSection title="Thứ tự">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="justify-start"
                          onClick={() => editor.orderSelection("front")}
                        >
                          Lên cùng
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="justify-start"
                          onClick={() => editor.orderSelection("forward")}
                        >
                          Lên 1 lớp
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="justify-start"
                          onClick={() => editor.orderSelection("backward")}
                        >
                          Xuống 1 lớp
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="justify-start"
                          onClick={() => editor.orderSelection("back")}
                        >
                          Xuống cùng
                        </Button>
                      </div>
                    </InspectorSection>

                    {primary.kind === "text" ? (
                      <InspectorSection title="Chữ">
                        <textarea
                          value={primary.text}
                          onChange={(event) =>
                            updatePrimaryElement({
                              text: event.target.value,
                            } as Partial<DesignElement>)
                          }
                          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        />
                        <CompactColorControl
                      brandColors={brandKitColors}
                          label="Màu chữ"
                          value={primary.style?.color ?? "#0f172a"}
                          onChange={(color) => updatePrimaryStyle({ color })}
                          onCommit={(color) => commitPrimaryStyle({ color })}
                        />
                        <LetterSpacingControl
                          value={Number(primary.style?.letterSpacing ?? 0)}
                          onChange={(value) => updatePrimaryStyle({ letterSpacing: value })}
                        />
                      </InspectorSection>
                    ) : null}

                    {primary.kind === "image" || primary.kind === "shape" ? (
                      <InspectorSection title="Hiển thị">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Bo góc</Label>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {primary.style?.borderRadius ?? 0}px
                            </span>
                          </div>
                          <Slider
                            value={[Number(primary.style?.borderRadius ?? 0)]}
                            min={0}
                            max={160}
                            step={2}
                            onValueChange={([value]) => updatePrimaryStyle({ borderRadius: value })}
                          />
                        </div>
                        {primary.kind === "shape" ? (
                          <CompactColorControl
                      brandColors={brandKitColors}
                            label="Màu nền"
                            value={primary.style?.fill ?? "#f97316"}
                            onChange={(color) => updatePrimaryStyle({ fill: color })}
                            onCommit={(color) => commitPrimaryStyle({ fill: color })}
                          />
                        ) : null}
                        {primary.kind === "image" ? (
                          <>
                            <div className="flex flex-col gap-2">
                              <Label className="text-xs">Cách khớp</Label>
                              <Select
                                value={primary.style?.fit ?? "cover"}
                                onValueChange={(value) =>
                                  updatePrimaryStyle({
                                    fit: value as "cover" | "contain" | "stretch",
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="cover">Phủ kín</SelectItem>
                                  <SelectItem value="contain">Vừa khung</SelectItem>
                                  <SelectItem value="stretch">Kéo giãn</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {(
                                [
                                  ["Độ sáng", "brightness", 0, 200, 100],
                                  ["Tương phản", "contrast", 0, 200, 100],
                                  ["Độ bão hòa", "saturate", 0, 200, 100],
                                  ["Làm mờ", "blur", 0, 20, 0],
                                ] as const
                              ).map(([label, key, min, max, fallback]) => {
                                const raw = Number(
                                  primary.style?.[key] ?? (key === "blur" ? 0 : 1),
                                );
                                const value = key === "blur" ? raw : raw * 100;
                                return (
                                  <div key={key} className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-xs">{label}</Label>
                                      <span className="text-[10px] tabular-nums text-muted-foreground">
                                        {Math.round(value)}
                                        {key === "blur" ? "px" : "%"}
                                      </span>
                                    </div>
                                    <Slider
                                      value={[Number.isFinite(value) ? value : fallback]}
                                      min={min}
                                      max={max}
                                      step={key === "blur" ? 0.5 : 5}
                                      onValueChange={([next]) =>
                                        updatePrimaryStyle({
                                          [key]: key === "blur" ? next : next / 100,
                                        } as Partial<ElementStyle>)
                                      }
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : null}
                      </InspectorSection>
                    ) : null}

                    {primary.kind === "shape" || primary.kind === "text" ? (
                      <InspectorSection
                        title="Màu chuyển"
                        action={
                          <Button
                            size="sm"
                            variant={primary.style?.gradientEnabled ? "default" : "outline"}
                            onClick={() =>
                              updatePrimaryStyle({
                                gradientEnabled: !primary.style?.gradientEnabled,
                                gradientFrom: primary.style?.gradientFrom ?? "#f97316",
                                gradientTo: primary.style?.gradientTo ?? "#ec4899",
                                gradientAngle: primary.style?.gradientAngle ?? 90,
                              })
                            }
                          >
                            {primary.style?.gradientEnabled ? "Bật" : "Tắt"}
                          </Button>
                        }
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <CompactColorControl
                      brandColors={brandKitColors}
                            label="Từ"
                            value={primary.style?.gradientFrom ?? "#f97316"}
                            onChange={(color) =>
                              updatePrimaryStyle({
                                gradientEnabled: true,
                                gradientFrom: color,
                                gradientTo: primary.style?.gradientTo ?? "#ec4899",
                              })
                            }
                            onCommit={(color) =>
                              commitPrimaryStyle({
                                gradientEnabled: true,
                                gradientFrom: color,
                                gradientTo: primary.style?.gradientTo ?? "#ec4899",
                              })
                            }
                          />
                          <CompactColorControl
                      brandColors={brandKitColors}
                            label="Đến"
                            value={primary.style?.gradientTo ?? "#ec4899"}
                            onChange={(color) =>
                              updatePrimaryStyle({
                                gradientEnabled: true,
                                gradientFrom: primary.style?.gradientFrom ?? "#f97316",
                                gradientTo: color,
                              })
                            }
                            onCommit={(color) =>
                              commitPrimaryStyle({
                                gradientEnabled: true,
                                gradientFrom: primary.style?.gradientFrom ?? "#f97316",
                                gradientTo: color,
                              })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Góc</Label>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {primary.style?.gradientAngle ?? 90}°
                            </span>
                          </div>
                          <Slider
                            value={[primary.style?.gradientAngle ?? 90]}
                            min={0}
                            max={360}
                            step={15}
                            onValueChange={([value]) =>
                              updatePrimaryStyle({
                                gradientEnabled: true,
                                gradientAngle: value,
                                gradientFrom: primary.style?.gradientFrom ?? "#f97316",
                                gradientTo: primary.style?.gradientTo ?? "#ec4899",
                              })
                            }
                          />
                        </div>
                      </InspectorSection>
                    ) : null}

                    <InspectorSection
                      title="Đổ bóng"
                      action={
                        <Button
                          size="sm"
                          variant={primary.style?.shadowColor ? "default" : "outline"}
                          onClick={() =>
                            updatePrimaryStyle({
                              shadowColor: primary.style?.shadowColor ? undefined : "#000000",
                              shadowBlur: primary.style?.shadowBlur ?? 8,
                              shadowX: primary.style?.shadowX ?? 0,
                              shadowY: primary.style?.shadowY ?? 4,
                            })
                          }
                        >
                          {primary.style?.shadowColor ? "Bật" : "Tắt"}
                        </Button>
                      }
                    >
                      <CompactColorControl
                      brandColors={brandKitColors}
                        label="Màu"
                        value={primary.style?.shadowColor ?? "#000000"}
                        onChange={(color) =>
                          updatePrimaryStyle({
                            shadowColor: color,
                            shadowBlur: primary.style?.shadowBlur ?? 8,
                            shadowX: primary.style?.shadowX ?? 0,
                            shadowY: primary.style?.shadowY ?? 4,
                          })
                        }
                        onCommit={(color) =>
                          commitPrimaryStyle({
                            shadowColor: color,
                            shadowBlur: primary.style?.shadowBlur ?? 8,
                            shadowX: primary.style?.shadowX ?? 0,
                            shadowY: primary.style?.shadowY ?? 4,
                          })
                        }
                      />
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Mờ</Label>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {primary.style?.shadowBlur ?? 8}px
                          </span>
                        </div>
                        <Slider
                          value={[primary.style?.shadowBlur ?? 8]}
                          min={0}
                          max={40}
                          step={1}
                          onValueChange={([value]) =>
                            updatePrimaryStyle({
                              shadowColor: primary.style?.shadowColor ?? "#000000",
                              shadowBlur: value,
                            })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <NumberField
                          label="X"
                          value={primary.style?.shadowX ?? 0}
                          onChange={(value) =>
                            updatePrimaryStyle({
                              shadowColor: primary.style?.shadowColor ?? "#000000",
                              shadowX: value,
                            })
                          }
                        />
                        <NumberField
                          label="Y"
                          value={primary.style?.shadowY ?? 4}
                          onChange={(value) =>
                            updatePrimaryStyle({
                              shadowColor: primary.style?.shadowColor ?? "#000000",
                              shadowY: value,
                            })
                          }
                        />
                      </div>
                    </InspectorSection>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
          </ToolbarGroup>

          {headerLeading ? null : renderWorkspaceActions("ml-auto")}
        </div>

        <div
          className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
          style={{
            gridTemplateColumns: `${leftOpen ? "72px 280px" : "72px"} minmax(0,1fr) ${rightOpen ? 340 : 0}px`,
          }}
        >
          {/* Canva-style vertical rail */}
          <aside className="flex min-h-0 shrink-0 flex-col items-stretch gap-1 border-r bg-card py-3">
            {([
              { id: "insert", label: "Thêm", Icon: Shapes },
              { id: "assets", label: "Tài nguyên", Icon: ImageIcon },
              { id: "pages", label: "Trang", Icon: Layers },
            ] as const).map(({ id, label, Icon }) => {
              const active = leftOpen && leftTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setLeftOpen(false);
                    } else {
                      setLeftTab(id);
                      setLeftOpen(true);
                    }
                  }}
                  className={cn(
                    "group mx-2 flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={label}
                  aria-pressed={active}
                >
                  <Icon className="size-5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </aside>
          {leftOpen ? (
            <aside className="min-h-0 min-w-0 overflow-hidden border-r">
              <Tabs value={leftTab} onValueChange={setLeftTab} className="flex h-full flex-col">
                <TabsList className="sr-only">
                  <TabsTrigger value="insert">Thêm</TabsTrigger>
                  <TabsTrigger value="assets">Tài nguyên</TabsTrigger>
                  <TabsTrigger value="pages">Trang</TabsTrigger>
                </TabsList>
                <TabsContent value="insert" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-2 pt-4">
                    <Button className="w-full justify-start" variant="outline" onClick={insertText}>
                      <Type className="mr-2 size-4" /> Chữ
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={insertImageFrame}
                    >
                      <ImageIcon className="mr-2 size-4" /> Ảnh
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => insertShape("rectangle")}
                    >
                      <Shapes className="mr-2 size-4" /> Chữ nhật
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => insertShape("circle")}
                    >
                      <Shapes className="mr-2 size-4" /> Tròn
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => insertShape("line")}
                    >
                      <Minus className="mr-2 size-4" /> Đường
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={insertTable}
                    >
                      <Table2 className="mr-2 size-4" /> Bảng
                    </Button>
                    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs uppercase text-muted-foreground">
                          Biểu tượng
                        </Label>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {extendedIconsLoading ? "..." : filteredIconAssets.length}
                        </span>
                      </div>
                      <Input
                        value={iconSearch}
                        onChange={(event) => setIconSearch(event.target.value)}
                        placeholder="Tìm biểu tượng: địa điểm, ghim, điện thoại, cafe..."
                      />
                      <ToggleGroup
                        type="single"
                        value={iconVariantFilter}
                        onValueChange={(value) => {
                          if (value) setIconVariantFilter(value as IconVariantFilter);
                        }}
                        variant="outline"
                        size="sm"
                        className="grid grid-cols-4"
                      >
                        <ToggleGroupItem value="all" aria-label="Tất cả biểu tượng">
                          Tất cả
                        </ToggleGroupItem>
                        <ToggleGroupItem value="line" aria-label="Biểu tượng nét">
                          Nét
                        </ToggleGroupItem>
                        <ToggleGroupItem value="solid" aria-label="Biểu tượng đặc">
                          Đặc
                        </ToggleGroupItem>
                        <ToggleGroupItem value="color" aria-label="Biểu tượng màu">
                          Màu
                        </ToggleGroupItem>
                      </ToggleGroup>
                      {extendedIconsLoading ? (
                        <div className="text-xs text-muted-foreground">
                          Đang tải thêm biểu tượng kiểu Canva...
                        </div>
                      ) : null}
                      {iconResultsAreLimited ? (
                        <div className="text-xs text-muted-foreground">
                          Đang hiển thị {visibleIconAssets.length} biểu tượng đầu tiên. Gõ từ khóa
                          để lọc nhanh hơn.
                        </div>
                      ) : null}
                      <ScrollArea className="h-64 rounded-lg border bg-background p-2">
                        {visibleIconAssets.length > 0 ? (
                          <div className="grid grid-cols-6 gap-1.5 pr-2">
                            {visibleIconAssets.map((asset) => (
                              <button
                                key={asset.assetId}
                                type="button"
                                onClick={() => {
                                  setSelectedIconId(asset.assetId);
                                  insertAsset(asset);
                                }}
                                className={
                                  "flex aspect-square items-center justify-center rounded-md border bg-card transition " +
                                  (asset.assetId === selectedIconId
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "hover:border-primary/50 hover:bg-muted")
                                }
                                title={asset.name}
                                aria-label={`Thêm ${asset.name}`}
                              >
                                <IconAssetGlyph asset={asset} className="block size-5" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                            Không có icon phù hợp.
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="assets" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-3 pt-4">
                    <div className="flex gap-2">
                      <Input
                        value={assetSearch}
                        onChange={(event) => setAssetSearch(event.target.value)}
                        placeholder="Gõ 'home', 'location', 'food'... để tìm biểu tượng và ảnh"
                      />
                      <Button
                        variant="outline"
                        onClick={() => uploadAsset("image")}
                        title="Tải ảnh lên"
                      >
                        <Upload className="size-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Tìm biểu tượng có sẵn hoặc ảnh bạn đã tải lên.
                    </div>

                    {/* Icon search results inline (Canva-style) */}
                    {assetSearch.trim().length > 0
                      ? (() => {
                          const query = normalizeIconSearch(assetSearch.trim());
                          const matched = iconAssets.filter((asset) => {
                            const haystack =
                              asset.searchText ??
                              normalizeIconSearch([asset.name, ...(asset.tags ?? [])].join(" "));
                            return haystack.includes(query);
                          });
                          const visible = matched.slice(0, 36);
                          if (visible.length === 0) return null;
                          return (
                            <div className="rounded-xl border bg-card p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="text-xs font-semibold uppercase text-muted-foreground">
                                  Biểu tượng phù hợp
                                </div>
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  {matched.length > visible.length
                                    ? `${visible.length}/${matched.length}`
                                    : matched.length}
                                </span>
                              </div>
                              <div className="grid grid-cols-6 gap-1.5">
                                {visible.map((asset) => (
                                  <button
                                    key={asset.assetId}
                                    type="button"
                                    className="flex aspect-square items-center justify-center rounded-md border bg-background transition hover:border-primary/50 hover:bg-muted"
                                    title={asset.name}
                                    aria-label={`Thêm ${asset.name}`}
                                    onClick={() => {
                                      setSelectedIconId(asset.assetId);
                                      insertAsset(asset);
                                    }}
                                  >
                                    <IconAssetGlyph asset={asset} className="block size-5" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()
                      : null}

                    {/* Symbols library */}
                    <div className="rounded-xl border bg-card p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Symbols</div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => saveSelectionAsSymbol()}
                          disabled={editor.selectedElements.length === 0}
                          title="Lưu phần đang chọn thành symbol để tái sử dụng"
                        >
                          <Plus className="mr-1 size-3" />
                          Lưu selection
                        </Button>
                      </div>
                      {symbols.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          <Input
                            value={symbolSearch}
                            onChange={(event) => setSymbolSearch(event.target.value)}
                            placeholder="Tìm symbol theo tên hoặc tag"
                            className="h-7 text-xs"
                          />
                          {symbolTagOptions.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => setSymbolTagFilter(null)}
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                                  symbolTagFilter == null
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/60",
                                )}
                              >
                                Tất cả
                              </button>
                              {symbolTagOptions.map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() =>
                                    setSymbolTagFilter(symbolTagFilter === tag ? null : tag)
                                  }
                                  className={cn(
                                    "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                                    symbolTagFilter === tag
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:border-primary/60",
                                  )}
                                >
                                  #{tag}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {symbols.length === 0 ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Chưa có symbol. Chọn nhóm phần tử rồi bấm "Lưu selection" để tái sử dụng trên nhiều trang.
                        </div>
                      ) : filteredSymbols.length === 0 ? (
                        <div className="mt-2 rounded border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">
                          Không có symbol khớp "{symbolSearch}"
                          {symbolTagFilter ? ` + #${symbolTagFilter}` : ""}
                        </div>
                      ) : (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {filteredSymbols.map((symbol) => (
                            <div
                              key={symbol.symbolId}
                              className="group relative rounded-lg border bg-background p-2 transition hover:border-primary"
                            >
                              <button
                                type="button"
                                onClick={() => insertSymbolInstance(symbol)}
                                className="flex w-full flex-col items-start text-left"
                                title={`Thêm symbol "${symbol.name}"`}
                              >
                                <div
                                  className="mb-1 flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-muted/50 text-[10px] text-muted-foreground"
                                  style={
                                    symbol.thumbnail
                                      ? {
                                          backgroundImage: `url(${symbol.thumbnail})`,
                                          backgroundSize: "contain",
                                          backgroundRepeat: "no-repeat",
                                          backgroundPosition: "center",
                                        }
                                      : undefined
                                  }
                                >
                                  {!symbol.thumbnail
                                    ? `${Math.round(symbol.width)}×${Math.round(symbol.height)}`
                                    : null}
                                </div>
                                <div className="truncate text-xs font-medium">
                                  {symbol.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  v{symbol.version} · {symbol.elements.length} phần tử
                                </div>
                                {symbol.tags && symbol.tags.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap gap-0.5">
                                    {symbol.tags.slice(0, 3).map((tag) => (
                                      <span
                                        key={tag}
                                        className="rounded bg-muted px-1 text-[9px] text-muted-foreground"
                                      >
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </button>
                              <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void editSymbolTags(symbol);
                                  }}
                                  className="rounded border bg-background p-0.5 text-muted-foreground hover:border-primary hover:text-primary"
                                  title="Sửa tag"
                                >
                                  <span className="text-[9px]">#</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void removeSymbol(symbol);
                                  }}
                                  className="rounded border bg-background p-0.5 text-muted-foreground hover:border-destructive hover:text-destructive"
                                  title={`Xoá symbol "${symbol.name}"`}
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const instances = findSymbolInstances(editor.activeElements);
                        if (instances.length === 0) return null;
                        const outdated = instances
                          .map((inst) => {
                            const meta = inst.meta as Record<string, unknown> | undefined;
                            const symbolId = meta?.symbolId as string | undefined;
                            const symbol = symbols.find((s) => s.symbolId === symbolId);
                            return { inst, symbol };
                          })
                          .filter(({ inst, symbol }) =>
                            isInstanceOutdated(inst, symbol),
                          );
                        if (outdated.length === 0) return null;
                        return (
                          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs dark:bg-amber-950/40">
                            <div className="font-semibold text-amber-900 dark:text-amber-200">
                              {outdated.length} instance chưa đồng bộ
                            </div>
                            <div className="mt-1 space-y-1">
                              {outdated.map(({ inst, symbol }) =>
                                symbol ? (
                                  <button
                                    key={inst.elementId}
                                    type="button"
                                    onClick={() => void syncInstanceWithLatest(inst, symbol)}
                                    className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                  >
                                    <span className="truncate">
                                      {inst.name ?? symbol.name}
                                    </span>
                                    <span className="text-[10px] text-amber-700 dark:text-amber-300">
                                      → v{symbol.version}
                                    </span>
                                  </button>
                                ) : null,
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {libraryAssets.length === 0 ? (
                      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                        Chưa có asset nào được tải lên.
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                      {libraryAssets.map((asset) => (
                        <div
                          key={asset.assetId}
                          className="relative rounded-xl border bg-card p-3 transition hover:border-primary hover:shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => insertAsset(asset)}
                            className="w-full text-left"
                          >
                            <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-muted/50">
                              {isHeroiconAsset(asset) ? (
                                <IconAssetGlyph
                                  asset={asset}
                                  className="block size-12 text-foreground"
                                />
                              ) : asset.kind === "image" || asset.kind === "logo" ? (
                                <ImageIcon className="size-8 text-muted-foreground" />
                              ) : (
                                <div
                                  className="size-12 text-foreground"
                                  dangerouslySetInnerHTML={{ __html: asset.sourceValue }}
                                />
                              )}
                            </div>
                            <div className="pr-8 text-sm font-medium">{asset.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {isHeroiconAsset(asset) ? asset.provider : asset.kind}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteAsset(asset);
                            }}
                            className="absolute right-2 top-2 rounded-md border bg-background p-1 text-muted-foreground transition hover:border-destructive hover:text-destructive"
                            title={`Xoá ${asset.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="pages" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="space-y-3 pt-4">
                    {allowMultiplePages && !hasPackPages ? (
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => editor.addPage()}
                      >
                        <Plus className="mr-2 size-4" /> Thêm trang
                      </Button>
                    ) : null}
                    {hasPackPages && onCreatePackPage ? (
                      <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => void onCreatePackPage()}
                      >
                        <Plus className="mr-2 size-4" /> Thêm trang mới
                      </Button>
                    ) : null}
                    {hasPackPages
                      ? packPages.map((pageTemplate, index) => {
                          const selectedPage =
                            activeTemplateId === pageTemplate.pageTemplateId ||
                            editor.document.sourcePageTemplateId === pageTemplate.pageTemplateId;
                          const previewScale = Math.min(
                            72 / pageTemplate.canvas.width,
                            90 / pageTemplate.canvas.height,
                          );
                          return (
                            <div
                              key={pageTemplate.pageTemplateId}
                              draggable={!!onReorderPackPage}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", pageTemplate.pageTemplateId);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                e.currentTarget.classList.add("ring-2", "ring-primary/50");
                              }}
                              onDragLeave={(e) => {
                                e.currentTarget.classList.remove("ring-2", "ring-primary/50");
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove("ring-2", "ring-primary/50");
                                const fromId = e.dataTransfer.getData("text/plain");
                                if (fromId && fromId !== pageTemplate.pageTemplateId) {
                                  onReorderPackPage?.(fromId, index);
                                }
                              }}
                              className={`rounded-xl border p-3 transition cursor-grab active:cursor-grabbing ${
                                selectedPage
                                  ? "border-primary bg-primary/5"
                                  : "bg-card hover:border-primary/60 hover:bg-muted/40"
                              }`}
                            >
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 text-left"
                                onClick={() => {
                                  if (selectedPage) return;
                                  onOpenTemplatePage?.(pageTemplate.pageTemplateId);
                                }}
                              >
                                <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                                  {index + 1}
                                </div>
                                <div className="shrink-0 overflow-hidden rounded-md border bg-background shadow-sm">
                                  <PageRenderer
                                    template={pageTemplate}
                                    entities={[]}
                                    assets={[]}
                                    scale={previewScale}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold">
                                    {packPageLabel(index)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {pageTemplate.canvas.width} x {pageTemplate.canvas.height}
                                  </div>
                                </div>
                              </button>
                              {(onDuplicatePackPage || onDeletePackPage) && (
                                <div className="mt-2 flex gap-1">
                                  {onDuplicatePackPage ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 flex-1 text-xs"
                                      onClick={() =>
                                        void onDuplicatePackPage(pageTemplate.pageTemplateId)
                                      }
                                      title="Nhân bản trang này vào bộ"
                                    >
                                      <Copy className="mr-1 size-3" /> Nhân bản
                                    </Button>
                                  ) : null}
                                  {onDeletePackPage ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10"
                                      onClick={() =>
                                        void onDeletePackPage(pageTemplate.pageTemplateId)
                                      }
                                      disabled={packPages.length <= 1}
                                      title={
                                        packPages.length <= 1
                                          ? "Không thể xóa trang cuối cùng"
                                          : "Xóa trang khỏi bộ"
                                      }
                                    >
                                      <Trash2 className="mr-1 size-3" /> Xóa
                                    </Button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          );
                        })
                      : editor.state.pageOrder.map((pageId, index) => {
                          const page = editor.state.pagesById[pageId];
                          const selectedPage = editor.state.activePageId === pageId;
                          return (
                            <div
                              key={pageId}
                              className={`rounded-xl border p-3 ${selectedPage ? "border-primary bg-primary/5" : ""}`}
                            >
                              <button
                                className="w-full text-left"
                                onClick={() => editor.setActivePage(pageId)}
                              >
                                <div className="text-sm font-semibold">{page.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {page.width} × {page.height}
                                </div>
                              </button>
                              <div className="mt-3 flex gap-2">
                                {allowMultiplePages ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => editor.movePage(pageId, -1)}
                                      disabled={index === 0}
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => editor.movePage(pageId, 1)}
                                      disabled={index === editor.state.pageOrder.length - 1}
                                    >
                                      ↓
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={editor.duplicateActivePage}
                                      disabled={!selectedPage}
                                    >
                                      Sao chép
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => editor.removePage(pageId)}
                                      disabled={editor.state.pageOrder.length <= 1}
                                    >
                                      Xóa
                                    </Button>
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
                                    Chế độ một trang
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                  </div>
                </TabsContent>
              </Tabs>
            </aside>
          ) : null}

          <div
            ref={stageWrapRef}
            className="design-stage-scroll min-h-0 min-w-0 overflow-auto px-8 pb-12 pt-24"
            onPointerDown={handleStageWrapPointerDown}
            onMouseMove={handleStageWrapMouseMove}
            onDragOver={(event) => {
              if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
              event.preventDefault();
              if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={async (event) => {
              const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
                file.type.startsWith("image/"),
              );
              if (files.length === 0) return;
              event.preventDefault();
              const canvasEl = getDesignCanvasElement(stageWrapRef.current);
              const point = getCanvasPoint(
                canvasEl,
                zoom,
                event.clientX,
                event.clientY,
                0,
                0,
              );
              for (let i = 0; i < files.length; i++) {
                await importImageFile(files[i], {
                  position: {
                    x: point.x - 160 + i * 24,
                    y: point.y - 160 + i * 24,
                  },
                });
              }
              toast.success(
                files.length === 1 ? "Đã thêm 1 ảnh" : `Đã thêm ${files.length} ảnh`,
              );
            }}
          >
            <div
              ref={stagePanLayerRef}
              className="design-stage-center flex min-h-full w-max min-w-full"
              style={{
                transform: `translate(${editor.state.viewport.panX}px, ${editor.state.viewport.panY}px)`,
                transformOrigin: "top left",
                cursor: stageCursor,
              }}
            >
              <div className="relative">
                {editor.state.documentSettings.showGuides ? (
                  <CanvasRuler
                    pageWidth={activePage.width}
                    pageHeight={activePage.height}
                    scale={zoom}
                    guides={activePage.guides ?? []}
                    onAddGuide={(axis, value) => {
                      const guides = [
                        ...(activePage.guides ?? []),
                        { guideId: nanoid(), axis, value },
                      ];
                      editor.updatePage(activePage.pageId, { guides });
                    }}
                    onRemoveGuide={(guideId) => {
                      const guides = (activePage.guides ?? []).filter((g) => g.guideId !== guideId);
                      editor.updatePage(activePage.pageId, { guides });
                    }}
                  />
                ) : null}
                <DesignStage
                  page={activePage}
                  elements={editor.activeElements}
                  scale={zoom}
                  tool={tool}
                  spacePressed={spacePressed}
                  marqueeRect={marqueeRect}
                  selectedIds={editor.state.selection.ids}
                  primaryId={editor.state.selection.primaryId}
                  snapLines={editor.state.viewport.snapLines}
                  snapTargetIds={snapTargetIds}
                  showSafeZone={editor.state.documentSettings.showSafeZone}
                  showGrid={editor.state.documentSettings.showGrid}
                  showGuides={editor.state.documentSettings.showGuides}
                  snapToGrid={editor.state.documentSettings.snapToGrid}
                  gridSize={editor.state.documentSettings.gridSize}
                  renderCanvasContextMenu={renderCanvasContextMenu}
                  renderElementContextMenu={renderElementContextMenu}
                  editingTextId={editingTextId}
                  editingTextValue={editingTextValue}
                  onEditingTextValueChange={setEditingTextValue}
                  onStartTextEdit={startInlineTextEdit}
                  onCommitTextEdit={commitInlineTextEdit}
                  onCancelTextEdit={cancelInlineTextEdit}
                  onStagePointerDown={handleStageBackgroundPointerDown}
                  onSelect={(elementId, additive) => {
                    if (!elementId) {
                      editor.setSelection([]);
                      return;
                    }
                    const existing = editor.state.selection.ids;
                    if (additive) {
                      if (existing.includes(elementId)) {
                        const nextIds = existing.filter((id) => id !== elementId);
                        editor.setSelection(nextIds, nextIds.at(-1) ?? null);
                      } else {
                        editor.setSelection([...existing, elementId], elementId);
                      }
                      return;
                    }
                    editor.setSelection([elementId], elementId);
                  }}
                  onMove={({ elementId, moveIds, originById, nextPrimaryX, nextPrimaryY }) => {
                    beginElementTransform();
                    const primaryTarget =
                      editor.activeElements.find((item) => item.elementId === elementId) ?? null;
                    const primaryOrigin = originById[elementId];
                    if (!primaryTarget || !primaryOrigin) return;
                    if (editor.state.documentSettings.snapToGrid) {
                      const grid = editor.state.documentSettings.gridSize;
                      nextPrimaryX = Math.round(nextPrimaryX / grid) * grid;
                      nextPrimaryY = Math.round(nextPrimaryY / grid) * grid;
                    }
                    const snapped = snapMove(
                      activePage,
                      primaryTarget,
                      nextPrimaryX,
                      nextPrimaryY,
                      editor.activeElements.filter(
                        (element) => !moveIds.includes(element.elementId),
                      ),
                      zoom,
                    );
                    const appliedDx = snapped.x - primaryOrigin.x;
                    const appliedDy = snapped.y - primaryOrigin.y;
                    editor.setSnapLines(snapped.snapLines);
                    setSnapTargetIds(snapped.snapTargetIds);
                    // Smart spacing
                    const movedEl = { ...primaryTarget, x: snapped.x, y: snapped.y };
                    const others = editor.activeElements.filter(
                      (e) => !moveIds.includes(e.elementId) && !e.hidden,
                    );
                    setSpacingLines(computeSpacingLines(movedEl, others));
                    editor.updateElements(moveIds, (element) => ({
                      x: (originById[element.elementId]?.x ?? element.x) + appliedDx,
                      y: (originById[element.elementId]?.y ?? element.y) + appliedDy,
                    }));
                  }}
                  onMoveCommit={() => {
                    endElementTransform();
                    editor.setSnapLines([]);
                    setSnapTargetIds([]);
                    setSpacingLines([]);
                  }}
                  onResize={({ elementId, patch, snapLines, snapTargetIds }) => {
                    beginElementTransform();
                    editor.updateElements([elementId], patch);
                    editor.setSnapLines(snapLines ?? []);
                    setSnapTargetIds(snapTargetIds ?? []);
                  }}
                  onResizeMany={(payloads) => {
                    beginElementTransform();
                    if (payloads.length === 0) return;
                    const patchById = new Map(
                      payloads.map((payload) => [payload.elementId, payload.patch]),
                    );
                    editor.updateElements(
                      payloads.map((payload) => payload.elementId),
                      (element) => patchById.get(element.elementId) ?? {},
                    );
                  }}
                  onResizeCommit={() => {
                    endElementTransform();
                    editor.setSnapLines([]);
                    setSnapTargetIds([]);
                  }}
                  availableFontFamilies={availableFontFamilies}
                  onUpdateElementStyle={updateElementStyle}
                  onUpdateElement={(elementId, patch) =>
                    editor.updateElements([elementId], patch, { history: false })
                  }
                  onUpdateTextRunStyle={updateTextRunStyle}
                  cropTargetId={cropTargetId}
                  onStartImageCrop={(elementId) => setCropTargetId(elementId)}
                  onCommitCrop={(elementId, crop) => {
                    editor.updateElements([elementId], { crop }, { history: false });
                    setCropTargetId(null);
                  }}
                  onCancelCrop={() => setCropTargetId(null)}
                  spacingLines={spacingLines}
                />
              </div>
            </div>
          </div>

          {rightOpen ? (
            <aside className="min-h-0 min-w-0 overflow-hidden border-l">
              <Tabs value={rightTab} onValueChange={setRightTab} className="flex h-full flex-col">
                <TabsList className="mx-4 mt-4 grid grid-cols-2">
                  <TabsTrigger value="properties">Thuộc tính</TabsTrigger>
                  <TabsTrigger value="layers">Layers</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="properties"
                  className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
                >
                  <div className="flex flex-col gap-3 pt-4">
                    <InspectorSection
                      title="Trang"
                      action={
                        <Button
                          size="sm"
                          variant={editor.state.documentSettings.snapToGrid ? "default" : "outline"}
                          className="h-7 gap-1.5 px-2 text-[11px]"
                          onClick={() =>
                            editor.updateDocumentSettings({
                              snapToGrid: !editor.state.documentSettings.snapToGrid,
                            })
                          }
                        >
                          <Grid2X2 className="size-3.5" />
                          Hút lưới {editor.state.documentSettings.snapToGrid ? "Bật" : "Tắt"}
                        </Button>
                      }
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <NumberField
                          label="W"
                          value={activePage.width}
                          onChange={(value) =>
                            editor.updatePage(activePage.pageId, { width: value })
                          }
                        />
                        <NumberField
                          label="H"
                          value={activePage.height}
                          onChange={(value) =>
                            editor.updatePage(activePage.pageId, { height: value })
                          }
                        />
                      </div>
                      <CompactColorControl
                      brandColors={brandKitColors}
                        label="Nền"
                        value={activePage.background ?? "#ffffff"}
                        onChange={(color) =>
                          updatePagePreview(activePage.pageId, { background: color })
                        }
                        onCommit={(color) =>
                          commitPagePatch(activePage.pageId, { background: color })
                        }
                      />
                    </InspectorSection>

                    {primary ? (
                      <div className="flex flex-col gap-3">
                        <InspectorSection
                          title="Đối tượng"
                          action={
                            <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                              {selected.length > 1 ? `${selected.length} mục` : primary.kind}
                            </span>
                          }
                        >
                          <div className="flex flex-col gap-2">
                            <Label className="text-[11px] font-medium text-muted-foreground">
                              Tên layer
                            </Label>
                            <Input
                              value={primary.name ?? ""}
                              onChange={(event) =>
                                editor.updateElements(
                                  [primary.elementId],
                                  { name: event.target.value },
                                  { history: false },
                                )
                              }
                              placeholder="Tên layer"
                              className="h-8"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <NumberField
                              label="X"
                              value={primary.x}
                              onChange={(value) =>
                                editor.updateSelectedElements({ x: value }, { history: false })
                              }
                            />
                            <NumberField
                              label="Y"
                              value={primary.y}
                              onChange={(value) =>
                                editor.updateSelectedElements({ y: value }, { history: false })
                              }
                            />
                            <NumberField
                              label="W"
                              value={primary.width}
                              onChange={(value) =>
                                editor.updateSelectedElements({ width: value }, { history: false })
                              }
                            />
                            <NumberField
                              label="H"
                              value={primary.height}
                              onChange={(value) =>
                                editor.updateSelectedElements({ height: value }, { history: false })
                              }
                            />
                          </div>
                          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                            <NumberField
                              label="Xoay"
                              value={primary.rotation ?? 0}
                              suffix="°"
                              onChange={(value) =>
                                editor.updateSelectedElements(
                                  { rotation: value },
                                  { history: false },
                                )
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-10 px-0"
                              onClick={() =>
                                editor.updateSelectedElements(
                                  { rotation: (primary.rotation ?? 0) - 15 },
                                  { history: false },
                                )
                              }
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-10 px-0"
                              onClick={() =>
                                editor.updateSelectedElements(
                                  { rotation: (primary.rotation ?? 0) + 15 },
                                  { history: false },
                                )
                              }
                            >
                              <RotateCw className="size-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editor.copySelection()}
                            >
                              <Copy className="mr-2 size-4" /> Sao chép
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editor.duplicateSelection()}
                            >
                              <Layers className="mr-2 size-4" /> Nhân bản
                            </Button>
                          </div>
                        </InspectorSection>

                        <InspectorSection title="Lớp">
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("front")}
                            >
                              Lên cùng
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("forward")}
                            >
                              Lên 1 lớp
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("backward")}
                            >
                              Xuống 1 lớp
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => editor.orderSelection("back")}
                            >
                              Xuống cùng
                            </Button>
                          </div>
                        </InspectorSection>

                        <InspectorSection title="Data binding">
                          <ElementBindingControls
                            element={primary}
                            onBindingChange={(next) =>
                              editor.updateElements([primary.elementId], { binding: next })
                            }
                          />
                          {primary.binding?.path ? (
                            <div className="mt-2 space-y-1.5 text-xs">
                              <Label className="text-[11px] text-muted-foreground">
                                Binding path hiện tại
                              </Label>
                              <div className="rounded bg-muted px-2 py-1 font-mono text-[10px]">
                                {primary.binding.path}
                              </div>
                              {primary.binding.fallbackText ? (
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">
                                    Fallback text
                                  </Label>
                                  <div className="truncate rounded bg-muted px-2 py-1 text-[11px]">
                                    {primary.binding.fallbackText}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </InspectorSection>

                        {primary.kind === "text" ? (
                          <InspectorSection title="Chữ">
                            <div className="text-[11px] text-muted-foreground">
                              Nhấp đúp trên canvas để sửa nhanh.
                            </div>
                            <textarea
                              value={primary.text}
                              onChange={(event) =>
                                editor.updateElements(
                                  [primary.elementId],
                                  { text: event.target.value } as Partial<DesignElement>,
                                  { history: false },
                                )
                              }
                              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <NumberField
                                label="Cỡ chữ"
                                value={Number(primary.style?.fontSize ?? 48)}
                                onChange={(value) =>
                                  updateElementStyle(primary.elementId, { fontSize: value })
                                }
                              />
                              <NumberField
                                label="Độ đậm"
                                value={Number(primary.style?.fontWeight ?? 700)}
                                onChange={(value) =>
                                  updateElementStyle(primary.elementId, { fontWeight: value })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Font chữ</Label>
                              <Select
                                value={String(primary.style?.fontFamily ?? "Be Vietnam Pro")}
                                onValueChange={(value) =>
                                  updateElementStyle(primary.elementId, { fontFamily: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableFontFamilies.map((family) => (
                                    <SelectItem key={family} value={family}>
                                      {family}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <CompactColorControl
                      brandColors={brandKitColors}
                              label="Màu chữ"
                              value={primary.style?.color ?? "#0f172a"}
                              onChange={(color) => updateElementStyle(primary.elementId, { color })}
                              onCommit={(color) =>
                                commitElementStyle(primary.elementId, { color })
                              }
                            />
                            <LetterSpacingControl
                              value={Number(primary.style?.letterSpacing ?? 0)}
                              onChange={(value) =>
                                updateElementStyle(primary.elementId, { letterSpacing: value })
                              }
                            />
                            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs">Viền chữ</Label>
                                <Button
                                  size="sm"
                                  variant={
                                    Number(primary.style?.textStrokeWidth ?? 0) > 0
                                      ? "default"
                                      : "outline"
                                  }
                                  onClick={() => {
                                    const enabled = Number(primary.style?.textStrokeWidth ?? 0) > 0;
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textStrokeWidth: enabled ? 0 : 2,
                                          textStrokeColor:
                                            primary.style?.textStrokeColor ?? "#ffffff",
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    );
                                  }}
                                >
                                  {Number(primary.style?.textStrokeWidth ?? 0) > 0 ? "Bật" : "Tắt"}
                                </Button>
                              </div>
                              <div className="grid grid-cols-[1fr_120px] items-end gap-2">
                                <NumberField
                                  label="Độ dày"
                                  value={Number(primary.style?.textStrokeWidth ?? 0)}
                                  onChange={(value) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textStrokeWidth: Math.max(0, value),
                                          textStrokeColor:
                                            primary.style?.textStrokeColor ?? "#ffffff",
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                  onCommit={(value) =>
                                    commitElementStyle(primary.elementId, {
                                      textStrokeWidth:
                                        Math.max(0, value) > 0
                                          ? Math.max(0, value)
                                          : Number(primary.style?.textStrokeWidth ?? 0),
                                    })
                                  }
                                />
                                <CompactColorControl
                      brandColors={brandKitColors}
                                  label="Màu"
                                  value={primary.style?.textStrokeColor ?? "#ffffff"}
                                  onChange={(color) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textStrokeColor: color,
                                          textStrokeWidth:
                                            Number(primary.style?.textStrokeWidth ?? 0) > 0
                                              ? primary.style?.textStrokeWidth
                                              : 2,
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs">Bóng chữ</Label>
                                <Button
                                  size="sm"
                                  variant={primary.style?.textShadowColor ? "default" : "outline"}
                                  onClick={() => {
                                    const enabled = !!primary.style?.textShadowColor;
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          textShadowColor: enabled ? undefined : "#000000",
                                          textShadowBlur: enabled ? undefined : 8,
                                          textShadowX: enabled ? undefined : 2,
                                          textShadowY: enabled ? undefined : 4,
                                          textShadow: enabled
                                            ? undefined
                                            : primary.style?.textShadow,
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    );
                                  }}
                                >
                                  {primary.style?.textShadowColor ? "Bật" : "Tắt"}
                                </Button>
                              </div>
                              {primary.style?.textShadowColor ? (
                                <>
                                  <CompactColorControl
                      brandColors={brandKitColors}
                                    label="Màu"
                                    value={primary.style.textShadowColor}
                                    onChange={(color) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: {
                                            ...(primary.style ?? {}),
                                            textShadowColor: color,
                                          },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                    onCommit={(color) =>
                                      commitElementStyle(primary.elementId, {
                                        textShadowColor: color,
                                      })
                                    }
                                  />
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <Label className="text-xs text-muted-foreground">Mờ</Label>
                                      <span className="text-[11px] tabular-nums text-muted-foreground">
                                        {Number(primary.style?.textShadowBlur ?? 8)}px
                                      </span>
                                    </div>
                                    <Slider
                                      value={[Number(primary.style?.textShadowBlur ?? 8)]}
                                      min={0}
                                      max={40}
                                      step={1}
                                      onValueChange={(value) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              textShadowBlur: value[0],
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <NumberField
                                      label="X"
                                      value={Number(primary.style?.textShadowX ?? 2)}
                                      onChange={(value) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              textShadowX: value,
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                    />
                                    <NumberField
                                      label="Y"
                                      value={Number(primary.style?.textShadowY ?? 4)}
                                      onChange={(value) =>
                                        editor.updateElements(
                                          [primary.elementId],
                                          {
                                            style: {
                                              ...(primary.style ?? {}),
                                              textShadowY: value,
                                            },
                                          } as Partial<DesignElement>,
                                          { history: false },
                                        )
                                      }
                                    />
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </InspectorSection>
                        ) : null}

                        {primary.kind === "image" || primary.kind === "shape" ? (
                          <InspectorSection title="Hiển thị">
                            <div className="space-y-2">
                              <Label className="text-xs">Bo góc</Label>
                              <Slider
                                value={[Number(primary.style?.borderRadius ?? 0)]}
                                min={0}
                                max={160}
                                step={2}
                                onValueChange={(value) =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: { ...(primary.style ?? {}), borderRadius: value[0] },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              />
                            </div>
                            {primary.kind === "shape" ? (
                              <CompactColorControl
                      brandColors={brandKitColors}
                                label="Màu nền"
                                value={primary.style?.fill ?? "#f97316"}
                                onChange={(color) =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: {
                                        ...(primary.style ?? {}),
                                        fill: color,
                                      },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                                onCommit={(color) =>
                                  commitElementStyle(primary.elementId, { fill: color })
                                }
                              />
                            ) : null}
                            {primary.kind === "image" ? (
                              <div className="space-y-2">
                                <Label className="text-xs">Cách khớp</Label>
                                <Select
                                  value={primary.style?.fit ?? "cover"}
                                  onValueChange={(value) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          fit: value as "cover" | "contain" | "stretch",
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cover">Phủ kín</SelectItem>
                                    <SelectItem value="contain">Vừa khung</SelectItem>
                                    <SelectItem value="stretch">Kéo giãn</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                            {primary.kind === "image" ? (
                              <div className="space-y-3 border-t pt-3">
                                <Label className="text-xs uppercase text-muted-foreground">
                                  Bộ lọc
                                </Label>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Độ sáng</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {Math.round((primary.style?.brightness ?? 1) * 100)}%
                                    </span>
                                  </div>
                                  <Slider
                                    value={[(primary.style?.brightness ?? 1) * 100]}
                                    min={0}
                                    max={200}
                                    step={5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), brightness: v / 100 },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Tương phản</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {Math.round((primary.style?.contrast ?? 1) * 100)}%
                                    </span>
                                  </div>
                                  <Slider
                                    value={[(primary.style?.contrast ?? 1) * 100]}
                                    min={0}
                                    max={200}
                                    step={5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), contrast: v / 100 },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Độ bão hòa</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {Math.round((primary.style?.saturate ?? 1) * 100)}%
                                    </span>
                                  </div>
                                  <Slider
                                    value={[(primary.style?.saturate ?? 1) * 100]}
                                    min={0}
                                    max={200}
                                    step={5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), saturate: v / 100 },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Làm mờ</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {primary.style?.blur ?? 0}px
                                    </span>
                                  </div>
                                  <Slider
                                    value={[primary.style?.blur ?? 0]}
                                    min={0}
                                    max={20}
                                    step={0.5}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: { ...(primary.style ?? {}), blur: v },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: {
                                          ...(primary.style ?? {}),
                                          brightness: 1,
                                          contrast: 1,
                                          saturate: 1,
                                          blur: 0,
                                        },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                >
                                  Đặt lại bộ lọc
                                </Button>
                              </div>
                            ) : null}
                          </InspectorSection>
                        ) : null}

                        {/* Gradient fill — available for shape + text */}
                        {primary.kind === "shape" || primary.kind === "text" ? (
                          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs">Màu chuyển</Label>
                              <Button
                                size="sm"
                                variant={primary.style?.gradientEnabled ? "default" : "outline"}
                                onClick={() =>
                                  editor.updateElements(
                                    [primary.elementId],
                                    {
                                      style: {
                                        ...(primary.style ?? {}),
                                        gradientEnabled: !primary.style?.gradientEnabled,
                                      },
                                    } as Partial<DesignElement>,
                                    { history: false },
                                  )
                                }
                              >
                                {primary.style?.gradientEnabled ? "Bật" : "Tắt"}
                              </Button>
                            </div>
                            {primary.style?.gradientEnabled ? (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Từ</Label>
                                    <CompactColorControl
                      brandColors={brandKitColors}
                                      label="Từ"
                                      value={primary.style?.gradientFrom ?? "#f97316"}
                                      onChange={(color) =>
                                        updateElementStyle(primary.elementId, {
                                          gradientFrom: color,
                                        })
                                      }
                                      onCommit={(color) =>
                                        commitElementStyle(primary.elementId, {
                                          gradientFrom: color,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Đến</Label>
                                    <CompactColorControl
                      brandColors={brandKitColors}
                                      label="Đến"
                                      value={primary.style?.gradientTo ?? "#ec4899"}
                                      onChange={(color) =>
                                        updateElementStyle(primary.elementId, {
                                          gradientTo: color,
                                        })
                                      }
                                      onCommit={(color) =>
                                        commitElementStyle(primary.elementId, {
                                          gradientTo: color,
                                        })
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs text-muted-foreground">Góc</Label>
                                    <span className="text-[10px] tabular-nums text-muted-foreground">
                                      {primary.style?.gradientAngle ?? 90}°
                                    </span>
                                  </div>
                                  <Slider
                                    value={[primary.style?.gradientAngle ?? 90]}
                                    min={0}
                                    max={360}
                                    step={15}
                                    onValueChange={([v]) =>
                                      editor.updateElements(
                                        [primary.elementId],
                                        {
                                          style: {
                                            ...(primary.style ?? {}),
                                            gradientAngle: v,
                                          },
                                        } as Partial<DesignElement>,
                                        { history: false },
                                      )
                                    }
                                  />
                                </div>
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Shadow controls — available for all elements */}
                        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs">Đổ bóng</Label>
                            <Button
                              size="sm"
                              variant={primary.style?.shadowColor ? "default" : "outline"}
                              onClick={() =>
                                editor.updateElements(
                                  [primary.elementId],
                                  {
                                    style: {
                                      ...(primary.style ?? {}),
                                      shadowColor: primary.style?.shadowColor
                                        ? undefined
                                        : "rgba(0,0,0,0.25)",
                                      shadowBlur: primary.style?.shadowBlur ?? 8,
                                      shadowX: primary.style?.shadowX ?? 0,
                                      shadowY: primary.style?.shadowY ?? 4,
                                    },
                                  } as Partial<DesignElement>,
                                  { history: false },
                                )
                              }
                            >
                              {primary.style?.shadowColor ? "Bật" : "Tắt"}
                            </Button>
                          </div>
                          {primary.style?.shadowColor ? (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Màu</Label>
                                <CompactColorControl
                      brandColors={brandKitColors}
                                  label="MÃ u"
                                  value={primary.style.shadowColor ?? "#000000"}
                                  onChange={(color) =>
                                    updateElementStyle(primary.elementId, {
                                      shadowColor: color,
                                    })
                                  }
                                  onCommit={(color) =>
                                    commitElementStyle(primary.elementId, {
                                      shadowColor: color,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs text-muted-foreground">Mờ</Label>
                                  <span className="text-[10px] tabular-nums text-muted-foreground">
                                    {primary.style.shadowBlur ?? 8}px
                                  </span>
                                </div>
                                <Slider
                                  value={[primary.style.shadowBlur ?? 8]}
                                  min={0}
                                  max={40}
                                  step={1}
                                  onValueChange={([v]) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: { ...(primary.style ?? {}), shadowBlur: v },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <NumberField
                                  label="X"
                                  value={primary.style.shadowX ?? 0}
                                  onChange={(v) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: { ...(primary.style ?? {}), shadowX: v },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                                <NumberField
                                  label="Y"
                                  value={primary.style.shadowY ?? 4}
                                  onChange={(v) =>
                                    editor.updateElements(
                                      [primary.elementId],
                                      {
                                        style: { ...(primary.style ?? {}), shadowY: v },
                                      } as Partial<DesignElement>,
                                      { history: false },
                                    )
                                  }
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        icon={<MousePointer2 />}
                        title="Chưa chọn đối tượng"
                        description="Bấm vào một khối trên canvas để chỉnh thuộc tính. Giữ Shift để chọn nhiều khối."
                        compact
                      />
                    )}
                  </div>
                </TabsContent>
                <TabsContent
                  value="layers"
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  <LayersPanel
                    elements={editor.activeElements}
                    selectedIds={editor.state.selection.ids}
                    onSelect={(ids, primaryId) => editor.setSelection(ids, primaryId)}
                    onReorder={(activeId, overId) => {
                      // Reorder: đặt activeId trước/sau overId dựa trên vị trí trong list.
                      // Layers panel hiển thị reversed (top element ở trên), nên drag
                      // "lên" = tăng zIndex = orderSelection("forward").
                      const order = (editor.state.elementOrderByPage[editor.state.activePageId] ?? []);
                      const activeIdx = order.indexOf(activeId);
                      const overIdx = order.indexOf(overId);
                      if (activeIdx < 0 || overIdx < 0) return;
                      // Di chuyển element trong order array
                      editor.setSelection([activeId], activeId);
                      if (activeIdx < overIdx) {
                        // Kéo xuống trong layers = kéo lên trong render order
                        for (let i = 0; i < overIdx - activeIdx; i++) {
                          editor.orderSelection("backward", [activeId]);
                        }
                      } else {
                        // Kéo lên trong layers = kéo xuống trong render order
                        for (let i = 0; i < activeIdx - overIdx; i++) {
                          editor.orderSelection("forward", [activeId]);
                        }
                      }
                    }}
                    onToggleHidden={(id) => {
                      const el = editor.state.elementsById[id];
                      if (!el) return;
                      const hidden = !(el.hidden || el.style?.hidden);
                      editor.updateElements([id], { hidden, style: { ...el.style, hidden } });
                    }}
                    onToggleLocked={(id) => {
                      const el = editor.state.elementsById[id];
                      if (!el) return;
                      editor.updateElements([id], { locked: !el.locked });
                    }}
                    onRename={(id, name) => {
                      editor.updateElements([id], { name });
                    }}
                  />
                </TabsContent>
              </Tabs>
            </aside>
          ) : (
            <div />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />;
}

function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-0.5 p-0.5">{children}</div>;
}

function InspectorSection({
  title,
  action,
  children,
  defaultOpen = true,
  storageKey,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /** Mặc định mở khi chưa có state lưu. */
  defaultOpen?: boolean;
  /**
   * Nếu có, lưu trạng thái open/close trong localStorage theo key.
   * Nếu không có, tự sinh từ title.
   */
  storageKey?: string;
}) {
  // Ký tự safe cho key
  const resolvedKey = storageKey ?? title.replace(/\s+/g, "_").toLowerCase();
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ux:inspector-section:${resolvedKey}`);
      if (raw === "1") setOpen(true);
      else if (raw === "0") setOpen(false);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, [resolvedKey]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        `ux:inspector-section:${resolvedKey}`,
        open ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [mounted, resolvedKey, open]);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left transition-colors hover:opacity-80 focus:outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 rounded"
          title={open ? "Thu gọn" : "Mở rộng"}
        >
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <Label className="pointer-events-none text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </Label>
        </button>
        {action}
      </div>
      {open && <div className="flex flex-col gap-3 px-3 pb-3">{children}</div>}
    </section>
  );
}

function CompactColorControl({
  label,
  value,
  onChange,
  onCommit,
  brandColors,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  onCommit?: (color: string) => void;
  brandColors?: string[];
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-2 py-2">
      <Label className="min-w-14 text-[11px] font-medium text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-0 flex-1 justify-start gap-2 px-2"
          >
            <span className="size-4 shrink-0 rounded-sm border" style={{ background: value }} />
            <span className="truncate font-mono text-[11px]">{value}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <ColorPicker
            value={value}
            onChange={onChange}
            onPreview={onChange}
            onCommit={onCommit ?? onChange}
            brandColors={brandColors}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function clampInspectorNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function LetterSpacingControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const displayValue = clampInspectorNumber(value, LETTER_SPACING_MIN, LETTER_SPACING_MAX);
  const updateValue = (next: number) =>
    onChange(clampInspectorNumber(next, LETTER_SPACING_MIN, LETTER_SPACING_MAX));

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Giãn chữ</Label>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {displayValue.toFixed(1)}px
        </span>
      </div>
      <Slider
        value={[displayValue]}
        min={LETTER_SPACING_MIN}
        max={LETTER_SPACING_MAX}
        step={LETTER_SPACING_STEP}
        onValueChange={([next]) => updateValue(next)}
      />
      <NumberField
        label="Khoảng"
        value={displayValue}
        onChange={updateValue}
        suffix="px"
        precision={1}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  onCommit,
  suffix = "px",
  precision = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  suffix?: string;
  precision?: number;
}) {
  const factor = Math.pow(10, precision);
  const displayValue = Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
  const parseValue = (input: string) => {
    // Hỗ trợ công thức cơ bản: 100+20, 50*2, 200/2
    const trimmed = input.trim();
    if (!trimmed) return 0;
    // Nếu chỉ chứa số + toán tử an toàn thì evaluate
    if (/^[\d+\-*/.()\s]+$/.test(trimmed) && /[+\-*/]/.test(trimmed)) {
      try {
        const result = Function(`"use strict"; return (${trimmed});`)();
        if (typeof result === "number" && Number.isFinite(result)) return result;
      } catch {
        /* fall through to Number() */
      }
    }
    return Number(trimmed) || 0;
  };
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={displayValue}
          className="h-8 pr-8 text-xs tabular-nums"
          onChange={(event) => onChange(parseValue(event.target.value))}
          onBlur={(event) => onCommit?.(parseValue(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommit?.(parseValue(event.currentTarget.value));
              event.currentTarget.blur();
              return;
            }
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const direction = event.key === "ArrowUp" ? 1 : -1;
              let step = 1;
              if (event.shiftKey) step = 10;
              else if (event.altKey && precision > 0) step = 1 / factor;
              const next = displayValue + direction * step;
              onChange(next);
              onCommit?.(next);
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
