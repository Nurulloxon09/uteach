import { Check, Minus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type Step = {
  key: string;
  label: string;
  state: "done" | "skipped" | "current" | "todo";
  /** Done, skipped and current steps can link back to their page. */
  href?: string;
};

/**
 * Numbered steps of the onboarding wizard (05-ui, M1): done = primary check, current = primary ring,
 * skipped = muted dash. A horizontal list that wraps on phones.
 */
export function Stepper({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((step, i) => {
          const marker = (
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                step.state === "done" && "bg-primary text-primary-foreground",
                step.state === "current" && "bg-primary-soft text-primary ring-2 ring-primary",
                step.state === "skipped" && "bg-muted text-muted-foreground",
                step.state === "todo" && "border border-border bg-card text-muted-foreground",
              )}
            >
              {step.state === "done" ? (
                <Check className="size-4" strokeWidth={3} />
              ) : step.state === "skipped" ? (
                <Minus className="size-4" />
              ) : (
                i + 1
              )}
            </span>
          );
          const text = (
            <span
              className={cn(
                "text-sm font-medium",
                step.state === "current"
                  ? "text-primary"
                  : step.state === "todo"
                    ? "text-muted-foreground"
                    : "text-secondary-foreground",
              )}
            >
              {step.label}
            </span>
          );
          return (
            <li
              key={step.key}
              className="flex items-center gap-2"
              aria-current={step.state === "current" ? "step" : undefined}
            >
              {step.href && step.state !== "todo" ? (
                <Link
                  href={step.href}
                  className="flex items-center gap-2 rounded-full pr-2 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {marker}
                  {text}
                </Link>
              ) : (
                <span className="flex items-center gap-2 pr-2">
                  {marker}
                  {text}
                </span>
              )}
              {i < steps.length - 1 ? (
                <span aria-hidden className="hidden h-px w-6 bg-border sm:block" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
