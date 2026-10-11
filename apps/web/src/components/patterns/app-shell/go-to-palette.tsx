"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList, Command } from "@/components/ui/command";
import { useRouter } from "@/i18n/navigation";
import { flattenNav, type NavEntry } from "./nav";

/**
 * The top bar's pill search (reference `Topbar`), used as a "Go to…" page palette until real search
 * arrives (05-ui §6b). Opens on click or Ctrl/⌘+K.
 */
export function GoToPalette({ nav }: { nav: NavEntry[] }) {
  const t = useTranslations("nav");
  const tStates = useTranslations("states");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = flattenNav(nav);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("goTo")}
        className="relative flex h-11 w-full max-w-[300px] min-w-0 items-center rounded-full bg-muted/80 pr-11 pl-5 text-left text-sm text-muted-foreground/90 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <span className="truncate">{t("goToPlaceholder")}</span>
        <Search className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-primary" />
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("goTo")} description={t("goToDescription")}>
        <Command>
          <CommandInput withIcon placeholder={t("goToPlaceholder")} aria-label={t("goTo")} />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>{tStates("noResults")}</CommandEmpty>
            {items.map((item) => (
              <CommandItem
                key={item.key}
                value={`${item.group ?? ""} ${item.label}`}
                onSelect={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.group ? (
                    <>
                      <span className="text-muted-foreground">{item.group}</span>
                      <span className="mx-1.5 text-muted-foreground/70" aria-hidden>
                        /
                      </span>
                    </>
                  ) : null}
                  {item.label}
                </span>
                <CornerDownLeft className="text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
