// Zustand store cho job hiện tại trong Generate screen

import { create } from "zustand";
import type { GenerationJob } from "@/models";

interface JobStore {
  currentJob: GenerationJob | null;
  setJob: (j: GenerationJob | null) => void;
  toggleSelected: (pageIndex: number) => void;
  setSelectedAll: (val: boolean) => void;
  updatePage: (pageIndex: number, updater: (p: GenerationJob["pages"][number]) => GenerationJob["pages"][number]) => void;
}

export const useJobStore = create<JobStore>((set) => ({
  currentJob: null,
  setJob: (j) => set({ currentJob: j }),
  toggleSelected: (pageIndex) =>
    set((s) => {
      if (!s.currentJob) return s;
      const pages = s.currentJob.pages.map((p, i) =>
        i === pageIndex ? { ...p, selected: !p.selected } : p,
      );
      return { currentJob: { ...s.currentJob, pages } };
    }),
  setSelectedAll: (val) =>
    set((s) => {
      if (!s.currentJob) return s;
      const pages = s.currentJob.pages.map((p) => ({ ...p, selected: val }));
      return { currentJob: { ...s.currentJob, pages } };
    }),
  updatePage: (pageIndex, updater) =>
    set((s) => {
      if (!s.currentJob) return s;
      const pages = s.currentJob.pages.map((p, i) => (i === pageIndex ? updater(p) : p));
      return { currentJob: { ...s.currentJob, pages } };
    }),
}));
