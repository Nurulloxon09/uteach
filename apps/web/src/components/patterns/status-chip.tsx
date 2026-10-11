import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ChipTone = "primary" | "success" | "warning" | "destructive" | "muted";

const TONES: Record<ChipTone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

/** Small status chip, tone by meaning (05-ui §5); the reference's "ID" chip is the primary tone. */
export function StatusChip({
  tone = "primary",
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
