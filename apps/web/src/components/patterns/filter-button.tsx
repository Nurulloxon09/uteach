"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useListParams } from "./url-params";

export type FilterOption = { value: string; label: string };

/**
 * Filter button from the reference (`DateRangeButton`: `h-11 rounded-xl border`, icon + label + chevron).
 * Opens a small option list and writes `?{param}=`. The first option is "All" (empty value).
 * `icon` is a rendered element (`<CircleDot />`) so server pages can pass it to this client component.
 */
export function FilterButton({
  icon,
  label,
  param,
  options,
  allLabel,
}: {
  icon: ReactNode;
  label: string;
  param: string;
  options: FilterOption[];
  allLabel: string;
}) {
  const { searchParams, setParams } = useListParams();
  const [open, setOpen] = useState(false);
  const current = searchParams.get(param) ?? "";
  const currentLabel = options.find((o) => o.value === current)?.label;
  const all: FilterOption[] = [{ value: "", label: allLabel }, ...options];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm text-secondary-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30",
          current ? "border-primary/50" : "border-border",
        )}
      >
        <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        <span className="whitespace-nowrap">
          {label}
          {currentLabel ? (
            <>
              :<span className="ml-1 font-semibold text-primary">{currentLabel}</span>
            </>
          ) : null}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="end">
        <ul role="listbox" aria-label={label}>
          {all.map((o) => {
            const selected = o.value === current;
            return (
              <li key={o.value || "all"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setParams({ [param]: o.value || null });
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-lg px-3 py-2.5 text-left text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
                    selected
                      ? "bg-primary-soft font-medium text-primary"
                      : "text-secondary-foreground hover:bg-muted",
                  )}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
