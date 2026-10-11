import { cn } from "@/lib/utils";

const TINTS = ["bg-stat-purple", "bg-stat-blue", "bg-stat-green", "bg-stat-orange"] as const;

const SIZES = {
  sm: "size-9 text-xs",
  md: "size-10 text-xs",
  lg: "size-14 text-base",
} as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters
    .map((p) => Array.from(p ?? "")[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

/** Same name → same tint, so a person keeps their color across screens. */
export function tintFor(name: string): (typeof TINTS)[number] {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

/** Round initials avatar in a stat tint (reference teacher table and profile cards). */
export function InitialsAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-foreground/70",
        SIZES[size],
        tintFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
