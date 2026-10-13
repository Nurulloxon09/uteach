import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  HandCoins,
  Home,
  Megaphone,
  NotebookPen,
  Settings,
  Target,
  UsersRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation model. Built on the server (per role and permission flags) and passed to the client shell,
 * so icons are referenced by name.
 */
export const NAV_ICONS = {
  home: Home,
  today: CalendarCheck,
  staff: Users,
  settings: Settings,
  branches: Building2,
  groups: UsersRound,
  schedule: CalendarDays,
  leads: Target,
  students: GraduationCap,
  attendance: ClipboardCheck,
  payments: Wallet,
  debtors: HandCoins,
  broadcasts: Megaphone,
  exams: NotebookPen,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export type NavLink = { key: string; label: string; href: string; icon: NavIconName };
export type NavChild = { key: string; label: string; href: string };
export type NavGroup = { key: string; label: string; icon: NavIconName; children: NavChild[] };
export type NavEntry = NavLink | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** All link targets, flattened (for the "Go to…" palette). */
export function flattenNav(
  nav: NavEntry[],
): { key: string; label: string; href: string; group?: string }[] {
  return nav.flatMap((e) =>
    isGroup(e)
      ? e.children.map((c) => ({ ...c, group: e.label }))
      : [{ key: e.key, label: e.label, href: e.href }],
  );
}

export type ShellUser = { name: string; roleLabel: string };
export type ShellCenter = { id: string; name: string };
export type ShellChip = {
  label: string;
  tone: "primary" | "success" | "warning" | "destructive" | "muted";
};
