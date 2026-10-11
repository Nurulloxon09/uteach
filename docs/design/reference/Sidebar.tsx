import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  Home,
  GraduationCap,
  Users,
  BookOpen,
  UserCircle,
  School,
  BookMarked,
  CalendarDays,
  ClipboardCheck,
  PenLine,
  Bell,
  Bus,
  Building2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Child = { label: string; to?: string };

type Item = {
  label: string;
  icon: React.ElementType;
  to?: string;
  children?: Child[];
};

const items: Item[] = [
  {
    label: "Home",
    icon: Home,
    children: [{ label: "Admin", to: "/" }, { label: "Students" }, { label: "Teachers" }],
  },
  {
    label: "Students",
    icon: GraduationCap,
    children: [{ label: "All Students" }, { label: "Add Student" }],
  },
  {
    label: "Teachers",
    icon: Users,
    children: [
      { label: "All Teachers", to: "/teachers" },
      { label: "Teachers Details", to: "/teachers/details" },
    ],
  },
  { label: "Library", icon: BookOpen, to: "/library" },
  { label: "Account", icon: UserCircle, children: [{ label: "Fees" }, { label: "Expenses" }] },
  { label: "Class", icon: School },
  { label: "Subject", icon: BookMarked },
  { label: "Routine", icon: CalendarDays },
  { label: "Attendance", icon: ClipboardCheck },
  { label: "Exam", icon: PenLine, children: [{ label: "Schedule" }, { label: "Results" }] },
  { label: "Notice", icon: Bell },
  { label: "Transport", icon: Bus },
  { label: "Hostel", icon: Building2 },
];

function activeGroupFor(pathname: string) {
  if (pathname.startsWith("/teachers")) return "Teachers";
  if (pathname.startsWith("/library")) return "Library";
  return "Home";
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState<string | null>(() => activeGroupFor(pathname));
  const [fallbackActive, setFallbackActive] = useState<string | null>(null);

  useEffect(() => {
    setOpen(activeGroupFor(pathname));
    setFallbackActive(null);
  }, [pathname]);

  const isChildActive = (child: Child) =>
    child.to ? pathname === child.to : fallbackActive === child.label;

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col bg-card">
      <div className="flex items-center justify-between px-7 pt-7 pb-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
              <path d="M12 2c1.6 2.2 1.6 4.6 0 6.8C10.4 6.6 10.4 4.2 12 2Zm-8 5.4c2.6-.4 4.7.7 6.2 3-2.6.4-4.7-.7-6.2-3Zm16 0c-1.5 2.3-3.6 3.4-6.2 3 1.5-2.3 3.6-3.4 6.2-3ZM6 13.2c2.4 0 4.2 1 5.3 3.1-2.4.1-4.2-1-5.3-3.1Zm12 0c-1.1 2.1-2.9 3.2-5.3 3.1 1.1-2.1 2.9-3.1 5.3-3.1ZM11.2 18h1.6V22h-1.6V18Z" />
            </svg>
          </span>
          <span className="text-xl font-extrabold tracking-tight text-primary">
            Sp<span className="text-foreground">!k</span>
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted lg:hidden"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-8">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const isOpen = open === item.label;
            const isActiveParent =
              (item.to && pathname === item.to) ||
              (item.children?.some((c) => isChildActive(c)) ?? false) ||
              fallbackActive === item.label;

            const rowClass = cn(
              "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
              isActiveParent
                ? "text-primary"
                : "text-secondary-foreground hover:bg-muted hover:text-primary",
            );
            const iconEl = (
              <item.icon
                className={cn(
                  "size-[18px] shrink-0",
                  isActiveParent ? "text-primary" : "text-muted-foreground",
                )}
                strokeWidth={1.8}
              />
            );

            return (
              <li key={item.label}>
                {item.to ? (
                  <Link to={item.to} onClick={onClose} className={rowClass}>
                    {iconEl}
                    <span className="flex-1 text-left">{item.label}</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      if (item.children) setOpen(isOpen ? null : item.label);
                      else setFallbackActive(item.label);
                    }}
                    className={rowClass}
                  >
                    {iconEl}
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.children && (
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform duration-200",
                          isOpen && "rotate-180",
                        )}
                      />
                    )}
                  </button>
                )}

                {item.children && (
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-out",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <ul className="ml-6 overflow-hidden border-l border-border pl-2">
                      {item.children.map((child) => {
                        const activeChild = isChildActive(child);
                        const childClass = cn(
                          "block w-full rounded-lg px-4 py-2 text-left text-[15px] transition-colors",
                          activeChild
                            ? "bg-primary-soft font-semibold text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        );
                        return (
                          <li key={child.label} className="relative py-0.5 first:mt-1 last:mb-1">
                            {activeChild && (
                              <span className="absolute -left-[9px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
                            )}
                            {child.to ? (
                              <Link to={child.to} onClick={onClose} className={childClass}>
                                {child.label}
                              </Link>
                            ) : (
                              <button
                                onClick={() => setFallbackActive(child.label)}
                                className={childClass}
                              >
                                {child.label}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
