import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "good" | "warning" | "danger";
type ChipKey = "data" | "images" | "templates" | "ai";

const TONE_CHIP: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
};

const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

interface ChipProps {
  data: {
    tone: Tone;
    total: number;
    activeEntities: number;
    partnerEntities: number;
    sheetCount: number;
  };
  images: {
    tone: Tone;
    total: number;
    localAssets: number;
    linkAssets: number;
    missing: number;
  };
  templates: {
    tone: Tone;
    packs: number;
    pages: number;
    mappedSlots: number;
    totalSlots: number;
    presetCount: number;
  };
  ai: { tone: Tone; configured: boolean; baseUrl?: string; model?: string };
}

export function HealthChipRow(props: ChipProps) {
  const [open, setOpen] = useState<ChipKey | null>(null);

  const chip = (key: ChipKey, tone: Tone, label: string, summary: string) => (
    <button
      type="button"
      onClick={() => setOpen((current) => (current === key ? null : key))}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition",
        TONE_CHIP[tone],
        open === key && "ring-2 ring-offset-1 ring-current",
      )}
      aria-expanded={open === key}
    >
      <span className={cn("inline-block size-1.5 rounded-full", TONE_DOT[tone])} />
      <span className="font-semibold">{label}</span>
      <span className="opacity-80">{summary}</span>
    </button>
  );

  return (
    <section aria-label="Sức khoẻ hệ thống" className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Sức khoẻ
      </div>
      <div className="flex flex-wrap gap-2">
        {chip(
          "data",
          props.data.tone,
          "Dữ liệu",
          `${props.data.total} dòng · ${props.data.sheetCount} bảng`,
        )}
        {chip(
          "images",
          props.images.tone,
          "Ảnh",
          props.images.missing > 0
            ? `${props.images.missing} thiếu`
            : `${props.images.total} ảnh`,
        )}
        {chip(
          "templates",
          props.templates.tone,
          "Khuôn",
          `${props.templates.packs} pack`,
        )}
        {chip("ai", props.ai.tone, "AI", props.ai.configured ? "OK" : "chưa cấu hình")}
      </div>
      {open && (
        <div className="rounded-lg border bg-card p-3">
          {open === "data" && (
            <DetailGrid
              cells={[
                ["Tổng dòng", props.data.total],
                ["Đang dùng", props.data.activeEntities],
                ["Đối tác", props.data.partnerEntities],
                ["Bảng", props.data.sheetCount],
              ]}
              actionTo="/data"
              actionLabel="Mở dữ liệu"
            />
          )}
          {open === "images" && (
            <DetailGrid
              cells={[
                ["Tổng ảnh", props.images.total],
                ["Trong máy", props.images.localAssets],
                ["Link", props.images.linkAssets],
                [
                  "Thiếu",
                  props.images.missing,
                  props.images.missing > 0 ? "danger" : undefined,
                ],
              ]}
              actionTo="/data"
              actionSearch={{ tab: "images" }}
              actionLabel="Mở ảnh"
            />
          )}
          {open === "templates" && (
            <DetailGrid
              cells={[
                ["Bộ khuôn", props.templates.packs],
                ["Trang", props.templates.pages],
                [
                  "Ô đã gắn",
                  `${props.templates.mappedSlots}/${props.templates.totalSlots}`,
                ],
                ["Khuôn đổ", props.templates.presetCount],
              ]}
              actionTo="/templates"
              actionLabel="Mở khuôn"
            />
          )}
          {open === "ai" && (
            <DetailGrid
              cells={[
                ["Trạng thái", props.ai.configured ? "OK" : "Chưa cấu hình"],
                ["baseUrl", props.ai.baseUrl ?? "—"],
                ["model", props.ai.model ?? "—"],
              ]}
              actionTo="/settings"
              actionLabel="Mở cài đặt"
            />
          )}
        </div>
      )}
    </section>
  );
}

function DetailGrid({
  cells,
  actionTo,
  actionLabel,
  actionSearch,
}: {
  cells: Array<[string, string | number, "danger"?]>;
  actionTo: string;
  actionLabel: string;
  actionSearch?: { tab: "images" };
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map(([label, value, tone]) => (
          <div key={label}>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div
              className={cn(
                "mt-0.5 text-sm font-semibold tabular-nums",
                tone === "danger" && "text-rose-600 dark:text-rose-300",
              )}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button asChild variant="outline" size="sm">
          <Link to={actionTo} search={actionSearch as never}>
            {actionLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}
