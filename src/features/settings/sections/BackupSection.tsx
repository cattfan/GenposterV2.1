import { useRef, useState } from "react";
import { toast } from "sonner";
import saveAs from "file-saver";
import { Loader2, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createSystemBackupZip,
  getSystemBackupFileName,
  importSystemBackupFile,
  type SystemBackupSection,
  type SystemBackupScope,
  type SystemBackupImportMode,
} from "@/storage/systemBackup";

const BACKUP_SECTION_OPTIONS: Array<{
  value: SystemBackupSection;
  label: string;
  description: string;
}> = [
  {
    value: "systemData",
    label: "Dữ liệu hệ thống",
    description: "Dữ liệu import, lịch sử, cài đặt, asset và thư viện local.",
  },
  {
    value: "packTemplates",
    label: "Bộ khuôn",
    description: "Bộ khuôn và các trang khuôn đang được dùng.",
  },
  {
    value: "generatePresets",
    label: "Khuôn đổ dữ liệu",
    description: "Khuôn tạo nội dung, kèm bộ khuôn và trang khuôn liên quan.",
  },
];

function getBackupScopeFromSections(sections: SystemBackupSection[]): SystemBackupScope {
  const selected = new Set(sections);
  if (
    selected.has("systemData") &&
    selected.has("packTemplates") &&
    selected.has("generatePresets")
  ) {
    return "all";
  }
  if (selected.size === 1 && selected.has("packTemplates")) return "packTemplates";
  if (selected.size === 1 && selected.has("generatePresets")) return "generatePresets";
  return "custom";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function BackupSection() {
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupSections, setBackupSections] = useState<SystemBackupSection[]>([
    "systemData",
    "packTemplates",
    "generatePresets",
  ]);
  const [backupIncludeImages, setBackupIncludeImages] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const backupScope = getBackupScopeFromSections(backupSections);
  const canExportBackup = backupSections.length > 0;

  const toggleBackupSection = (section: SystemBackupSection, checked: boolean) => {
    setBackupSections((current) => {
      if (checked) return Array.from(new Set([...current, section]));
      return current.filter((item) => item !== section);
    });
  };

  const exportBackup = async () => {
    setBackupBusy(true);
    try {
      const blob = await createSystemBackupZip({
        sections: backupSections,
        includeImages: backupIncludeImages,
      });
      saveAs(blob, getSystemBackupFileName(Date.now(), backupScope, backupIncludeImages));
      toast.success("Đã tải backup.");
    } catch (error) {
      toast.error(`Lỗi backup: ${errorMessage(error)}`);
    } finally {
      setBackupBusy(false);
    }
  };

  const chooseImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) setPendingImportFile(file);
  };

  const runBackupImport = async (mode: SystemBackupImportMode) => {
    if (!pendingImportFile) return;
    setImportBusy(true);
    try {
      const result = await importSystemBackupFile(pendingImportFile, mode);
      if (result.warning) toast.warning(result.warning, { duration: 8000 });
      toast.success(result.message);
      setPendingImportFile(null);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      toast.error(`Lỗi import backup: ${errorMessage(error)}`);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sao lưu & khôi phục</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="space-y-2">
              <Label>Phạm vi backup</Label>
              <div className="grid gap-2 lg:grid-cols-3">
                {BACKUP_SECTION_OPTIONS.map((option) => {
                  const checked = backupSections.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex min-h-24 cursor-pointer items-start gap-3 rounded-md border bg-background p-3 transition-colors hover:border-primary/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleBackupSection(option.value, value === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {!canExportBackup ? (
                <div className="text-xs text-destructive">Chọn ít nhất một mục để backup.</div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
              <div>
                <div className="text-sm font-medium">Backup ảnh local</div>
                <div className="text-xs text-muted-foreground">
                  Tắt để file nhẹ hơn, nhưng ảnh trong IndexedDB không được khôi phục.
                </div>
              </div>
              <Switch
                checked={backupIncludeImages}
                onCheckedChange={setBackupIncludeImages}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="font-medium">Tải backup</div>
              <Button
                className="mt-4 w-full"
                onClick={() => void exportBackup()}
                disabled={backupBusy || !canExportBackup}
              >
                {backupBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Tải backup
              </Button>
            </div>

            <div className="rounded-lg border p-4">
              <div className="font-medium">Nhập backup</div>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => backupInputRef.current?.click()}
                disabled={importBusy}
              >
                <Upload className="size-4" />
                Chọn file backup
              </Button>
              <input
                ref={backupInputRef}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                className="hidden"
                onChange={chooseImportFile}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(pendingImportFile)}
        onOpenChange={(open) => {
          if (!open && !importBusy) setPendingImportFile(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chọn cách import backup</AlertDialogTitle>
            <AlertDialogDescription>
              File: {pendingImportFile?.name}. Nhập thêm sẽ upsert theo ID. Khôi phục ghi đè sẽ
              xoá toàn bộ dữ liệu local hiện tại rồi restore từ backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importBusy}>Huỷ</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => void runBackupImport("merge")}
              disabled={importBusy}
            >
              {importBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Nhập thêm
            </Button>
            <Button
              variant="destructive"
              onClick={() => void runBackupImport("replace")}
              disabled={importBusy}
            >
              Khôi phục ghi đè
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
