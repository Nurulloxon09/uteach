"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { GoToPalette } from "./go-to-palette";
import { CenterMenu, LanguageMenu, UserMenu } from "./menus";
import type { NavEntry, ShellCenter, ShellChip, ShellUser } from "./nav";
import { Sidebar } from "./sidebar";

/**
 * The app frame from the reference (`DashboardShell`): sticky sidebar on `lg+`, a left drawer below that,
 * top bar with the "Go to…" pill, center switcher, language and user menus, and the main area.
 * Presentational: the (app) layout passes real data, /dev/ui passes fake data.
 */
export function AppShell({
  nav,
  user,
  centers,
  currentCenterId,
  centerChip,
  switchCenter,
  logout,
  children,
}: {
  nav: NavEntry[];
  user: ShellUser;
  centers: ShellCenter[];
  currentCenterId: string;
  centerChip?: ShellChip;
  switchCenter?: (form: FormData) => Promise<void>;
  logout?: () => Promise<void>;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-svh bg-card lg:flex">
      <div className="sticky top-0 hidden h-svh shrink-0 border-r border-border/70 lg:block">
        <Sidebar nav={nav} />
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[248px]">
          <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
          <SheetDescription className="sr-only">{t("menuDescription")}</SheetDescription>
          <Sidebar nav={nav} onClose={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 bg-card px-4 py-4 sm:gap-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t("openMenu")}
            aria-expanded={menuOpen}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-secondary-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30 lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <GoToPalette nav={nav} />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <CenterMenu
              centers={centers}
              currentCenterId={currentCenterId}
              chip={centerChip}
              switchCenter={switchCenter}
            />
            <LanguageMenu />
            <UserMenu user={user} logout={logout} />
          </div>
        </header>

        <main className="flex-1 space-y-5 bg-background p-4 sm:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
