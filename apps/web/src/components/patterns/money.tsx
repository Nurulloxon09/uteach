import { ArrowRight } from "lucide-react";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

type Minor = string | number | bigint;

/** Tone of a balance: debt (negative) destructive, credit (positive) success, zero plain. */
function balanceTone(minor: Minor): string {
  const value = BigInt(minor);
  return value < 0n ? "text-destructive" : value > 0n ? "text-success" : "text-foreground";
}

/**
 * A formatted amount (minor units in, "540 000 so'm" out), tabular digits. `tone="balance"` colours debt and
 * credit; `abs` drops the sign (e.g. "Debt 540 000" already says which way). Works in server and client trees.
 */
export function MoneyAmount({
  minor,
  currency,
  tone = "plain",
  abs = false,
  className,
}: {
  minor: Minor;
  currency: string;
  tone?: "plain" | "balance" | "muted";
  abs?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const value = BigInt(minor);
  const shown = abs && value < 0n ? -value : value;
  return (
    <span
      className={cn(
        "font-semibold whitespace-nowrap tabular-nums",
        tone === "balance" && balanceTone(value),
        tone === "muted" && "text-muted-foreground line-through",
        className,
      )}
    >
      {formatMinor(shown, currency, locale)}
    </span>
  );
}

/**
 * "Balance now → after this payment" (05-ui, M3 plan), used by the payment and adjustment dialogs so staff see
 * the result before saving. `after` null = the amount isn't valid yet.
 */
export function BalancePreview({
  before,
  after,
  beforeLabel,
  afterLabel,
  describe,
}: {
  before: Minor;
  after: Minor | null;
  beforeLabel: ReactNode;
  afterLabel: ReactNode;
  /** Words for a balance ("Debt 540 000", "Settled"), so the sign is never the only cue. */
  describe: (minor: bigint) => ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-primary-soft/50 p-4"
      data-testid="balance-preview"
    >
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{beforeLabel}</p>
        <p className={cn("mt-1 font-bold", balanceTone(before))}>{describe(BigInt(before))}</p>
      </div>
      <ArrowRight className="size-4 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{afterLabel}</p>
        <p
          className={cn(
            "mt-1 font-bold",
            after === null ? "text-muted-foreground" : balanceTone(after),
          )}
          data-testid="balance-after"
        >
          {after === null ? "—" : describe(BigInt(after))}
        </p>
      </div>
    </div>
  );
}
