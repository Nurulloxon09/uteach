"use client";

import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type RowAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: "default" | "destructive";
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
};

/** Icon actions at the end of a row (reference `RowActions`), each with a tooltip and an aria-label. */
export function RowActions({ actions, className }: { actions: RowAction[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {actions.map(({ key, label, icon: Icon, tone = "default", href, onSelect, disabled }) => {
        const cls = cn(
          "grid size-10 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-40 sm:size-9",
          tone === "destructive" ? "hover:text-destructive" : "hover:text-primary",
        );
        const icon = <Icon className="size-[18px]" strokeWidth={1.7} />;
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              {href ? (
                <Link href={href} aria-label={label} className={cls}>
                  {icon}
                </Link>
              ) : (
                <button type="button" aria-label={label} onClick={onSelect} disabled={disabled} className={cls}>
                  {icon}
                </button>
              )}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
