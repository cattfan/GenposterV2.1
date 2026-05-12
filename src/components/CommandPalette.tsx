// Global command palette (Ctrl/Cmd + K).
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <CommandPalette open={open} onOpenChange={setOpen} commands={[{id,label,action,...}]} />
//
// Or, for global binding, use the `GlobalCommandPaletteHost` component which
// wires Ctrl+K to its own open state and builds a default command list from
// navigation + theme + data utilities.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  Command as CommandIcon,
  Database,
  Download,
  History,
  Home,
  Moon,
  Package,
  Palette,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/hooks/useTheme";

export interface CommandEntry {
  id: string;
  label: string;
  description?: string;
  group?: string;
  shortcut?: string;
  keywords?: string[];
  icon?: React.ReactNode;
  action: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandEntry[];
  emptyMessage?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  emptyMessage = "Không có lệnh nào khớp",
}: CommandPaletteProps) {
  const groups = useMemo(() => {
    const map = new Map<string, CommandEntry[]>();
    for (const command of commands) {
      const group = command.group ?? "Lệnh";
      const list = map.get(group) ?? [];
      list.push(command);
      map.set(group, list);
    }
    return Array.from(map.entries());
  }, [commands]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Tìm lệnh hoặc trang..." />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {groups.map(([groupLabel, items], index) => (
          <div key={groupLabel}>
            {index > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={groupLabel}>
              {items.map((command) => (
                <CommandItem
                  key={command.id}
                  value={[command.label, ...(command.keywords ?? [])].join(" ")}
                  onSelect={() => {
                    onOpenChange(false);
                    void command.action();
                  }}
                >
                  {command.icon ? (
                    <span className="mr-2 flex size-4 items-center justify-center">
                      {command.icon}
                    </span>
                  ) : null}
                  <span className="flex-1 truncate">{command.label}</span>
                  {command.shortcut ? (
                    <CommandShortcut>{command.shortcut}</CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * App-level command palette wired to Ctrl/Cmd+K. Provides navigation + theme
 * + a few data shortcuts by default. Additional commands can be merged via the
 * `extraCommands` prop when mounted inside a page that knows about job/export
 * state.
 */
export function GlobalCommandPaletteHost({
  extraCommands,
}: {
  extraCommands?: CommandEntry[];
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggle, effective } = useTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          // Still allow opening the palette even from inputs, but only if the
          // shift key is held to disambiguate from typical text shortcuts.
          if (!event.shiftKey && tag !== "BODY") return;
        }
      }
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const defaultCommands = useMemo<CommandEntry[]>(() => {
    const navCommand = (to: string, label: string, icon: React.ReactNode, keywords?: string[]) => ({
      id: `nav:${to}`,
      label,
      description: location.pathname === to ? "Đang xem" : undefined,
      group: "Điều hướng",
      icon,
      keywords,
      action: () => {
        void navigate({ to });
      },
    });

    return [
      navCommand("/", "Trang chủ", <Home className="size-4" />, ["home", "dashboard"]),
      navCommand("/templates", "Khuôn mẫu", <Package className="size-4" />, [
        "template",
        "pack",
        "page",
      ]),
      navCommand("/generate", "Tạo nội dung", <Sparkles className="size-4" />, [
        "generate",
        "bind",
      ]),
      navCommand("/data", "Dữ liệu", <Database className="size-4" />, [
        "data",
        "entity",
        "sheet",
      ]),
      navCommand("/history", "Lịch sử", <History className="size-4" />, ["history", "job"]),
      navCommand("/settings", "Cài đặt", <SettingsIcon className="size-4" />, [
        "settings",
        "config",
      ]),
      {
        id: "theme:toggle",
        label:
          effective === "dark" ? "Đổi sang chế độ sáng" : "Đổi sang chế độ tối",
        group: "Hiển thị",
        keywords: ["theme", "dark", "sang", "toi", mode],
        icon:
          effective === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />,
        action: () => toggle(),
      },
      {
        id: "theme:palette",
        label: "Chọn theme (sáng/tối/hệ thống)",
        group: "Hiển thị",
        keywords: ["theme"],
        icon: <Palette className="size-4" />,
        action: () => toggle(),
      },
    ];
  }, [effective, location.pathname, mode, navigate, toggle]);

  const registeredCommands = usePageCommandsSnapshot();
  const commands = useMemo(
    () => [...defaultCommands, ...registeredCommands, ...(extraCommands ?? [])],
    [defaultCommands, registeredCommands, extraCommands],
  );

  return (
    <>
      <CommandPalette open={open} onOpenChange={setOpen} commands={commands} />
      {/* Invisible badge rendered to keep the `CommandIcon` import used in docs-friendly bundles. */}
      <span aria-hidden className="hidden">
        <CommandIcon />
      </span>
    </>
  );
}

/**
 * Helper hook to let pages provide their own additional commands at runtime.
 * Pages call this with a memoised command array; the global host picks the
 * commands up via a subscription pattern. Kept minimal to avoid overengineering.
 */
type Subscriber = () => void;
const pageCommandsRegistry = new Map<symbol, CommandEntry[]>();
const subscribers = new Set<Subscriber>();

function notifySubscribers() {
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function registerPageCommands(commands: CommandEntry[]): () => void {
  const token = Symbol("page-commands");
  pageCommandsRegistry.set(token, commands);
  notifySubscribers();
  return () => {
    pageCommandsRegistry.delete(token);
    notifySubscribers();
  };
}

export function getRegisteredPageCommands(): CommandEntry[] {
  return Array.from(pageCommandsRegistry.values()).flat();
}

/**
 * React hook: register the given commands while the component is mounted and
 * update them whenever the array changes. Uses `useRef` + `registerPageCommands`
 * so consumers can pass freshly-built command closures each render.
 */
export function usePageCommands(commands: CommandEntry[]) {
  const ref = useRef<CommandEntry[]>(commands);
  ref.current = commands;
  useEffect(() => {
    return registerPageCommands(ref.current);
    // Re-register whenever the *shape* of commands changes (ids).
  }, [commands.map((c) => c.id).join("|")]);
}

function usePageCommandsSnapshot(): CommandEntry[] {
  const [snapshot, setSnapshot] = useState<CommandEntry[]>(() => getRegisteredPageCommands());
  useEffect(() => {
    const update = () => setSnapshot(getRegisteredPageCommands());
    subscribers.add(update);
    return () => {
      subscribers.delete(update);
    };
  }, []);
  return snapshot;
}
