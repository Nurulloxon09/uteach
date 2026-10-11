import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TITLE_SIZES = {
  /** list pages ("Teachers Information") */
  default: "text-xl font-bold",
  /** dashboard heading ("Admin Dashboard") */
  dashboard: "text-[22px] font-bold tracking-tight",
  /** dashboard cards ("Star Students") */
  card: "text-[19px] font-bold tracking-tight",
} as const;

/** A content card: `rounded-2xl bg-card p-4 sm:p-6 shadow-card`, header row with title left and tools right. */
export function Section({
  title,
  titleSize = "default",
  description,
  tools,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  titleSize?: keyof typeof TITLE_SIZES;
  description?: ReactNode;
  tools?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  const hasHeader = title || tools;
  return (
    <section id={id} className={cn("rounded-2xl bg-card p-4 shadow-card sm:p-6", className)}>
      {hasHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title ? (
            <div className="min-w-0">
              <h2 className={cn("text-foreground", TITLE_SIZES[titleSize])}>{title}</h2>
              {description ? (
                <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>
              ) : null}
            </div>
          ) : null}
          {tools ? (
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">{tools}</div>
          ) : null}
        </div>
      ) : null}
      {children ? <div className={cn(hasHeader && "mt-5")}>{children}</div> : null}
    </section>
  );
}
