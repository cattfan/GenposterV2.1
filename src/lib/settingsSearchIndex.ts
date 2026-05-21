export type SectionId = "general" | "ai" | "backup" | "data" | "advanced";

export interface SearchEntry {
  sectionId: SectionId;
  fieldId: string;
  label: string;
  /** Aliases (vi + en) cho user gõ tự do. Lower-case OK; normalize NFD ở caller. */
  keywords: string[];
}

export const SETTINGS_SEARCH_INDEX: readonly SearchEntry[] = [
  // General
  {
    sectionId: "general",
    fieldId: "theme",
    label: "Theme",
    keywords: ["theme", "giao dien", "dark", "sang", "toi", "system", "che do"],
  },
  {
    sectionId: "general",
    fieldId: "canvas",
    label: "Khổ ảnh mặc định",
    keywords: ["canvas", "width", "height", "kho anh", "size"],
  },
  {
    sectionId: "general",
    fieldId: "exportScale",
    label: "Độ nét file tải xuống",
    keywords: ["scale", "export", "do net", "resolution"],
  },
  {
    sectionId: "general",
    fieldId: "drive",
    label: "Drive root folder",
    keywords: ["drive", "google drive", "folder"],
  },

  // AI
  {
    sectionId: "ai",
    fieldId: "preset",
    label: "AI preset",
    keywords: ["preset", "deepseek", "openai", "lovable"],
  },
  {
    sectionId: "ai",
    fieldId: "baseUrl",
    label: "Base URL",
    keywords: ["base url", "endpoint", "api"],
  },
  {
    sectionId: "ai",
    fieldId: "model",
    label: "Model",
    keywords: ["model", "ai model"],
  },
  {
    sectionId: "ai",
    fieldId: "visionModel",
    label: "Vision model",
    keywords: ["vision", "image", "anh"],
  },
  {
    sectionId: "ai",
    fieldId: "apiKey",
    label: "API key",
    keywords: ["api key", "key", "token"],
  },

  // Backup
  {
    sectionId: "backup",
    fieldId: "scope",
    label: "Phạm vi backup",
    keywords: ["backup", "sao luu", "scope", "pham vi"],
  },
  {
    sectionId: "backup",
    fieldId: "import",
    label: "Nhập backup",
    keywords: ["import", "khoi phuc", "restore", "nhap"],
  },

  // Data (destructive)
  {
    sectionId: "data",
    fieldId: "clearAll",
    label: "Xoá tất cả dữ liệu",
    keywords: ["xoa", "delete", "clear", "tat ca"],
  },
  {
    sectionId: "data",
    fieldId: "clearImages",
    label: "Xoá ảnh",
    keywords: ["anh", "images", "delete"],
  },
  {
    sectionId: "data",
    fieldId: "clearTemplates",
    label: "Xoá khuôn mẫu",
    keywords: ["khuon", "templates", "packs", "designs"],
  },

  // Advanced
  {
    sectionId: "advanced",
    fieldId: "generateDefaults",
    label: "Generate defaults",
    keywords: ["generate", "max entities", "partner", "default", "doi tac"],
  },
  {
    sectionId: "advanced",
    fieldId: "captionProvider",
    label: "Caption provider",
    keywords: ["caption", "provider", "openai"],
  },
];
