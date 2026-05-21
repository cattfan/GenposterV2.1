import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Settings as SettingsIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageContainer, PageHeader } from "@/components/PageHeader";
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

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

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

  // Auto-jump to first matching section on search.
  useEffect(() => {
    if (search.primarySectionId && search.primarySectionId !== activeId) {
      setActiveId(search.primarySectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.primarySectionId]);

  if (!settings) {
    return (
      <PageContainer className="max-w-5xl">
        <PageHeader
          icon={<SettingsIcon className="size-5" />}
          title="Cài đặt"
          description="Đang tải..."
        />
      </PageContainer>
    );
  }

  const update = (patch: Partial<AppSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));
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

      {/* Mobile section picker */}
      <div className="md:hidden">
        <select
          value={activeId}
          onChange={(e) => setActiveId(e.target.value as SectionId)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="Chuyển mục"
        >
          <option value="general">Chung</option>
          <option value="ai">AI</option>
          <option value="backup">Sao lưu</option>
          <option value="data">Dữ liệu</option>
          <option value="advanced">Nâng cao</option>
        </select>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <aside className="hidden md:block md:sticky md:top-4 md:self-start">
          <SettingsSidebar
            activeId={activeId}
            onChange={setActiveId}
            saveStatus={status.state}
            matchCounts={search.matchCounts}
          />
        </aside>

        <main className="min-w-0 space-y-6">
          {activeId === "general" && (
            <GeneralSection settings={settings} update={update} searchHighlightFieldId={highlight} />
          )}
          {activeId === "ai" && (
            <AISection settings={settings} update={update} searchHighlightFieldId={highlight} />
          )}
          {activeId === "backup" && <BackupSection />}
          {activeId === "data" && <DataSection />}
          {activeId === "advanced" && (
            <AdvancedSection
              settings={settings}
              update={update}
              searchHighlightFieldId={highlight}
            />
          )}
        </main>
      </div>
    </PageContainer>
  );
}
