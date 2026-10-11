import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type StatTone = "purple" | "blue" | "orange" | "green";

const TONES: Record<StatTone, string> = {
  purple: "bg-stat-purple",
  blue: "bg-stat-blue",
  orange: "bg-stat-orange",
  green: "bg-stat-green",
};

export type StatTile = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  icon: LucideIcon;
  tone: StatTone;
  href?: string;
};

/** Stat tiles from the reference dashboard (`StatCards`): soft tint, label, big value, icon box; lift on hover. */
export function StatTiles({ items, className }: { items: StatTile[]; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        items.length >= 4 ? "xl:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : "",
        className,
      )}
    >
      {items.map(({ key, label, value, icon: Icon, tone, href }) => {
        const body = (
          <>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-secondary-foreground/80">{label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card/60 text-primary">
              <Icon className="size-5" strokeWidth={1.9} aria-hidden />
            </span>
          </>
        );
        const tileClass = cn(
          "flex items-start justify-between gap-3 rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5",
          TONES[tone],
        );
        return href ? (
          <Link
            key={key}
            href={href}
            className={cn(
              tileClass,
              "outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            )}
            data-testid="stat-tile"
          >
            {body}
          </Link>
        ) : (
          <div key={key} className={tileClass} data-testid="stat-tile">
            {body}
          </div>
        );
      })}
    </div>
  );
}
