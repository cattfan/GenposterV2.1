# Settings Redesign Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi `/settings` thành sidebar 5 mục + autosave + search; expose theme/drive/caption + thêm generate defaults.

**Architecture:** Pure presentational sections + `useSettingsAutosave` debounced 400ms + static search index. Theme đồng bộ giữa `AppSettings.theme` và `useTheme` localStorage.

**Tech Stack:** React 18, TanStack Router, vitest + jsdom, shadcn/ui, lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-21-settings-redesign-design.md](../specs/2026-05-21-settings-redesign-design.md)

---

## File structure

| File | Trạng thái |
|------|-----------|
| `src/routes/settings.tsx` | Replace |
| `src/features/settings/SettingsSidebar.tsx` | Create |
| `src/features/settings/useSettingsSearch.ts` | Create |
| `src/features/settings/useSettingsAutosave.ts` | Create |
| `src/features/settings/sections/GeneralSection.tsx` | Create |
| `src/features/settings/sections/AISection.tsx` | Create |
| `src/features/settings/sections/BackupSection.tsx` | Create |
| `src/features/settings/sections/DataSection.tsx` | Create |
| `src/features/settings/sections/AdvancedSection.tsx` | Create |
| `src/lib/settingsSearchIndex.ts` | Create |
| `src/models/index.ts` | Modify |
| `src/storage/settings.ts` | Modify |
| `src/hooks/useTheme.ts` | Modify |

---

## Task 1: Model + defaults

**Files:** `src/models/index.ts`, `src/storage/settings.ts`

- [ ] Modify `AppSettings.theme` to `"light" | "dark" | "system"`. Add `GenerateDefaults` interface and optional `generateDefaults` field on `AppSettings`.
- [ ] Update `DEFAULTS` in `src/storage/settings.ts`: `theme: "system"`, `generateDefaults: { maxEntities: 5, prioritizePartner: true, onlyPartner: false, partnerQuotaPerPage: 1 }`.
- [ ] Run `npx tsc --noEmit`. Expect 0 errors (existing `theme: "light" | "dark"` callsites must accept `"system"` — verify).
- [ ] Commit: `feat(settings): extend AppSettings with system theme and generate defaults`.

---

## Task 2: useSettingsAutosave hook (TDD)

**Files:** `src/features/settings/useSettingsAutosave.ts`, `.test.ts`

- [ ] Write failing tests (vitest, `// @vitest-environment jsdom`):
  - debounces multiple rapid changes into one `saveSettings` call after 400ms
  - skips save when settings is null
  - skips save when signature unchanged from last save
  - flushes pending save on unmount

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettingsAutosave } from "./useSettingsAutosave";
import type { AppSettings } from "@/models";

const saveMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/storage/settings", () => ({
  saveSettings: (...args: unknown[]) => saveMock(...args),
}));

const base: AppSettings = {
  language: "vi",
  captionProvider: "local",
  exportScale: 2,
  defaultCanvas: { width: 1588, height: 2248, background: "#fff" },
  theme: "system",
};

