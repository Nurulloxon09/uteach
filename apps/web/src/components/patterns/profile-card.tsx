import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Profile card from the reference `teachers.details`: avatar `size-14`, name `text-lg font-bold`, subtitle,
 * contact rows with primary icons, a chip (e.g. ID) in `bg-primary-soft`.
 */
export function ProfileCard({
  avatar,
  name,
  subtitle,
  rows = [],
  chip,
  actions,
  className,
}: {
  avatar: ReactNode;
  name: ReactNode;
  subtitle?: ReactNode;
  rows?: { key: string; icon: LucideIcon; value: ReactNode }[];
  chip?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn("rounded-2xl bg-card p-6 shadow-card", className)}
      data-testid="profile-card"
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {avatar}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-foreground">{name}</h2>
            {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {actions}
      </div>
      {rows.length > 0 ? (
        <dl className="mt-5 space-y-3 text-[15px]">
          {rows.map(({ key, icon: Icon, value }) => (
            <div key={key} className="flex items-center gap-3 text-secondary-foreground">
              <Icon className="size-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
              <dd className="min-w-0 truncate">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {chip ? <div className="mt-5">{chip}</div> : null}
    </article>
  );
}

/** A profile chip like the reference "ID #0021" (`rounded-lg bg-primary-soft px-3 py-1.5`). */
export function ProfileChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-lg bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary">
      {children}
    </span>
  );
}
