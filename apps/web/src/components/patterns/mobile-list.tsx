import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Phone lists (not in the reference; built in its style). `card` = full-width cards for teacher screens;
 * `inset` = bordered cards inside a Section (what DataTable rows become below `sm`).
 */
export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("space-y-3", className)}>{children}</ul>;
}

export function MobileCard({
  children,
  variant = "card",
  className,
  ...props
}: {
  children: ReactNode;
  variant?: "card" | "inset";
  className?: string;
} & Omit<React.ComponentProps<"li">, "children">) {
  return (
    <li
      className={cn(
        variant === "card"
          ? "rounded-2xl bg-card p-4 shadow-card"
          : "rounded-xl border border-border/70 bg-card p-4",
        className,
      )}
      {...props}
    >
      {children}
    </li>
  );
}

/** The usual content of a mobile card: avatar + title/subtitle, a status, 2–3 key fields, actions. */
export function MobileRecord({
  avatar,
  title,
  subtitle,
  status,
  fields = [],
  actions,
}: {
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  fields?: { label: ReactNode; value: ReactNode }[];
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {status}
      </div>
      {fields.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {fields.map((f, i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 truncate text-secondary-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? (
        <div className="flex justify-end border-t border-border/70 pt-2">{actions}</div>
      ) : null}
    </div>
  );
}
