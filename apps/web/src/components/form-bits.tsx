"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

/** Submit button that disables itself while the form's action runs. */
export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {children}
    </Button>
  );
}

/** Form-level error or success message from an ActionState. */
export function FormMessage({ state, success }: { state: ActionState; success?: ReactNode }) {
  const t = useTranslations("errors");
  if (!state) return null;
  if (state.ok) {
    return success ? (
      <Alert>
        <AlertDescription>{success}</AlertDescription>
      </Alert>
    ) : null;
  }
  if (!state.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{t(state.error as never)}</AlertDescription>
    </Alert>
  );
}

type FieldProps = ComponentProps<typeof Input> & {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  state: ActionState;
};

/** Label + input + translated field error. */
export function Field({ name, label, hint, state, className, ...input }: FieldProps) {
  const t = useTranslations("errors");
  const error = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  const echoed = state && !state.ok ? state.values?.[name] : undefined;
  const id = input.id ?? `field-${name}`;
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
        defaultValue={echoed ?? input.defaultValue}
      />
      {hint && !error ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {t(error as never)}
        </p>
      ) : null}
    </div>
  );
}

/** Translated error under a custom control. */
export function FieldError({ name, state }: { name: string; state: ActionState }) {
  const t = useTranslations("errors");
  const error = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  if (!error) return null;
  return <p className="text-sm text-destructive">{t(error as never)}</p>;
}

/** A styled native <select>, for long lists like time zones. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
