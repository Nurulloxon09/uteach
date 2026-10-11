"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ELLIPSIS } from "./brand";
import { PAGE_SIZES, pageWindow } from "./list-params";
import { useListParams } from "./url-params";

const btn =
  "grid size-9 place-items-center rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30";

/** Pagination under the list card (reference `TablePagination`): square buttons, active in primary, "10 / page". */
export function Pagination({
  page,
  pageCount,
  pageSize,
  alwaysShow = false,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  alwaysShow?: boolean;
}) {
  const t = useTranslations("pagination");
  const { hrefWith, setParams } = useListParams();
  if (pageCount <= 1 && !alwaysShow) return null;

  const pageLink = (p: number) => hrefWith({ page: p === 1 ? null : String(p) });
  const disabled = "pointer-events-none opacity-40";

  return (
    <nav
      aria-label={t("label")}
      className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
    >
      <Link
        href={pageLink(Math.max(1, page - 1))}
        aria-label={t("previous")}
        aria-disabled={page <= 1}
        className={cn(btn, "text-secondary-foreground hover:bg-muted", page <= 1 && disabled)}
      >
        <ChevronLeft className="size-4" />
      </Link>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "gap" ? (
          <span
            key={`gap-${i}`}
            className="px-2 text-lg leading-none tracking-widest text-muted-foreground"
          >
            {ELLIPSIS}
          </span>
        ) : (
          <Link
            key={p}
            href={pageLink(p)}
            aria-label={t("page", { page: p })}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              btn,
              p >= 100 && "w-11",
              p === page
                ? "bg-primary text-primary-foreground"
                : "text-secondary-foreground hover:bg-muted",
            )}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        href={pageLink(Math.min(pageCount, page + 1))}
        aria-label={t("next")}
        aria-disabled={page >= pageCount}
        className={cn(
          btn,
          "text-secondary-foreground hover:bg-muted",
          page >= pageCount && disabled,
        )}
      >
        <ChevronRight className="size-4" />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className="ml-2 flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-secondary-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30">
          {t("perPage", { size: pageSize })}
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-36">
          <DropdownMenuRadioGroup
            value={String(pageSize)}
            onValueChange={(v) => setParams({ size: v })}
          >
            {PAGE_SIZES.map((s) => (
              <DropdownMenuRadioItem key={s} value={String(s)}>
                {t("perPage", { size: s })}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
