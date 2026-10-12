"use client";

import { cn } from "@/lib/utils";

/**
 * A few mutually exclusive options in one `h-11 rounded-xl` box, sized like `FilterButton`
 * (e.g. Week | Day). The selected option is `bg-primary-soft text-primary`. On a narrow screen the options wrap
 * onto a second line instead of pushing the page wider.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-[34px] whitespace-nowrap rounded-lg px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
              selected
                ? "bg-primary-soft text-primary"
                : "text-secondary-foreground hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
