// Domain models cho Content Pack Generator

export type ID = string;

export type PartnerType = "sponsor" | "ambassador" | "campaign" | "owned" | "none";
export type EntityStatus = "active" | "draft" | "archived";

export interface Entity {
  entityId: ID;
  name: string;
  categoryMain?: string;
  categorySub?: string;
  address?: string;
  phone?: string;
  openingHours?: string;
  style?: string;
  priceRange?: string;
  partnerFlag: boolean;
  partnerPriority: number; // 0..100
  partnerType: PartnerType;
  campaignTags: string[];
  seoKeywords: string[];
  status: EntityStatus;
  sourceRowId?: string;
  sheetName?: string;
  metadata?: Record<string, unknown>;
}

export type AssetSourceType = "local" | "url" | "sheet";
export type AssetRole =
  | "cover"
  | "facade"
  | "food_closeup"
  | "space"
  | "portrait"
  | "square_thumb"
  | "section_image"
  | "generic";
export type AssetOrientation = "portrait" | "landscape" | "square";
export type AssetStatus = "ok" | "missing" | "broken" | "low_quality";

export interface Asset {
  assetId: ID;
  entityId: ID;
  sourceType: AssetSourceType;
  sourceValue: string; // URL hoặc IndexedDB blob key
  blobKey?: string; // nếu local blob trong IndexedDB
  role: AssetRole;
  orientation?: AssetOrientation;
  aspectRatio?: number;
  qualityScore: number; // 0..100
  isCover: boolean;
  status: AssetStatus;
  width?: number;
  height?: number;
}

export type BulletType = "dot" | "dash" | "number" | "icon" | "none";

export interface SectionItem {
  sectionItemId: ID;
  entityId: ID;
  line1?: string; // tên
  line2?: string; // địa chỉ / mô tả
  line3?: string; // giá / hotline
  icon?: string;
  bulletType?: BulletType;
  emphasis?: "normal" | "bold" | "highlight";
  metadata?: Record<string, unknown>;
}

export type SlotKind = "text" | "image" | "group" | "repeater" | "section" | "shape" | "icon";

export interface SlotStyle {
  // text
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through" | "underline line-through";
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  maxLines?: number;
  textShadow?: string;
  textStroke?: string;
  textStrokeColor?: string;
  textStrokeWidth?: number;
  // gradient (text & shape fill)
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number; // deg
  gradientEnabled?: boolean;
  // image
  fit?: "cover" | "contain" | "stretch";
  borderRadius?: number;
  shadow?: string;
  opacity?: number;
  overlayColor?: string;
  // shape
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  // border (image & shape)
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  // common
  background?: string;
  padding?: number;
  rotation?: number;
  // image filters (CSS filter)
  brightness?: number; // 1 = normal
  contrast?: number;
  saturate?: number;
  blur?: number; // px
  hueRotate?: number; // deg
  grayscale?: number; // 0..1
  // flip
  flipH?: boolean;
  flipV?: boolean;
  // drop shadow
  shadowColor?: string;
  shadowBlur?: number;
  shadowX?: number;
  shadowY?: number;
  // visibility (Designer toolkit)
  hidden?: boolean;
}

// Crop ảnh: % so với ảnh gốc (0..1)
export interface ImageCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type OverflowRule = "shrink" | "ellipsis" | "max_lines" | "hard_fail";

export interface Slot {
  slotId: ID;
  name?: string; // tên hiển thị trong panel Layers (designer đặt thủ công)
  pageId?: ID;
  sectionId?: ID;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  locked?: boolean;
  groupId?: ID;
  kind: SlotKind;
  // dữ liệu tĩnh (nếu không bind)
  staticText?: string;
  staticImage?: string; // url hoặc blob key
  shapeKind?: "rectangle" | "circle" | "triangle" | "line" | "divider" | "badge";
  // bind
  bindingPath?: string; // ví dụ "entity.name", "asset.url", "section.items[0].line1"
  allowedAssetRoles?: AssetRole[];
  style?: SlotStyle;
  visibilityRule?: string;
  overflowRule?: OverflowRule;
  // repeater
  repeaterCount?: number;
  repeaterItemHeight?: number;
  repeaterGap?: number;
  // section ref
  sectionRefId?: ID;
  // ảnh upload từ máy → mặc định là layer nền, không cho nhân bản
  isUploadedBackground?: boolean;
  // crop ảnh (chỉ dùng cho kind=image)
  crop?: ImageCrop;
}

