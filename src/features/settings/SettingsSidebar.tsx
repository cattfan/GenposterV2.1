import {
  Settings as SettingsIcon,
  Bot,
  Archive,
  AlertTriangle,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionId } from "@/lib/settingsSearchIndex";
import type { AutosaveStatus } from "./useSettingsAutosave";

const ITEMS: Array<{
  id: SectionId;
  label: string;
  icon: typeof SettingsIcon;
  danger?: boolean;
}> = [
  { id: "general", label: "Chung", icon: SettingsIcon },
  { id: "ai", label: "AI", icon: Bot },
  { id: "backup", label: "Sao lưu", icon: Archive },
  { id: "data", label: "Dữ liệu", icon: AlertTriangle, danger: true },
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
        const active = activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              !active && item.danger && "text-rose-600 dark:text-rose-400",
            )}
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4" />
              {item.label}
            </span>
            {count > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                {count}
              </span>
            )}
          </button>
        );
      })}
      <SaveStatusLine status={saveStatus} />
    </nav>
  );
}

function SaveStatusLine({ status }: { status: AutosaveStatus["state"] }) {
  let text = "";
  let tone = "text-muted-foreground";
  if (status === "saving") text = "Đang lưu...";
  else if (status === "saved") text = "Đã lưu";
  else if (status === "error") {
    text = "Lỗi lưu";
    tone = "text-rose-600 dark:text-rose-400";
  } else text = "Sẵn sàng";
  return <div className={cn("mt-3 px-3 text-[11px]", tone)}>{text}</div>;
}
