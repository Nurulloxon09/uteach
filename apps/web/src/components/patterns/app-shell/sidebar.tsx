"use client";

import { ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Wordmark } from "../wordmark";
import { NAV_ICONS, isActivePath, isGroup, type NavEntry } from "./nav";

/**
 * The reference sidebar (`Sidebar.tsx`): 248 px, wordmark block, rows `rounded-xl px-3 py-2.5 text-[15px]`,
 * groups that expand with a chevron and a grid-rows animation, active child in `bg-primary-soft` with a
 * 3 px primary bar.
 */
export function Sidebar({ nav, onClose }: { nav: NavEntry[]; onClose?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const activeGroup = nav.find((e) => isGroup(e) && e.children.some((c) => isActivePath(pathname, c.href)));
  const [openKey, setOpenKey] = useState<string | null>(activeGroup?.key ?? null);

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col bg-card" aria-label={t("menu")}>
      <div className="flex items-center justify-between px-7 pt-7 pb-6">
        <Wordmark />
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30 lg:hidden"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-8">
        <ul className="space-y-0.5">
          {nav.map((entry) => {
            const Icon = NAV_ICONS[entry.icon];
            const group = isGroup(entry);
            const active = group
              ? entry.children.some((c) => isActivePath(pathname, c.href))
              : isActivePath(pathname, entry.href);
            const isOpen = group && openKey === entry.key;
            const rowClass = cn(
              "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
              active ? "text-primary" : "text-secondary-foreground hover:bg-muted hover:text-primary",
            );
            const icon = (
              <Icon
                className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")}
                strokeWidth={1.8}
                aria-hidden
              />
            );

            return (
              <li key={entry.key}>
                {group ? (
                  <button
                    type="button"
                    onClick={() => setOpenKey(isOpen ? null : entry.key)}
                    aria-expanded={isOpen}
                    className={rowClass}
                  >
                    {icon}
                    <span className="flex-1 text-left">{entry.label}</span>
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                ) : (
                  <Link
                    href={entry.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={rowClass}
                  >
                    {icon}
                    <span className="flex-1 text-left">{entry.label}</span>
                  </Link>
                )}

                {group ? (
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-out",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <ul className="ml-6 overflow-hidden border-l border-border pl-2" inert={!isOpen}>
                      {entry.children.map((child) => {
                        const childActive = isActivePath(pathname, child.href);
                        return (
                          <li key={child.key} className="relative py-0.5 first:mt-1 last:mb-1">
                            {childActive ? (
                              <span className="absolute top-1/2 -left-[9px] h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
                            ) : null}
                            <Link
                              href={child.href}
                              onClick={onClose}
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "block w-full rounded-lg px-4 py-2 text-left text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
                                childActive
                                  ? "bg-primary-soft font-semibold text-primary"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