export type PartnerMode = "strict_partner" | "priority_partner" | "balanced_partner";
export type ImageMode = "section_mood" | "anchor_entity";

export type FilterOp = "eq" | "in" | "gte" | "lte" | "contains";

export interface FilterRule {
  field: string; // tên cột — đọc từ entity[field] hoặc entity.metadata[field]
  op: FilterOp;
  value: string | number | string[];
}

export type SectionLayoutMode = "stack" | "zigzag" | "grid" | "poster_list";

export interface Section {
  sectionId: ID;
  title: string;
  categoryQuery?: string; // ví dụ "category=cafe"
  subCategoryQuery?: string;
  maxItems: number;
  minItems: number;
  imageMode: ImageMode;
  imageSlotId?: ID;
  listStyle?: BulletType;
  sortRule?: "partner_first" | "diversity" | "alpha" | "none";
  partnerMode: PartnerMode;
  overflowPolicy?: OverflowRule;
  // Lọc thêm theo cột tuỳ ý (vd day=1, category=homestay)
  filterRules?: FilterRule[];
  // Cách bố trí item trong section khi render (stack | zigzag trái/phải | grid)
  layoutMode?: SectionLayoutMode;
}

export type PageType = "cover" | "itinerary" | "board" | "mixed";

export interface CanvasSize {
  width: number;
  height: number;
  background?: string;
  backgroundImage?: string;
}

export interface CardGroupConfig {
  /** ID của group (Slot.groupId) sẽ được lặp. */
  groupId: ID;
  /** Số card sẽ clone (gồm cả bản gốc). VD repeatCount=4 → 1 gốc + 3 clone. */
  repeatCount: number;
  /** Khoảng cách giữa 2 card liên tiếp (px ở canvas size, scale theo render). */
  gap: number;
  /** Chiều lặp card. */
  direction: "vertical" | "horizontal";
  /** (Tùy chọn) lọc entity nguồn — nếu trống dùng entityPool truyền vào renderer. */
  entitySource?: {
    sheetName?: string;
    filterRules?: FilterRule[];
  };
}

export interface PageTemplate {
  pageTemplateId: ID;
  name: string;
  type: PageType;
  canvas: CanvasSize;
  slots: Slot[];
  sections: Section[];
  stylePreset?: string;
  validationRules?: string[];
  updatedAt: number;
  createdAt: number;
  thumbnail?: string;
  /** Danh sách Card Repeater: mỗi mục biến 1 group slot thành N card lặp. */
  cardGroups?: CardGroupConfig[];
}

export interface PackTemplate {
  packTemplateId: ID;
  name: string;
  description?: string;
  goal?: string;
  tone?: string;
  cta?: string;
  orderedPages: ID[]; // pageTemplateId
  requiredPages: ID[];
  optionalPages: ID[];
  captionProfile?: {
    mode: CaptionMode;
    seoKeywords?: string[];
  };
  exportDefaults?: {
    format: "png" | "jpg";
    scale: number;
  };
  updatedAt: number;
  createdAt: number;
}

export type PageState = "accepted" | "rejected" | "needs_fix";

export interface RenderedItem {
  slotId?: ID;
  sectionId?: ID;
  sectionItemId?: ID;
  entityId?: ID;
  assetId?: ID;
  partnerFlag?: boolean;
  partnerPriority?: number;
  reasonCodes?: string[];
}

