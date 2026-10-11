import { CircleAlert, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Centered state block (put it inside a `Section`): soft icon circle, title, one-line hint, one action. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-4 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="max-w-sm">
        <p className="text-lg font-bold text-foreground">{title}</p>
        {hint ? <p className="mt-1 text-[15px] text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState(props: Omit<Parameters<typeof EmptyState>[0], "icon">) {
  return <EmptyState icon={CircleAlert} {...props} />;
}

/** Skeletons shaped like the content that is loading. */
export function LoadingState({
  variant = "table",
  rows = 5,
  label,
}: {
  variant?: "table" | "cards" | "detail";
  rows?: number;
  /** Screen-reader text (translated). */
  label: string;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {variant === "table" ? (
        <>
          <Skeleton className="h-14 w-full" />
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border/70 px-2 py-3 last:border-0"
            >
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
          ))}
        </>
      ) : variant === "cards" ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full max-w-md" />
          ))}
        </>
      )}
    </div>
  );
}
