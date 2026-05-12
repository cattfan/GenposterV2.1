import { createRoot } from "react-dom/client";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import { toJpeg, toPng, toSvg } from "html-to-image";
import type { DesignDocument, DesignElement, DesignPage } from "@/models";
import { DesignRenderer } from "./DesignRenderer";
import { downloadJSON } from "@/features/render/exportPng";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForNodeToSettle(node: HTMLElement) {
  await nextFrame();
  await nextFrame();
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;

  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  );
}

async function renderPageNode(page: DesignPage, elements: DesignElement[]) {
  const mount = document.createElement("div");
  mount.style.position = "fixed";
  mount.style.left = "-20000px";
  mount.style.top = "0";
  document.body.appendChild(mount);
  const root = createRoot(mount);
  root.render(<DesignRenderer page={page} elements={elements} />);
  await nextFrame();
  const node = mount.firstElementChild as HTMLElement | null;
  if (!node) {
    root.unmount();
    mount.remove();
    throw new Error("Không render được design page");
  }
  await waitForNodeToSettle(node);
  return {
    node,
    cleanup: () => {
      root.unmount();
      mount.remove();
    },
  };
}

function pageElements(document: DesignDocument, pageId: string) {
  return document.elements.filter((element) => element.pageId === pageId);
}

export async function exportDesignPagePng(params: {
  document: DesignDocument;
  pageId?: string;
  fileName?: string;
  scale?: number;
}) {
  const page =
    params.document.pages.find((item) => item.pageId === params.pageId) ??
    params.document.pages.find((item) => item.pageId === params.document.activePageId) ??
    params.document.pages[0];
  if (!page) throw new Error("Document không có page");
  const { node, cleanup } = await renderPageNode(page, pageElements(params.document, page.pageId));
  try {
    const dataUrl = await toPng(node, {
      pixelRatio: params.scale ?? 2,
      cacheBust: true,
      skipFonts: false,
    });
    const blob = await fetch(dataUrl).then((response) => response.blob());
    saveAs(
      blob,
      `${params.fileName ?? `${slugify(params.document.name)}-${slugify(page.name) || "page"}`}.png`,
    );
  } finally {
    cleanup();
  }
}

export async function exportDesignPageJpg(params: {
  document: DesignDocument;
  pageId?: string;
  fileName?: string;
  scale?: number;
  quality?: number;
}) {
  const page =
    params.document.pages.find((item) => item.pageId === params.pageId) ??
    params.document.pages.find((item) => item.pageId === params.document.activePageId) ??
    params.document.pages[0];
  if (!page) throw new Error("Document không có page");
  const { node, cleanup } = await renderPageNode(page, pageElements(params.document, page.pageId));
  try {
    const dataUrl = await toJpeg(node, {
      pixelRatio: params.scale ?? 2,
      quality: params.quality ?? 0.92,
      cacheBust: true,
      skipFonts: false,
    });
    const blob = await fetch(dataUrl).then((response) => response.blob());
    saveAs(
      blob,
      `${params.fileName ?? `${slugify(params.document.name)}-${slugify(page.name) || "page"}`}.jpg`,
    );
  } finally {
    cleanup();
  }
}

export async function exportDesignPageSvg(params: {
  document: DesignDocument;
  pageId?: string;
  fileName?: string;
}) {
  const page =
    params.document.pages.find((item) => item.pageId === params.pageId) ??
    params.document.pages.find((item) => item.pageId === params.document.activePageId) ??
    params.document.pages[0];
  if (!page) throw new Error("Document không có page");
  const { node, cleanup } = await renderPageNode(page, pageElements(params.document, page.pageId));
  try {
    const dataUrl = await toSvg(node, {
      cacheBust: true,
      skipFonts: false,
    });
    const svgText = await fetch(dataUrl).then((response) => response.text());
    saveAs(
      new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }),
      `${params.fileName ?? `${slugify(params.document.name)}-${slugify(page.name) || "page"}`}.svg`,
    );
  } finally {
    cleanup();
  }
}

export async function exportDesignDocumentPdf(params: {
  document: DesignDocument;
  fileName?: string;
  scale?: number;
}) {
  const pdf = await PDFDocument.create();
  for (const page of params.document.pages) {
    const { node, cleanup } = await renderPageNode(
      page,
      pageElements(params.document, page.pageId),
    );
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: params.scale ?? 2,
        cacheBust: true,
        skipFonts: false,
      });
      const bytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
      const image = await pdf.embedPng(bytes);
      const pdfPage = pdf.addPage([page.width, page.height]);
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: page.width,
        height: page.height,
      });
    } finally {
      cleanup();
    }
  }
  const pdfBytes = await pdf.save();
  const pdfBlobPart = new Uint8Array(pdfBytes).buffer as ArrayBuffer;
  saveAs(
    new Blob([pdfBlobPart], { type: "application/pdf" }),
    `${(params.fileName ?? slugify(params.document.name)) || "design-document"}.pdf`,
  );
}

export function exportDesignDocumentJson(document: DesignDocument, fileName?: string) {
  downloadJSON(document, `${(fileName ?? slugify(document.name)) || "design-document"}.json`);
}


// ─── Symbol thumbnail rendering ─────────────────────────────────────────────
/**
 * Render a bundle of DesignElements (symbol definition) off-screen and return
 * a PNG data URL suitable for <img src>. Elements are expected to already be
 * normalised to origin (0,0) via sanitizeAndCaptureBounds.
 */
export async function renderSymbolThumbnail(params: {
  elements: DesignElement[];
  width: number;
  height: number;
  maxEdge?: number;
}): Promise<string | undefined> {
  if (typeof document === "undefined") return undefined;
  if (params.width <= 0 || params.height <= 0 || params.elements.length === 0) return undefined;

  const maxEdge = params.maxEdge ?? 320;
  const pixelRatio = Math.min(2, Math.max(1, maxEdge / Math.max(params.width, params.height)));

  // Synthesize a throwaway page that wraps the symbol's bounding box.
  const fakePageId = "symbol-thumbnail";
  const pageElements: DesignElement[] = params.elements.map((element) => ({
    ...element,
    pageId: fakePageId,
  }));
  const page: DesignPage = {
    pageId: fakePageId,
    name: "symbol",
    width: params.width,
    height: params.height,
    background: "transparent",
    guides: [],
  };

  const { node, cleanup } = await renderPageNode(page, pageElements);
  try {
    const dataUrl = await toPng(node, {
      pixelRatio,
      cacheBust: true,
      skipFonts: false,
      backgroundColor: undefined,
    });
    return dataUrl;
  } catch {
    return undefined;
  } finally {
    cleanup();
  }
}
