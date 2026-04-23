import { useMemo } from "react";
import type { Asset, Entity, PageTemplate, RenderedItem } from "@/models";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DesignWorkspace } from "@/features/editor/DesignWorkspace";
import {
  designDocumentToPageTemplate,
  pageTemplateToDesignDocument,
} from "@/features/editor/designDocument";

export function GeneratePageEditor({
  open,
  onOpenChange,
  title,
  template,
  baseTemplate,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  template: PageTemplate;
  baseTemplate: PageTemplate;
  entities: Entity[];
  assets: Asset[];
  entity?: Entity;
  entityPool?: Entity[];
  slotItems?: RenderedItem[];
  onApply: (nextTemplate: PageTemplate | null) => void;
}) {
  const document = useMemo(() => pageTemplateToDesignDocument(template, "generated"), [template]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[98vw] max-w-none p-0 sm:max-w-none">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              Chỉnh page output bằng editor mới. Khi lưu, thay đổi sẽ được chuyển ngược về
              `workingTemplate` của page hiện tại.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1">
            <DesignWorkspace
              initialDocument={document}
              mode="generated"
              allowMultiplePages={false}
              onClose={() => onOpenChange(false)}
              onSave={(nextDocument) => {
                onApply(designDocumentToPageTemplate(nextDocument, baseTemplate));
                onOpenChange(false);
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
