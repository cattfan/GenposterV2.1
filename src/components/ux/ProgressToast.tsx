// Hook hiển thị progress toast cho các tác vụ dài như xuất ZIP nhiều trang.
// Sử dụng sonner toast với update động.
// Phục vụ Requirement 14.2.

import { toast } from "sonner";

interface ProgressOptions {
  /** Label hiển thị khi bắt đầu, ví dụ "Đang xuất 40 trang..." */
  initialLabel: string;
  /** Tổng số bước */
  total: number;
}

interface ProgressHandle {
  /** Cập nhật tiến độ */
  update: (current: number, label?: string) => void;
  /** Kết thúc thành công */
  success: (label: string) => void;
  /** Kết thúc lỗi */
  error: (label: string) => void;
  /** Đóng toast mà không có success/error */
  dismiss: () => void;
}

export function createProgressToast({
  initialLabel,
  total,
}: ProgressOptions): ProgressHandle {
  let currentStep = 0;
  const toastId = toast.loading(initialLabel, {
    description: `0/${total}`,
    duration: Infinity,
  });

  return {
    update: (current, label) => {
      currentStep = current;
      toast.loading(label ?? initialLabel, {
        id: toastId,
        description: `${current}/${total} (${Math.round((current / total) * 100)}%)`,
        duration: Infinity,
      });
    },
    success: (label) => {
      toast.success(label, {
        id: toastId,
        description: `Hoàn thành ${currentStep}/${total}`,
        duration: 4000,
      });
    },
    error: (label) => {
      toast.error(label, {
        id: toastId,
        description: `Dừng ở ${currentStep}/${total}`,
        duration: 5000,
      });
    },
    dismiss: () => {
      toast.dismiss(toastId);
    },
  };
}
