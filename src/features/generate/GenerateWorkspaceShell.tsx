import { useState, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { GenerateMobileToolbar } from "./GenerateMobileToolbar";

interface Props {
  configPanel: ReactNode;
  canvasPanel: ReactNode;
  bindPanel: ReactNode;
  selectedSlotCount: number;
  canGenerate: boolean;
  generateReason: string;
  onBack: () => void;
  onGenerate: () => void;
}

export function GenerateWorkspaceShell({
  configPanel,
  canvasPanel,
  bindPanel,
  selectedSlotCount,
  canGenerate,
  generateReason,
  onBack,
  onGenerate,
}: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);

  return (
    <>
      <GenerateMobileToolbar
        selectedSlotCount={selectedSlotCount}
        canGenerate={canGenerate}
        generateReason={generateReason}
        onBack={onBack}
        onOpenConfig={() => setConfigOpen(true)}
        onOpenBind={() => setBindOpen(true)}
        onGenerate={() => {
          setConfigOpen(false);
          onGenerate();
        }}
      />

      {/* Desktop: 3-column grid */}
      <div className="hidden grid-cols-12 gap-4 lg:grid">
        <aside className="col-span-3 max-h-[calc(100vh-2rem)] self-start overflow-hidden lg:sticky lg:top-4">
          <ScrollArea className="h-full max-h-[calc(100vh-2rem)] pr-3">{configPanel}</ScrollArea>
        </aside>
        <main className="col-span-6 min-w-0">{canvasPanel}</main>
        <aside className="col-span-3 max-h-[calc(100vh-2rem)] self-start overflow-hidden lg:sticky lg:top-4">
          <ScrollArea className="h-full max-h-[calc(100vh-2rem)] pr-3">{bindPanel}</ScrollArea>
        </aside>
      </div>

      {/* Mobile: canvas-first */}
      <div className="flex flex-col gap-3 lg:hidden">{canvasPanel}</div>

      <Sheet open={configOpen} onOpenChange={setConfigOpen}>
        <SheetContent side="left" className="flex w-[min(100vw,380px)] flex-col gap-0 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm">Cấu hình bộ ảnh</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 px-4 py-3">{configPanel}</ScrollArea>
          <SheetFooter className="border-t px-4 py-3">
            <button
              type="button"
              className="hidden"
              aria-hidden
              tabIndex={-1}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={bindOpen} onOpenChange={setBindOpen}>
        <SheetContent side="right" className="flex w-[min(100vw,400px)] flex-col gap-0 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm">Liên kết dữ liệu</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 px-4 py-3">{bindPanel}</ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
