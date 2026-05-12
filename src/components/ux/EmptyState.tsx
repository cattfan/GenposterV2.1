// Empty state placeholder thống nhất cho các trang/panel khi chưa có data.
// Ví dụ: danh sách layers trống, lưới ảnh trống, chưa chọn khối.

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center",
        compact ? "py-6" : "py-10",
        className,
      )}
    >
      {icon && <div className="text-muted-foreground [&>svg]:size-6">{icon}</div>}
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description && (
        <div className="text-xs leading-relaxed text-muted-foreground max-w-sm">
          {description}
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
