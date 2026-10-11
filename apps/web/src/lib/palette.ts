/**
 * Teacher colors (02 memberships.color, 05-ui M1): palette keys mapped to theme tokens in globals.css.
 * Tailwind needs literal class names, so every class is spelled out here.
 */
export const PALETTE = [
  "violet",
  "sky",
  "orange",
  "green",
  "rose",
  "amber",
  "teal",
  "indigo",
] as const;

export type PaletteKey = (typeof PALETTE)[number];

export function isPaletteKey(value: unknown): value is PaletteKey {
  return typeof value === "string" && (PALETTE as readonly string[]).includes(value);
}

/** Soft fill + strong text + left border, for lesson blocks and chips. */
export const PALETTE_BLOCK: Record<PaletteKey, string> = {
  violet: "bg-palette-violet-soft text-palette-violet border-palette-violet",
  sky: "bg-palette-sky-soft text-palette-sky border-palette-sky",
  orange: "bg-palette-orange-soft text-palette-orange border-palette-orange",
  green: "bg-palette-green-soft text-palette-green border-palette-green",
  rose: "bg-palette-rose-soft text-palette-rose border-palette-rose",
  amber: "bg-palette-amber-soft text-palette-amber border-palette-amber",
  teal: "bg-palette-teal-soft text-palette-teal border-palette-teal",
  indigo: "bg-palette-indigo-soft text-palette-indigo border-palette-indigo",
};

/** A solid dot of the color (color pickers, legends). */
export const PALETTE_DOT: Record<PaletteKey, string> = {
  violet: "bg-palette-violet",
  sky: "bg-palette-sky",
  orange: "bg-palette-orange",
  green: "bg-palette-green",
  rose: "bg-palette-rose",
  amber: "bg-palette-amber",
  teal: "bg-palette-teal",
  indigo: "bg-palette-indigo",
};

/** A stable color for something without one (e.g. a teacher who never picked a color). */
export function paletteFor(key: string | null | undefined, fallbackSeed: string): PaletteKey {
  if (isPaletteKey(key)) return key;
  let hash = 0;
  for (const ch of fallbackSeed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}
