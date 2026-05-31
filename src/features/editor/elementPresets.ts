// Built-in element presets for the editor "Mẫu nhanh" (quick presets) gallery.
//
// Each preset returns one or more element drafts (without elementId / pageId /
// zIndex, which the workspace fills in at insert time). They are pre-styled
// compositions a user can drop onto the canvas, similar to Canva's Elements
// quick graphics. Kept data-only so the workspace stays the single insert path.

import type { DesignElement } from "@/models";

/** A draft element: everything except the runtime-assigned identity fields. */
export type PresetElementDraft = Omit<DesignElement, "elementId" | "pageId" | "zIndex">;

export interface ElementPreset {
  id: string;
  label: string;
  /** Category used to group presets in the gallery. */
  category: "text" | "shape" | "combo";
  /** Build the element drafts. Positioned relative to a page-center anchor. */
  build: (anchor: { x: number; y: number }) => PresetElementDraft[];
}

const FONT = "Be Vietnam Pro";

export const ELEMENT_PRESETS: ElementPreset[] = [
  {
    id: "heading",
    label: "Tiêu đề lớn",
    category: "text",
    build: ({ x, y }) => [
      {
        kind: "text",
        name: "Tiêu đề",
        x,
        y,
        width: 520,
        height: 96,
        text: "Tiêu đề nổi bật",
        textRuns: [],
        style: { fontFamily: FONT, fontSize: 64, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 },
      },
    ],
  },
  {
    id: "subheading",
    label: "Tiêu đề phụ",
    category: "text",
    build: ({ x, y }) => [
      {
        kind: "text",
        name: "Tiêu đề phụ",
        x,
        y,
        width: 460,
        height: 56,
        text: "Tiêu đề phụ mô tả",
        textRuns: [],
        style: { fontFamily: FONT, fontSize: 32, fontWeight: 600, color: "#334155", lineHeight: 1.2 },
      },
    ],
  },
  {
    id: "body",
    label: "Đoạn văn",
    category: "text",
    build: ({ x, y }) => [
      {
        kind: "text",
        name: "Đoạn văn",
        x,
        y,
        width: 440,
        height: 120,
        text: "Thêm đoạn nội dung của bạn ở đây. Nhấn đúp để chỉnh sửa.",
        textRuns: [],
        style: { fontFamily: FONT, fontSize: 20, fontWeight: 400, color: "#475569", lineHeight: 1.5 },
      },
    ],
  },
  {
    id: "pill-badge",
    label: "Nhãn bo tròn",
    category: "shape",
    build: ({ x, y }) => [
      {
        kind: "shape",
        shapeKind: "badge",
        name: "Nhãn",
        x,
        y,
        width: 220,
        height: 64,
        text: "MỚI",
        textRuns: [],
        style: {
          fill: "#f97316",
          borderRadius: 9999,
          fontFamily: FONT,
          fontSize: 24,
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.2,
        },
      },
    ],
  },
  {
    id: "button",
    label: "Nút bấm",
    category: "combo",
    build: ({ x, y }) => [
      {
        kind: "shape",
        shapeKind: "rectangle",
        name: "Nút",
        x,
        y,
        width: 240,
        height: 72,
        text: "Bấm vào đây",
        textRuns: [],
        style: {
          fill: "#0f172a",
          borderRadius: 14,
          fontFamily: FONT,
          fontSize: 22,
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.2,
        },
      },
    ],
  },
  {
    id: "card",
    label: "Thẻ tiêu đề",
    category: "combo",
    build: ({ x, y }) => [
      {
        kind: "shape",
        shapeKind: "rectangle",
        name: "Nền thẻ",
        x,
        y,
        width: 480,
        height: 260,
        text: "",
        textRuns: [],
        style: { fill: "#f1f5f9", borderRadius: 24 },
      },
      {
        kind: "text",
        name: "Tiêu đề thẻ",
        x: x + 36,
        y: y + 40,
        width: 408,
        height: 64,
        text: "Tiêu đề thẻ",
        textRuns: [],
        style: { fontFamily: FONT, fontSize: 40, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 },
      },
      {
        kind: "text",
        name: "Mô tả thẻ",
        x: x + 36,
        y: y + 120,
        width: 408,
        height: 96,
        text: "Mô tả ngắn gọn cho thẻ nội dung của bạn.",
        textRuns: [],
        style: { fontFamily: FONT, fontSize: 20, fontWeight: 400, color: "#475569", lineHeight: 1.5 },
      },
    ],
  },
  {
    id: "divider-line",
    label: "Vạch ngăn",
    category: "shape",
    build: ({ x, y }) => [
      {
        kind: "shape",
        shapeKind: "divider",
        name: "Vạch ngăn",
        x,
        y,
        width: 360,
        height: 8,
        text: "",
        textRuns: [],
        style: { fill: "#0f172a", borderRadius: 9999 },
      },
    ],
  },
  {
    id: "star-accent",
    label: "Ngôi sao",
    category: "shape",
    build: ({ x, y }) => [
      {
        kind: "shape",
        shapeKind: "star",
        name: "Ngôi sao",
        x,
        y,
        width: 160,
        height: 160,
        text: "",
        textRuns: [],
        style: { fill: "#facc15" },
      },
    ],
  },
];
