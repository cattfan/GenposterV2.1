import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TextRewritePanelProps {
  selectedSlotId: string;
  currentText: string;
  busy: boolean;
  onRewrite: (sourceText: string) => void | Promise<void>;
}

export function TextRewritePanel({
  selectedSlotId,
  currentText,
  busy,
  onRewrite,
}: TextRewritePanelProps) {
  const [sourceText, setSourceText] = useState("");

  useEffect(() => {
    setSourceText("");
  }, [selectedSlotId]);

  const trimmedSource = sourceText.trim();
  const trimmedCurrent = currentText.trim();
  const rewriteSource = useMemo(
    () => trimmedSource || trimmedCurrent,
    [trimmedSource, trimmedCurrent],
  );

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Paste nội dung gốc</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={!trimmedCurrent || busy}
          onClick={() => setSourceText(currentText)}
        >
          Lấy từ textbox
        </Button>
      </div>
      <Textarea
        value={sourceText}
        onChange={(event) => setSourceText(event.target.value)}
        placeholder="Dán nội dung cần viết lại..."
        className="min-h-[92px] resize-y text-xs leading-relaxed"
      />
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => void onRewrite(rewriteSource)}
        disabled={busy || !rewriteSource}
      >
        {busy ? (
          <Loader2 className="size-3 mr-1 animate-spin" />
        ) : (
          <Wand2 className="size-3 mr-1" />
        )}
        AI gen cách viết khác
      </Button>
    </div>
  );
}
