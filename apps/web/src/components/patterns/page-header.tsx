import { Plus, type LucideIcon } from "lucide-react";
import { Fragment, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/** Page title + breadcrumb + one main action (reference `PageHeader`). */
export function PageHeader({
  title,
  crumbs = [],
  action,
  breadcrumbLabel,
  meta,
}: {
  title: ReactNode;
  crumbs?: Crumb[];
  action?: ReactNode;
  /** aria-label of the breadcrumb nav (translated). */
  breadcrumbLabel?: string;
  /** Small extra line under the title (e.g. a status chip). */
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[28px]">
          {title}
        </h1>
        {crumbs.length > 0 ? (
          <nav
            aria-label={breadcrumbLabel}
            className="mt-2 flex flex-wrap items-center gap-2 text-[15px]"
          >
            {crumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 ? <span className="text-muted-foreground/70">/</span> : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            ))}
          </nav>
        ) : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action}
    </div>
  );
}

/** The outlined primary page action with a `+` icon (reference "Add Teacher" button). */
export function PageAction({
  icon: Icon = Plus,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & { icon?: LucideIcon }) {
  return (
    <Button variant="outline-primary" size="lg" className={cn(className)} {...props}>
      {props.asChild ? (
        children
      ) : (
        <>
          <Icon className="size-[18px]" strokeWidth={2.4} />
          {children}
        </>
      )}
    </Button>
  );
}