export interface RenderedPage {
  pageIndex: number;
  pageFile: string;
  pageTemplateId: ID;
  state: PageState;
  selected: boolean;
  healthScore: number;
  warnings: string[];
  items: RenderedItem[];
  renderedAt: number;
  /** Entity gắn vào page này (chỉ dùng cho luồng pack-bind theo entity). */
  entityId?: ID;
  /** Tên entity để hiển thị nhanh trên card kết quả. */
  entityName?: string;
  /** Override binding tạm thời designer áp lên page này khi generate. */
  bindOverrides?: Record<string, string | undefined>;
  /** Bản chỉnh cục bộ của page output trong /generate, không đụng template gốc. */
  workingTemplate?: PageTemplate;
}

export interface DataSourceInfo {
  kind: "csv" | "json" | "sheet" | "manual";
  name?: string;
  url?: string;
  rowCount?: number;
  importedAt: number;
}

export interface GenerationJob {
  jobId: ID;
  packTemplateId: ID;
  packTemplateName: string;
  createdAt: number;
  dataSource?: DataSourceInfo;
  pages: RenderedPage[];
  status: "draft" | "generated" | "exported";
  notes?: string;
}

export interface RenderManifest {
  jobId: ID;
  generatedAt: number;
  pages: Array<{
    pageFile: string;
    pageTemplateId: ID;
    selected: boolean;
    items: RenderedItem[];
    warnings: string[];
  }>;
}

export type CaptionMode = "save_post" | "newbie_guide" | "review_pack" | "partner_soft";

export interface CaptionVariant {
  id: ID;
  headline: string;
  body: string;
  hashtags: string[];
  mode: CaptionMode;
  sourceManifestPageIds: string[];
}

export interface Project {
  projectId: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
}

export interface BlobRecord {
  blobKey: ID;
  blob: Blob;
  mime: string;
  createdAt: number;
}

export interface ManualOverride {
  overrideId: ID;
  packTemplateId: ID;
  pageTemplateId?: ID;
  sectionId?: ID;
  slotId?: ID;
  pinEntityId?: ID;
  excludeEntityIds?: ID[];
  pinAssetId?: ID;
  excludeAssetIds?: ID[];
  lockSection?: boolean;
}

export type AiProviderPreset = "deepseek" | "lovable" | "custom";

export interface AiProviderConfig {
  preset: AiProviderPreset;
  baseUrl: string; // vd https://api.deepseek.com/v1 hoặc http://localhost:20128/v1
  model: string; // vd deepseek-chat, cx/gpt-5.4
  apiKey?: string; // optional, có provider local không cần
  visionModel?: string; // optional override cho ảnh; nếu trống dùng model
}

export interface AppSettings {
  language: "vi";
  captionProvider: "local" | "openai";
  captionApiKey?: string;
  exportScale: number;
  defaultCanvas: CanvasSize;
  theme?: "light" | "dark";
  ai?: AiProviderConfig;
}

export type AnalysisMode = "quick" | "deep_draft" | "draft_only";

export type AnalyzedPageType =
  | "cover"
  | "board"
  | "mixed_board"
  | "itinerary"
  | "checklist"
  | "service_directory"
  | "recap"
  | "closing"
  | "unknown";

export type CompatibilityLevel =
  | "very_compatible"
  | "partial"
  | "significant_missing"
  | "not_ready";

export type RequirementKind = "data_field" | "asset" | "structural" | "manual_literal";

export type GapCategory = "field" | "asset" | "structure" | "manual" | "risk";

export type SheetSemanticProfile =
  | "food"
  | "cafe"
  | "service"
  | "homestay"
  | "checkin"
  | "mixed"
  | "other";

export type GapLevel = "have" | "mappable" | "missing_required" | "missing_optional" | "risk";

export type DraftReadiness = "ready" | "needs_data" | "skeleton_only";

export type BlueprintBlockRole =
  | "background"
  | "title"
  | "subtitle"
  | "eyebrow"
  | "list_line"
  | "list_group"
  | "section_title"
  | "image_holder"
  | "shape_label"
  | "badge"
  | "body_text"
  | "cta"
  | "decor"
  | "other";

