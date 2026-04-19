import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home,
  Layers,
  Package,
  Database,
  Sparkles,
  FileText,
  History,
  Settings,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { seedDemo, isSeeded } from "@/storage/seed";
import { toast } from "sonner";

const NAV = [
  { to: "/", label: "Trang chủ", icon: Home },
  { to: "/templates", label: "Page Templates", icon: Layers },
  { to: "/packs", label: "Pack Templates", icon: Package },
  { to: "/data", label: "Dữ liệu", icon: Database },
  { to: "/generate", label: "Tạo nội dung", icon: Sparkles },
  { to: "/reports", label: "Báo cáo & Caption", icon: FileText },
  { to: "/history", label: "Lịch sử", icon: History },
  { to: "/settings", label: "Cài đặt", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    (async () => {
      if (!(await isSeeded())) {
        await seedDemo();
        toast.success("Đã tạo dữ liệu demo. Mở 'Tạo nội dung' để thử ngay!");
      }
      setSeeded(true);
    })();
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Palette className="size-5" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Content Pack</div>
              <div className="text-xs text-muted-foreground leading-tight">Generator · VN</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={async () => {
              await seedDemo(true);
              toast.success("Đã reset & nạp lại demo");
              window.location.reload();
            }}
          >
            Nạp lại demo
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {seeded ? children : <div className="p-10 text-muted-foreground">Đang khởi tạo...</div>}
      </main>
    </div>
  );
}
