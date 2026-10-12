"use client";

import { cn } from "@/lib/utils";
import type { ChipTone } from "./status-chip";

const CHECKED: Record<ChipTone, string> = {
  primary:
    "peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary",
  success:
    "peer-checked:bg-success peer-checked:text-success-foreground peer-checked:border-success",
  warning:
    "peer-checked:bg-warning peer-checked:text-warning-foreground peer-checked:border-warning",
  destructive:
    "peer-checked:bg-destructive peer-checked:text-destructive-foreground peer-checked:border-destructive",
  muted:
    "peer-checked:bg-secondary-foreground peer-checked:text-card peer-checked:border-secondary-foreground",
};

export type StatusOption = {
  value: string;
  label: string;
  tone: ChipTone;
  /** Full label for screen readers when `label` is shortened. */
  srLabel?: string;
};

/**
 * Big one-tap status buttons for phone lists (Present / Late / Absent / Excused).
 * Native radio inputs underneath, so arrow keys and screen readers work. `layout="row"` keeps all
 * options on one line at 375 px (the attendance sheet); `grid` is 2 × 2 on phones.
 */
export function StatusToggleGroup({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  layout = "grid",
  disabled,
}: {
  name: string;
  /** Screen-reader legend (translated). */
  legend: string;
  options: StatusOption[];
  value?: string | null;
  defaultValue?: string;
  onChange?: (value: string) => void;
  layout?: "grid" | "row";
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      <div
        className={cn(
          "grid gap-2",
          layout === "row" ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {options.map((o) => (
          <label key={o.value} className="relative min-w-0">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === undefined ? undefined : value === o.value}
              defaultChecked={value === undefined ? defaultValue === o.value : undefined}
              onChange={() => onChange?.(o.value)}
              aria-label={o.srLabel}
              className="peer sr-only"
            />
            <span
              aria-hidden={o.srLabel ? true : undefined}
              className={cn(
                "flex h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-card font-semibold text-secondary-foreground transition-colors select-none hover:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 peer-disabled:cursor-default peer-disabled:opacity-60 peer-disabled:hover:bg-card",
                layout === "row" ? "truncate px-1 text-sm" : "px-3 text-[15px]",
                CHECKED[o.tone],
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
