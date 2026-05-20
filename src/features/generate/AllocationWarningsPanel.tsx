// Hiển thị warning từ allocateEntityBindingsForTemplate trên trang Tạo nội dung.
// Allocator trả mảng string warning thô khi pool entity không đủ partner cho
// quota hoặc không đủ entity tổng. Component này phân loại + format VN +
// cho phép user dismiss khỏi UI (không persist; reload lại sẽ hiện lại).
//
// Ngữ cảnh: trước đây caller (PackTabContent) vứt warnings đi → user không
// biết job có tuân quota partner hay rơi vào fallback non-partner. Panel này
// surface dữ liệu sẵn có chứ không đổi logic allocator.

import { useMemo, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseWarning } from "./AllocationWarningsPanel.utils";

interface Props {
  warnings: string[];
  className?: string;
}

export function AllocationWarningsPanel({ warnings, className }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const parsed = useMemo(() => warnings.map(parseWarning), [warnings]);

  if (warnings.length === 0 || dismissed) return null;

  return (
    <div
      className={cn(
        "rounded-md border border-amber-300/60 bg-amber-50/80 p-2 text-amber-900 shadow-sm dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="size-3.5" />
          {warnings.length} cảnh báo phân bổ dữ liệu
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mt-0.5 size-5 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
          onClick={() => setDismissed(true)}
          aria-label="Ẩn cảnh báo"
        >
          <X className="size-3" />
        </Button>
      </div>
      <ul className="mt-1.5 space-y-1 text-[11px]">
        {parsed.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-start gap-1.5">
            {item.level === "warning" ? (
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            ) : (
              <Info className="mt-0.5 size-3 shrink-0" />
            )}
            <span>
              <span className="font-medium">{item.label}.</span> {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
