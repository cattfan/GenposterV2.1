import { useEffect, useRef, useState } from "react";
import { saveSettings } from "@/storage/settings";
import type { AppSettings } from "@/models";

const DEBOUNCE_MS = 400;

export interface AutosaveStatus {
  state: "idle" | "saving" | "saved" | "error";
  lastSavedAt: number | null;
  errorMessage?: string;
}

/**
 * Persist `AppSettings` to backend `db.settings` qua `saveSettings()`. Debounce
 * 400ms để gộp nhiều thay đổi rapid + flush on unmount để rời trang không mất.
 */
export function useSettingsAutosave(settings: AppSettings | null): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>({
    state: "idle",
    lastSavedAt: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<AppSettings | null>(settings);
  const lastSavedSignatureRef = useRef<string>("");

  latestRef.current = settings;

  useEffect(() => {
    if (!settings) return;
    const signature = JSON.stringify(settings);
    // Lần đầu nhận settings (load từ DB) — seed signature, không save.
    if (lastSavedSignatureRef.current === "") {
      lastSavedSignatureRef.current = signature;
      return;
    }
    if (signature === lastSavedSignatureRef.current) return;
    if (timerRef.current !== null) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush(latestRef, lastSavedSignatureRef, setStatus);
    }, DEBOUNCE_MS);
  }, [settings]);

  // Unmount-only flush.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void flush(latestRef, lastSavedSignatureRef, setStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}

async function flush(
  latestRef: React.MutableRefObject<AppSettings | null>,
  lastSavedSignatureRef: React.MutableRefObject<string>,
  setStatus: (s: AutosaveStatus) => void,
): Promise<void> {
  const snapshot = latestRef.current;
  if (!snapshot) return;
  const sig = JSON.stringify(snapshot);
  if (sig === lastSavedSignatureRef.current) return;
  setStatus({ state: "saving", lastSavedAt: null });
  try {
    await saveSettings(snapshot);
    lastSavedSignatureRef.current = sig;
    setStatus({ state: "saved", lastSavedAt: Date.now() });
  } catch (err) {
    setStatus({
      state: "error",
      lastSavedAt: null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}
