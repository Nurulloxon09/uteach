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

export type StatusOption = { value: string; label: string; tone: ChipTone };

/**
 * Big one-tap status buttons for phone lists (Present / Late / Absent / Excused in M2).
 * Native radio inputs underneath, so arrow keys and screen readers work.
 */
export function StatusToggleGroup({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  /** Screen-reader legend (translated). */
  legend: string;
  options: StatusOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === undefined ? undefined : value === o.value}
              defaultChecked={value === undefined ? defaultValue === o.value : undefined}
              onChange={() => onChange?.(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-3 text-[15px] font-semibold text-secondary-foreground transition-colors select-none hover:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30",
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
