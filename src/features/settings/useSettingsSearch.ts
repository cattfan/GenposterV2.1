import { useMemo } from "react";
import {
  SETTINGS_SEARCH_INDEX,
  type SearchEntry,
  type SectionId,
} from "@/lib/settingsSearchIndex";

export interface SearchResult {
  matches: SearchEntry[];
  primarySectionId: SectionId | null;
  matchCounts: Partial<Record<SectionId, number>>;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Lọc search index theo query. Tách query thành tokens; mỗi token phải xuất
 * hiện trong (label OR keywords). Vietnamese diacritics được normalize trước
 * khi so khớp để user gõ "khuon" hay "khuôn" đều ra cùng kết quả.
 */
export function useSettingsSearch(query: string): SearchResult {
  return useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return { matches: [], primarySectionId: null, matchCounts: {} };
    }
    const tokens = normalize(trimmed).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return { matches: [], primarySectionId: null, matchCounts: {} };
    }
    const matches = SETTINGS_SEARCH_INDEX.filter((entry) => {
      const haystack = normalize([entry.label, ...entry.keywords].join(" "));
      return tokens.every((token) => haystack.includes(token));
    });
    const counts: Partial<Record<SectionId, number>> = {};
    for (const m of matches) {
      counts[m.sectionId] = (counts[m.sectionId] ?? 0) + 1;
    }
    return {
      matches: [...matches],
      primarySectionId: matches[0]?.sectionId ?? null,
      matchCounts: counts,
    };
  }, [query]);
}