export type BlueprintImportance = "high" | "medium" | "low";

export interface BlueprintBlock {
  name: string;
  role: BlueprintBlockRole;
  kind: "text" | "image" | "shape";
  importance?: BlueprintImportance;
  clusterId?: string;
  lineIndex?: number;
  shapeKind?: "rectangle" | "circle" | "badge" | "line" | "divider";
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  rotation?: number;
  placeholder?: string;
  notes?: string;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    color?: string;
    fill?: string;
    borderRadius?: number;
    textAlign?: "left" | "center" | "right";
    textTransform?: "none" | "uppercase" | "lowercase";
    lineHeight?: number;
    letterSpacing?: number;
    opacity?: number;
    overlayColor?: string;
    textShadow?: string;
    textStrokeColor?: string;
    textStrokeWidth?: number;
    padding?: number;
    fit?: "cover" | "contain" | "stretch";
    shadowColor?: string;
    shadowBlur?: number;
    shadowX?: number;
    shadowY?: number;
  };
}

export interface VisualBlueprint {
  canvas?: { bgColor?: string };
  blocks: BlueprintBlock[];
  confidence?: number;
  warnings?: string[];
}

export interface BlueprintRequirementHint {
  fieldKey: string;
  label: string;
  scope: "pack" | "page" | "section" | "item" | "asset";
  required: boolean;
  kind?: RequirementKind;
  bindCandidate?: string;
  bindCandidates?: string[];
  examples?: string[];
  notes?: string;
  acceptsManualInput?: boolean;
  minRecords?: number;
  assetRoleHint?: string;
  confidence?: number;
}

export interface BlueprintUiRegionHint {
  kind: AnalyzedUiRegion["kind"];
  label: string;
  description: string;
  estimatedItems?: number;
}

export interface DataBlueprintBindingHint {
  blockName: string;
  bindingPath?: string;
  manualLiteral?: boolean;
  required?: boolean;
  notes?: string;
  confidence?: number;
  clusterId?: string;
  lineIndex?: number;
}

export interface DataBlueprintSectionHint {
  clusterId: string;
  title?: string;
  repeatedItemCount?: number;
  imageRepresentsCluster?: boolean;
  notes?: string;
  confidence?: number;
}

export interface DataBlueprint {
  pageRole: string;
  pageType: AnalyzedPageType;
  summary: string;
  layoutDensity: "low" | "medium" | "high";
  numberOfSections: number;
  estimatedItemCount: number;
  hasMainTitle: boolean;
  hasSubtitle: boolean;
  hasBackgroundImage: boolean;
  hasPanel: boolean;
  hasSectionImages: boolean;
  hasListRepeater: boolean;
  hasSlotRepeater: boolean;
  hasPriceBadge: boolean;
  hasCTA: boolean;
  uiRegions: BlueprintUiRegionHint[];
  requiredFields: BlueprintRequirementHint[];
  bindings?: DataBlueprintBindingHint[];
  sections?: DataBlueprintSectionHint[];
  structureConfidence?: number;
  bindingConfidence?: number;
  warnings?: string[];
}

export interface CombinedLayoutBlueprint {
  version: 2;
  visualBlueprint: VisualBlueprint;
  dataBlueprint?: DataBlueprint;
}

export interface AnalyzedUiRegion {
  regionId: ID;
  kind:
    | "cover"
    | "background"
    | "title"
    | "subtitle"
    | "panel"
    | "section"
    | "bullet_list"
    | "image_slot"
    | "price_badge"
    | "item_list"
    | "cta"
    | "other";
  label: string;
  description: string;
  estimatedItems?: number;
}

