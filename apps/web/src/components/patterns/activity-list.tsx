import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { StatTone } from "./stat-tiles";

const TONES: Record<StatTone, string> = {
  purple: "bg-stat-purple",
  blue: "bg-stat-blue",
  orange: "bg-stat-orange",
  green: "bg-stat-green",
};

export type ActivityItem = {
  key: string;
  icon: LucideIcon;
  tone: StatTone;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  href?: string;
};

/** A list of tinted-icon rows (reference `ActivityList`): title, one-line description, meta on the right. */
export function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <ul>
      {items.map(({ key, icon: Icon, tone, title, description, meta, href }) => {
        const row = (
          <>
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl text-primary",
                TONES[tone],
              )}
            >
              <Icon className="size-5" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-foreground">
                {title}
              </span>
              {description ? (
                <span className="block truncate text-sm text-muted-foreground">{description}</span>
              ) : null}
            </span>
            {meta ? <span className="shrink-0 text-sm text-muted-foreground">{meta}</span> : null}
          </>
        );
        return (
          <li key={key} className="border-b border-border/70 last:border-0">
            {href ? (
              <Link
                href={href}
                className="-mx-2 flex items-center gap-3.5 rounded-xl px-2 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {row}
              </Link>
            ) : (
              <div className="flex items-center gap-3.5 py-4">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