describe("useSettingsAutosave", () => {
  beforeEach(() => { vi.useFakeTimers(); saveMock.mockClear(); });
  afterEach(() => vi.useRealTimers());

  it("debounces saves to 400ms", async () => {
    const { rerender } = renderHook(
      ({ s }: { s: AppSettings | null }) => useSettingsAutosave(s),
      { initialProps: { s: base } as { s: AppSettings | null } },
    );
    rerender({ s: { ...base, exportScale: 3 } });
    rerender({ s: { ...base, exportScale: 4 } });

    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0]![0].exportScale).toBe(4);
  });

  it("skips save when settings is null", async () => {
    renderHook(() => useSettingsAutosave(null));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("skips save when signature unchanged", async () => {
    const { rerender } = renderHook(
      ({ s }: { s: AppSettings | null }) => useSettingsAutosave(s),
      { initialProps: { s: base } as { s: AppSettings | null } },
    );
    rerender({ s: { ...base } });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("flushes pending save on unmount", async () => {
    const { rerender, unmount } = renderHook(
      ({ s }: { s: AppSettings | null }) => useSettingsAutosave(s),
      { initialProps: { s: base } as { s: AppSettings | null } },
    );
    rerender({ s: { ...base, exportScale: 9 } });
    unmount();
    await Promise.resolve();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] Implement hook (mirror `usePackDraftAutosave` pattern):

```ts
import { useEffect, useRef, useState } from "react";
import { saveSettings } from "@/storage/settings";
import type { AppSettings } from "@/models";

const DEBOUNCE_MS = 400;

export interface AutosaveStatus {
  state: "idle" | "saving" | "saved" | "error";
  lastSavedAt: number | null;
  errorMessage?: string;
}

export function useSettingsAutosave(settings: AppSettings | null): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>({ state: "idle", lastSavedAt: null });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<AppSettings | null>(settings);
  const lastSavedSignatureRef = useRef<string>("");

  latestRef.current = settings;

  useEffect(() => {
    if (!settings) return;
    const signature = JSON.stringify(settings);
    if (signature === lastSavedSignatureRef.current) return;
    if (timerRef.current !== null) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, DEBOUNCE_MS);
  }, [settings]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flush() {
    const snapshot = latestRef.current;
    if (!snapshot) return;
    const sig = JSON.stringify(snapshot);
    if (sig === lastSavedSignatureRef.current) return;
    setStatus((s) => ({ ...s, state: "saving" }));
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

  return status;
}
```

- [ ] Run: `npx vitest run src/features/settings/useSettingsAutosave.test.ts` — 4/4 pass.
- [ ] Commit: `feat(settings): add debounced settings autosave hook`.

---

## Task 3: Search index + useSettingsSearch hook

**Files:** `src/lib/settingsSearchIndex.ts`, `src/lib/settingsSearchIndex.test.ts`, `src/features/settings/useSettingsSearch.ts`

- [ ] Create `settingsSearchIndex.ts` with the 16 entries from spec.
- [ ] Create `useSettingsSearch.ts`:

```ts
import { useMemo } from "react";
import { SETTINGS_SEARCH_INDEX, type SearchEntry, type SectionId } from "@/lib/settingsSearchIndex";

export interface SearchResult {
  matches: SearchEntry[];
  primarySectionId: SectionId | null;
  matchCounts: Partial<Record<SectionId, number>>;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function useSettingsSearch(query: string): SearchResult {
  return useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return { matches: [], primarySectionId: null, matchCounts: {} };
    const tokens = normalize(trimmed).split(/\s+/).filter(Boolean);
    const matches = SETTINGS_SEARCH_INDEX.filter((entry) => {
      const hay = normalize([entry.label, ...entry.keywords].join(" "));
      return tokens.every((tok) => hay.includes(tok));
    });
    const counts: Partial<Record<SectionId, number>> = {};
    for (const m of matches) counts[m.sectionId] = (counts[m.sectionId] ?? 0) + 1;
    return { matches, primarySectionId: matches[0]?.sectionId ?? null, matchCounts: counts };
  }, [query]);
}
```

- [ ] Test (`settingsSearchIndex.test.ts`): empty query → no match; "model" → AI/model + AI/visionModel; "drive" → general/drive; "khong-co" → no match.
- [ ] Run vitest. Commit: `feat(settings): add search index and useSettingsSearch hook`.

---

## Task 4: SettingsSidebar component

**Files:** `src/features/settings/SettingsSidebar.tsx`

- [ ] Create:

```tsx
import { Settings as SettingsIcon, Bot, Archive, AlertTriangle, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionId } from "@/lib/settingsSearchIndex";
import type { AutosaveStatus } from "./useSettingsAutosave";

const ITEMS: Array<{ id: SectionId; label: string; icon: typeof SettingsIcon }> = [
  { id: "general", label: "Chung", icon: SettingsIcon },
  { id: "ai", label: "AI", icon: Bot },
  { id: "backup", label: "Sao lưu", icon: Archive },
  { id: "data", label: "Dữ liệu", icon: AlertTriangle },
  { id: "advanced", label: "Nâng cao", icon: Sliders },
];

interface Props {
  activeId: SectionId;
  onChange: (id: SectionId) => void;
  saveStatus: AutosaveStatus["state"];
  matchCounts?: Partial<Record<SectionId, number>>;
}

export function SettingsSidebar({ activeId, onChange, saveStatus, matchCounts }: Props) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const count = matchCounts?.[item.id] ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeId === item.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
              item.id === "data" && activeId !== item.id && "text-rose-600 dark:text-rose-400",
            )}
            aria-current={activeId === item.id ? "page" : undefined}
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4" />
              {item.label}
            </span>
            {count > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">{count}</span>
            )}
          </button>
        );
      })}
      <div className="mt-3 px-3 text-[11px] text-muted-foreground">
        {saveStatus === "saving" && "Đang lưu..."}
        {saveStatus === "saved" && "Đã lưu"}
        {saveStatus === "error" && <span className="text-rose-600">Lỗi lưu</span>}
        {saveStatus === "idle" && "Sẵn sàng"}
      </div>
    </nav>
  );
}
```

- [ ] tsc clean. Commit: `feat(settings): add sidebar with status indicator`.

---

## Task 5: Section components

**Files:** 5 files under `src/features/settings/sections/`

Each section is a pure component with shared props:

```ts
interface SectionProps {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  searchHighlightFieldId?: string;
}
```

- [ ] **GeneralSection.tsx** — theme radio (sync `useTheme.setMode`), language read-only, canvas inputs, drive folder URL input.
- [ ] **AISection.tsx** — copy logic AI từ `settings.tsx` cũ (preset dropdown / baseUrl / model / visionModel / apiKey + show-hide toggle / Test button + result). Move state local.
- [ ] **BackupSection.tsx** — copy nguyên flow backup (3 chip phạm vi / switch include images / export button / file picker / AlertDialog merge/replace).
- [ ] **DataSection.tsx** — banner cảnh báo + 4 row destructive (clearImportedImages / clearImportedData / clearAllLocalData / clearAllTemplates) + dialog confirm + undo toast 15s. Logic copy nguyên.
- [ ] **AdvancedSection.tsx** — generateDefaults: maxEntities (number), prioritizePartner/onlyPartner (Switch), partnerQuotaPerPage (number); captionProvider select.
- [ ] tsc clean. Commit (5 commit hoặc 1 commit gộp).

---

## Task 6: Replace `src/routes/settings.tsx`

**Files:** `src/routes/settings.tsx`

- [ ] Replace contents:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { Settings as SettingsIcon } from "lucide-react";
import { getSettings } from "@/storage/settings";
import { defaultAiConfig } from "@/features/ai/aiClient";
import type { AppSettings } from "@/models";
import { SettingsSidebar } from "@/features/settings/SettingsSidebar";
import { useSettingsAutosave } from "@/features/settings/useSettingsAutosave";
import { useSettingsSearch } from "@/features/settings/useSettingsSearch";
import type { SectionId } from "@/lib/settingsSearchIndex";
import { GeneralSection } from "@/features/settings/sections/GeneralSection";
import { AISection } from "@/features/settings/sections/AISection";
import { BackupSection } from "@/features/settings/sections/BackupSection";
import { DataSection } from "@/features/settings/sections/DataSection";
import { AdvancedSection } from "@/features/settings/sections/AdvancedSection";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeId, setActiveId] = useState<SectionId>("general");
  const [query, setQuery] = useState("");
  const search = useSettingsSearch(query);
  const status = useSettingsAutosave(settings);

  useEffect(() => {
    void getSettings().then((s) => {
      if (!s.ai) s.ai = defaultAiConfig("deepseek");
      setSettings(s);
    });
  }, []);

  useEffect(() => {
    if (search.primarySectionId && search.primarySectionId !== activeId) {
      setActiveId(search.primarySectionId);
    }
  }, [search.primarySectionId]);

  if (!settings) {
    return (
      <PageContainer className="max-w-5xl">
        <PageHeader icon={<SettingsIcon className="size-5" />} title="Cài đặt" description="Đang tải..." />
      </PageContainer>
    );
  }

  const update = (patch: Partial<AppSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));
  const highlight = search.matches.find((m) => m.sectionId === activeId)?.fieldId;

  return (
    <PageContainer className="max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <PageHeader
          icon={<SettingsIcon className="size-5" />}
          title="Cài đặt"
          description="Cấu hình AI, sao lưu, dữ liệu local và các tuỳ chọn khác."
        />
        <div className="relative w-full md:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm cài đặt..."
            className="pl-9"
            aria-label="Tìm cài đặt"
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <aside className="md:sticky md:top-4 md:self-start">
          <SettingsSidebar
            activeId={activeId}
            onChange={setActiveId}
            saveStatus={status.state}
            matchCounts={search.matchCounts}
          />
        </aside>

        <main className="min-w-0 space-y-6">
          {activeId === "general" && <GeneralSection settings={settings} update={update} searchHighlightFieldId={highlight} />}
          {activeId === "ai" && <AISection settings={settings} update={update} searchHighlightFieldId={highlight} />}
          {activeId === "backup" && <BackupSection />}
          {activeId === "data" && <DataSection />}
          {activeId === "advanced" && <AdvancedSection settings={settings} update={update} searchHighlightFieldId={highlight} />}
        </main>
      </div>
    </PageContainer>
  );
}
```

- [ ] Run `npx tsc --noEmit && npm test`. Fix any error. Commit: `feat(settings): redesign /settings as sidebar layout with autosave`.

---

## Task 7: Theme integration

**Files:** `src/hooks/useTheme.ts`, `src/features/settings/sections/GeneralSection.tsx`

- [ ] Modify `useTheme.ts` so `readStoredMode()` falls back to `AppSettings.theme` when localStorage is empty. Async — accept eventual consistency: hook stays with localStorage as primary, but if localStorage has no key, read settings DB once at init.
- [ ] In GeneralSection, theme onChange → `setMode(value)` AND `update({theme: value})`. Settings autosave handles persistence.
- [ ] Commit: `feat(settings): sync theme between AppSettings and useTheme`.

---

## Task 8: Verify

- [ ] `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.
- [ ] Manual smoke: 5 sidebar mục, theme đổi tức thì, search "model" highlight, autosave badge, destructive dialog + undo toast 15s.
- [ ] Push: `git push origin main`.
- [ ] Commit: `feat(settings): redesign documentation` if any doc fix needed.