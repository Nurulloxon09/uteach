import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { PALETTE_BLOCK, type PaletteKey } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { MobileCard, MobileList } from "./mobile-list";

export type LessonListItem = {
  id: string;
  /** e.g. "18:00–19:30" */
  time: string;
  title: string;
  subtitle?: string;
  palette: PaletteKey;
  status?: ReactNode;
  cancelled?: boolean;
  href?: string;
  actions?: ReactNode;
};

/**
 * Lessons as full-width cards (teacher's Today, and the timetable below `md`): a time block tinted by the
 * teacher's color, the group, room/teacher and a status. Tap targets are the whole card (≥ 48 px).
 */
export function LessonList({ items, testId }: { items: LessonListItem[]; testId?: string }) {
  return (
    <MobileList>
      {items.map((item) => {
        const body = (
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "grid min-h-12 w-[4.75rem] shrink-0 place-items-center rounded-xl border-l-4 px-2 text-center text-sm font-bold",
                PALETTE_BLOCK[item.palette],
              )}
            >
              {item.time}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-[15px] font-semibold text-foreground",
                  item.cancelled && "line-through opacity-60",
                )}
              >
                {item.title}
              </p>
              {item.subtitle ? (
                <p className="truncate text-sm text-muted-foreground">{item.subtitle}</p>
              ) : null}
            </div>
            {item.status}
            {item.actions}
            {item.href ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" /> : null}
          </div>
        );
        return (
          <MobileCard key={item.id} data-testid={testId}>
            {item.href ? (
              <Link
                href={item.href}
                className="-m-4 block rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </MobileCard>
        );
      })}
    </MobileList>
  );
}