export interface InferredDataRequirement {
  requirementId: ID;
  fieldKey: string;
  label: string;
  scope: "pack" | "page" | "section" | "item" | "asset";
  required: boolean;
  kind?: RequirementKind;
  bindCandidate?: string;
  bindCandidates?: string[];
  examples?: string[];
  notes?: string;
  acceptsManualInput?: boolean;
  minRecords?: number;
  assetRoleHint?: string;
  structuralHint?: string;
  confidence?: number;
}

export interface GapItem {
  gapId: ID;
  level: GapLevel;
  fieldKey: string;
  message: string;
  category?: GapCategory;
  pageIndex?: number;
  sectionKey?: string;
  sheetName?: string;
}

export interface SheetCompatibilityDetail {
  sheetName: string;
  score: number;
  label: CompatibilityLevel;
  profileKind?: SheetSemanticProfile;
  availableFields: string[];
  mappableFields: string[];
  missingRequired: string[];
  missingOptional: string[];
  assetCoverage: string[];
  sectionCoverage: string[];
  structuralCoverage?: string[];
  reasons?: string[];
  reasonSummary?: string;
  notes: string[];
}

export interface CompatibilityReport {
  score: number;
  label: CompatibilityLevel;
  bestMatchSheet?: string;
  sheets: SheetCompatibilityDetail[];
  groups: Record<GapLevel, GapItem[]>;
  reasonSummary?: string;
}

export interface DraftPageSuggestion {
  pageTemplateId: ID;
  pageIndex: number;
  pageName: string;
  pageType: AnalyzedPageType;
  readiness: DraftReadiness;
  readinessLabel: string;
  sectionCount: number;
  estimatedItemCount: number;
  autoBindingCount: number;
  warnings: string[];
}

export interface DraftTemplateSuggestion {
  packTemplate?: PackTemplate;
  pageTemplates: PageTemplate[];
  suggestedBindings: Array<{
    pageTemplateId: ID;
    slotId: ID;
    bindingPath: string;
    confidence: number;
  }>;
  readiness?: DraftReadiness;
  readinessLabel?: string;
  pageDrafts?: DraftPageSuggestion[];
  warnings: string[];
}

export interface AnalyzedPage {
  pageIndex: number;
  pageRole: string;
  pageType: AnalyzedPageType;
  suggestedName: string;
  summary: string;
  layoutDensity: "low" | "medium" | "high";
  numberOfSections: number;
  estimatedItemCount: number;
  hasMainTitle: boolean;
  hasSubtitle: boolean;
  hasBackgroundImage: boolean;
  hasPanel: boolean;
  hasSectionImages: boolean;
  hasListRepeater: boolean;
  hasSlotRepeater: boolean;
  hasPriceBadge: boolean;
  hasCTA: boolean;
  confidenceScore: number;
  uiRegions: AnalyzedUiRegion[];
  requiredFields: InferredDataRequirement[];
  compatibility: CompatibilityReport;
  layoutJson?: string;
  visualBlueprint?: VisualBlueprint;
  dataBlueprint?: DataBlueprint;
  visualConfidence?: number;
  structureConfidence?: number;
  bindingConfidence?: number;
}

export interface AnalyzedPack {
  title: string;
  mode: AnalysisMode;
  imageCount: number;
  summary: string;
  predictedPurpose?: string;
  predictedGoal?: string;
  predictedTone?: string;
  predictedCta?: string;
  structureSummary: string[];
  pages: AnalyzedPage[];
  compatibility: CompatibilityReport;
  warnings: string[];
  uiBlueprint: string[];
  dataBlueprint: InferredDataRequirement[];
  dataBlueprintGroups?: {
    pageLevel: InferredDataRequirement[];
    sectionLevel: InferredDataRequirement[];
    itemLevel: InferredDataRequirement[];
    assetLevel: InferredDataRequirement[];
  };
}

export interface AnalysisRecord {
  analysisId: ID;
  title: string;
  mode: AnalysisMode;
  imageBlobKeys: string[];
  imageNames: string[];
  imageOrder: string[];
  pack: AnalyzedPack;
  draft?: DraftTemplateSuggestion;
  createdAt: number;
  updatedAt: number;
}
