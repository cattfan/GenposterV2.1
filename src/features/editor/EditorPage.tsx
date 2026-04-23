import { useMemo } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DesignWorkspace } from "./DesignWorkspace";
import { designDocumentToPageTemplate, pageTemplateToDesignDocument } from "./designDocument";
import { db } from "@/storage/db";

export function EditorPage() {
  const { id } = useParams({ from: "/templates/$id/edit" });
  const navigate = useNavigate();
  const payload = useLiveQuery(async () => {
    const [template, directDocument, linkedDocument] = await Promise.all([
      db.pageTemplates.get(id),
      db.designDocuments.get(id),
      db.designDocuments.where("sourcePageTemplateId").equals(id).first(),
    ]);
    return {
      template,
      document: directDocument ?? linkedDocument,
    };
  }, [id]);

  const initialDocument = useMemo(() => {
    if (!payload?.template) return null;
    return payload.document ?? pageTemplateToDesignDocument(payload.template, "template");
  }, [payload]);

  if (!payload) {
    return <div className="p-8 text-muted-foreground">Đang tải editor...</div>;
  }

  if (!payload.template || !initialDocument) {
    return (
      <div className="p-8 space-y-4">
        <div className="text-lg font-semibold">Không tìm thấy template</div>
        <Button asChild variant="outline">
          <Link to="/templates">Quay lại templates</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="outline" onClick={() => navigate({ to: "/templates" })}>
          <ArrowLeft className="mr-2 size-4" />
          Quay lại
        </Button>
        <div>
          <div className="font-semibold">{payload.template.name}</div>
          <div className="text-xs text-muted-foreground">
            Template mode đang chạy qua DesignDocument adapter
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <DesignWorkspace
          initialDocument={initialDocument}
          mode="template"
          allowMultiplePages={false}
          onClose={() => navigate({ to: "/templates" })}
          onSave={async (nextDocument) => {
            const nextTemplate = designDocumentToPageTemplate(nextDocument, payload.template);
            await db.transaction("rw", [db.pageTemplates, db.designDocuments], async () => {
              await db.pageTemplates.put(nextTemplate);
              await db.designDocuments.put({
                ...nextDocument,
                designDocumentId: nextDocument.designDocumentId || id,
                sourcePageTemplateId: payload.template.pageTemplateId,
                mode: "template",
                updatedAt: Date.now(),
              });
            });
            toast.success("Đã lưu template bằng editor mới");
          }}
        />
      </div>
    </div>
  );
}
