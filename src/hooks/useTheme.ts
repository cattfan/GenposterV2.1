// Lightweight theme hook: toggles `.dark` on <html> and persists the choice in
// localStorage. Respects the `prefers-color-scheme` media query the first time.

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "cpg_theme_mode";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function applyThemeClass(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const effective = mode === "system" ? getSystemTheme() : mode;
  const root = document.documentElement;
  if (effective === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.dataset.theme = effective;
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setModeState(readStoredMode());
    setHydrated(true);
  }, []);

  // Apply on mount and whenever mode changes.
  useEffect(() => {
    if (!hydrated) return;
    applyThemeClass(mode);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [hydrated, mode]);

  // When mode is "system", re-apply when the OS preference changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeClass("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);

  const toggle = useCallback(() => {
    setModeState((current) => {
      if (current === "dark") return "light";
      if (current === "light") return "dark";
      // system → flip to opposite of current effective theme
      return getSystemTheme() === "dark" ? "light" : "dark";
    });
  }, []);

  return {
    mode,
    setMode,
    toggle,
    effective:
      typeof document === "undefined"
        ? mode === "dark"
          ? "dark"
          : "light"
        : document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
  } as const;
}

/**
 * Module-level initializer that applies the persisted theme as early as
 * possible (before React mounts) to avoid a light→dark flash on reload.
 * Call once in the app entry / AppShell mount effect.
 */
export function initThemeOnce() {
  if (typeof document === "undefined") return;
  // Already applied?
  if (document.documentElement.dataset.theme) return;
  applyThemeClass(readStoredMode());
}
