import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export interface BundleImageIssue {
  entityId: string;
  entityName: string;
  pageNames: string[];
  partnerFlag: boolean;
  hasImageReference: boolean;
}

interface Props {
  bundleLabel: string;
  issues: BundleImageIssue[];
}

export function BundleImageWarningsAlert({ bundleLabel, issues }: Props) {
  if (issues.length === 0) return null;

  const visibleIssues = issues.slice(0, 8);
  const hiddenCount = issues.length - visibleIssues.length;
  const referenceOnlyCount = issues.filter((issue) => issue.hasImageReference).length;
  const missingSourceCount = issues.length - referenceOnlyCount;

  return (
    <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
      <AlertTriangle className="text-amber-700 dark:text-amber-300" />
      <AlertTitle>Một số quán chưa có ảnh trong thư viện ({bundleLabel})</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 text-amber-900 dark:text-amber-200/90">
        <p>
          Trang preview có thể vẫn hiển thị ảnh tạm hoặc ảnh ngẫu nhiên — đó không phải ảnh thật đã
          import cho quán.
          {referenceOnlyCount > 0
            ? ` ${referenceOnlyCount} quán đã có folder/link trong sheet nhưng chưa ghép/tải ảnh.`
            : ""}
          {missingSourceCount > 0
            ? ` ${missingSourceCount} quán chưa có nguồn ảnh trong sheet.`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {visibleIssues.map((issue) => (
            <Badge
              key={issue.entityId}
              variant="outline"
              className="max-w-full border-amber-500/40 bg-background/80 font-normal"
              title={`${issue.entityName} · ${issue.pageNames.join(", ")}`}
            >
              <span className="max-w-40 truncate">{issue.entityName}</span>
              {issue.partnerFlag ? (
                <span className="ml-1 rounded-full bg-amber-200/80 px-1.5 py-0.5 text-xs dark:bg-amber-900/60">
                  Đối tác
                </span>
              ) : null}
              {issue.hasImageReference ? (
                <span className="ml-1 text-xs opacity-80">· folder/link</span>
              ) : null}
            </Badge>
          ))}
          {hiddenCount > 0 ? (
            <Badge variant="outline" className="border-amber-500/40 bg-background/80 font-normal">
              +{hiddenCount} quán khác
            </Badge>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
