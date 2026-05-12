// Dialog liệt kê phím tắt toàn hệ thống, mở bằng phím "?" hoặc qua Command Palette.
// Phục vụ Requirement 10.5.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "./Kbd";

interface ShortcutRow {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutRow[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Chung",
    items: [
      { keys: "Ctrl+K", label: "Mở bảng lệnh (Command Palette)" },
      { keys: "?", label: "Hiện danh sách phím tắt" },
      { keys: "Ctrl+S", label: "Lưu" },
      { keys: "Ctrl+Z", label: "Hoàn tác" },
      { keys: "Ctrl+Shift+Z", label: "Làm lại" },
      { keys: "Escape", label: "Đóng dialog / bỏ chọn" },
    ],
  },
  {
    title: "Thao tác với khối",
    items: [
      { keys: "Ctrl+C", label: "Sao chép khối được chọn" },
      { keys: "Ctrl+V", label: "Dán khối" },
      { keys: "Ctrl+X", label: "Cắt khối" },
      { keys: "Ctrl+D", label: "Nhân bản khối" },
      { keys: "Delete", label: "Xoá khối được chọn" },
      { keys: "Ctrl+A", label: "Chọn tất cả khối" },
      { keys: "Ctrl+G", label: "Nhóm khối" },
      { keys: "Ctrl+Shift+G", label: "Tách nhóm" },
      { keys: "Ctrl+]", label: "Đưa lên một lớp" },
      { keys: "Ctrl+[", label: "Đưa xuống một lớp" },
    ],
  },
  {
    title: "Công cụ",
    items: [
      { keys: "V", label: "Công cụ chọn" },
      { keys: "T", label: "Thêm chữ" },
      { keys: "R", label: "Thêm hình chữ nhật" },
      { keys: "L", label: "Thêm đường thẳng" },
      { keys: "I", label: "Thêm ảnh" },
      { keys: "H", label: "Chế độ pan (di chuyển canvas)" },
    ],
  },
  {
    title: "Di chuyển khối",
    items: [
      { keys: "ArrowUp", label: "Lên 1px" },
      { keys: "Shift+ArrowUp", label: "Lên 10px" },
      { keys: "ArrowDown", label: "Xuống 1px" },
      { keys: "ArrowLeft", label: "Trái 1px" },
      { keys: "ArrowRight", label: "Phải 1px" },
    ],
  },
  {
    title: "Zoom canvas",
    items: [
      { keys: "Ctrl+0", label: "Vừa màn hình" },
      { keys: "Ctrl+1", label: "100%" },
      { keys: "Ctrl+=", label: "Phóng to" },
      { keys: "Ctrl+-", label: "Thu nhỏ" },
      { keys: "Space", label: "Giữ để pan (di chuyển canvas)" },
    ],
  },
];

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Phím tắt</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((row) => (
                  <li
                    key={row.keys}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-accent/40"
                  >
                    <span className="truncate text-foreground">{row.label}</span>
                    <Kbd keys={row.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
