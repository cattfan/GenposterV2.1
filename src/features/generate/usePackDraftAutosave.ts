// src/features/generate/usePackDraftAutosave.ts
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { db } from "@/storage/db";
import type { PackDraftState, PageTemplate } from "@/models";

const DEBOUNCE_MS = 500;

interface Params {
  packTemplateId: string | undefined;
  packOv: PackDraftState["packOv"];
  previewPageDrafts: Record<string, PageTemplate>;
}

interface Snapshot {
  packTemplateId: string | undefined;
  packOv: PackDraftState["packOv"];
  previewPageDrafts: Record<string, PageTemplate>;
}

/**
 * Persist pack workspace state vào backend `pack_drafts`. Debounce 500ms
 * và flush lúc unmount để dashboard luôn đọc được snapshot mới.
 *
 * Implementation note: timer được giữ nguyên qua các lần re-render. Khi
 * deps đổi, ta KHÔNG flush ngay — vì spec yêu cầu nhiều thay đổi liên
 * tiếp phải gộp thành 1 lần save sau 500ms. `latestRef` luôn cập nhật
 * snapshot mới nhất; khi timer firing nó đọc `latestRef`. Cleanup chỉ
 * thực sự flush ở unmount (qua effect riêng, deps `[]`).
 */
export function usePackDraftAutosave(params: Params) {
  const { packTemplateId, packOv, previewPageDrafts } = params;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<Snapshot>({ packTemplateId, packOv, previewPageDrafts });
  const lastSavedSignatureRef = useRef("");

  // Update latest snapshot every render so timer + unmount-cleanup pick up
  // the freshest values without rescheduling.
  latestRef.current = { packTemplateId, packOv, previewPageDrafts };

  useEffect(() => {
    if (!packTemplateId) return;

    const signature = JSON.stringify({ packOv, previewPageDrafts });
    if (signature === lastSavedSignatureRef.current) return;

    // Debounce: nếu timer đã được schedule trước đó, để nó tiếp tục chạy.
    // Khi firing nó sẽ đọc snapshot mới nhất từ latestRef.
    if (timerRef.current !== null) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushSnapshot(latestRef.current, lastSavedSignatureRef);
    }, DEBOUNCE_MS);
  }, [packTemplateId, packOv, previewPageDrafts]);

  // Unmount-only flush — đảm bảo điều hướng khỏi /generate không mất
  // những thay đổi đang chờ debounce.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void flushSnapshot(latestRef.current, lastSavedSignatureRef);
    };
  }, []);
}

function flushSnapshot(
  snapshot: Snapshot,
  lastSavedSignatureRef: MutableRefObject<string>,
): Promise<void> {
  if (!snapshot.packTemplateId) return Promise.resolve();
  const sig = JSON.stringify({
    packOv: snapshot.packOv,
    previewPageDrafts: snapshot.previewPageDrafts,
  });
  if (sig === lastSavedSignatureRef.current) return Promise.resolve();
  lastSavedSignatureRef.current = sig;
  const now = Date.now();
  return Promise.resolve(
    db.packDrafts.put({
      packTemplateId: snapshot.packTemplateId,
      packOv: snapshot.packOv,
      previewPageDrafts: snapshot.previewPageDrafts,
      lastOpenedAt: now,
      updatedAt: now,
    }),
  ).then(() => undefined);
}
