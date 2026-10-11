import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function PageHeader({
  title,
  crumbs,
  action,
}: {
  title: string;
  crumbs: { label: string; to?: string }[];
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[28px]">
          {title}
        </h1>
        <nav aria-label="Breadcrumb" className="mt-2 flex items-center gap-2 text-[15px]">
          {crumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground/70">/</span>}
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
      {action}
    </div>
  );
}
