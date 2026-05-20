// Hiển thị warning từ allocateEntityBindingsForTemplate trên trang Tạo nội dung.
// Allocator trả mảng string warning thô khi pool entity không đủ partner cho
// quota hoặc không đủ entity tổng. Component này phân loại + format VN +
// cho phép user dismiss khỏi UI (không persist; reload lại sẽ hiện lại).

import { useMemo, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    <Alert
      className={cn(
        "relative border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100",
        className,
      )}
    >
      <AlertTriangle className="text-amber-700 dark:text-amber-300" />
      <div className="absolute right-2 top-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/40"
          onClick={() => setDismissed(true)}
          aria-label="Ẩn cảnh báo"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <AlertTitle>{warnings.length} cảnh báo phân bổ dữ liệu</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-2 pt-1">
          {parsed.map((item, index) => (
            <li key={`${index}-${item.label}`} className="flex items-start gap-1.5 text-xs">
              {item.level === "warning" ? (
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              ) : (
                <Info className="mt-0.5 size-3 shrink-0" />
              )}
              <span className="flex flex-col gap-0.5">
                <span>
                  <span className="font-medium">{item.label}.</span> {item.detail}
                </span>
                {item.hint ? (
                  <span className="text-xs opacity-80">{item.hint}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
