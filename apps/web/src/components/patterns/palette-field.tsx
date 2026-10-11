"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PALETTE, PALETTE_DOT, type PaletteKey } from "@/lib/palette";
import { cn } from "@/lib/utils";

/**
 * Timetable color picker: eight round swatches from the palette tokens, as a radio group (keyboard and
 * screen readers get the color names). Submits the key in a hidden input named `name`.
 */
export function PaletteField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: PaletteKey | null;
}) {
  const t = useTranslations("palette");
  const [value, setValue] = useState<PaletteKey | null>(defaultValue ?? null);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-[15px] text-secondary-foreground">{label}</legend>
      <input type="hidden" name={name} value={value ?? ""} />
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
        {PALETTE.map((key) => {
          const selected = key === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(key)}
              onClick={() => setValue(key)}
              className={cn(
                "grid size-9 place-items-center rounded-full text-primary-foreground outline-none ring-offset-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/40",
                PALETTE_DOT[key],
                selected && "ring-2 ring-foreground/30",
              )}
            >
              {selected ? <Check className="size-4" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
