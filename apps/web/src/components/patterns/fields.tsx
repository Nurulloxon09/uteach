"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Combobox, type ComboboxOption } from "./combobox";

/** The translated field error and the echoed value for `name` from an ActionState. */
function fieldState(state: ActionState, name: string) {
  return {
    error: state && !state.ok ? state.fieldErrors?.[name] : undefined,
    echoed: state && !state.ok ? state.values?.[name] : undefined,
  };
}

/** Submit button that disables itself while the form's action runs. */
export function SubmitButton({ children, className, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cn("px-7", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

/** Form-level error (or optional success) message from an ActionState. */
export function FormMessage({ state, success }: { state: ActionState; success?: ReactNode }) {
  const t = useTranslations("errors");
  if (!state) return null;
  if (state.ok) {
    return success ? (
      <Alert variant="success">
        <AlertDescription>{success}</AlertDescription>
      </Alert>
    ) : null;
  }
  if (!state.error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{t(state.error as never)}</AlertDescription>
    </Alert>
  );
}

/** Translated error under a control. */
export function FieldError({ name, state, id }: { name: string; state: ActionState; id?: string }) {
  const t = useTranslations("errors");
  const { error } = fieldState(state, name);
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {t(error as never)}
    </p>
  );
}

function FieldShell({
  id,
  name,
  label,
  hint,
  state,
  className,
  children,
}: {
  id: string;
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  state: ActionState;
  className?: string;
  children: ReactNode;
}) {
  const { error } = fieldState(state, name);
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      <FieldError name={name} state={state} id={`${id}-error`} />
    </div>
  );
}

type FieldProps = ComponentProps<typeof Input> & {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  state: ActionState;
};

/** Label + input + hint/error, styled like the reference dialog. Refills from `state.values` after an error. */
export function Field({ name, label, hint, state, className, ...input }: FieldProps) {
  const { error, echoed } = fieldState(state, name);
  const id = input.id ?? `field-${name}`;
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} state={state} className={className}>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
        defaultValue={input.value === undefined ? (echoed ?? input.defaultValue) : undefined}
      />
    </FieldShell>
  );
}

/** A short single-choice list (Radix Select; submits through its hidden native select). */
export function SelectField({
  name,
  label,
  hint,
  state,
  options,
  defaultValue,
  placeholder,
  disabled,
  className,
  onValueChange,
  value,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  state: ActionState;
  options: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
  value?: string;
}) {
  const { error, echoed } = fieldState(state, name);
  const id = `field-${name}`;
  const [own, setOwn] = useState(echoed ?? defaultValue ?? "");
  const current = value ?? own;
  // Radix renders its native <select> only after hydration, so a form submitted earlier would
  // lose this value ("Invalid value"). A plain hidden input is in the server HTML from the start.
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} state={state} className={className}>
      {disabled ? null : <input type="hidden" name={name} value={current} />}
      <Select
        value={current === "" ? undefined : current}
        onValueChange={(v) => {
          setOwn(v);
          onValueChange?.(v);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-invalid={error ? true : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

/** A searchable select (`Combobox`) with label and error. */
export function ComboboxField({
  name,
  label,
  hint,
  state,
  options,
  defaultValue,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  className,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  state: ActionState;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  className?: string;
}) {
  const { error, echoed } = fieldState(state, name);
  const id = `field-${name}`;
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} state={state} className={className}>
      <Combobox
        id={id}
        name={name}
        options={options}
        defaultValue={echoed ?? defaultValue}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        disabled={disabled}
        invalid={!!error}
      />
    </FieldShell>
  );
}

/** Checkbox with a label and an optional hint line; the whole row is clickable. */
export function CheckboxField({
  name,
  value,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  const id = `field-${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1.5 transition-colors hover:bg-muted/60"
    >
      <Checkbox
        id={id}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-foreground">{label}</span>
        {hint ? <span className="block text-sm text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/** A labelled group of checkboxes (fieldset + legend). */
export function CheckboxGroup({
  legend,
  name,
  state,
  children,
  className,
}: {
  legend: ReactNode;
  name: string;
  state: ActionState;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="mb-2 text-[15px] text-secondary-foreground">{legend}</legend>
      <div className="space-y-1">{children}</div>
      <FieldError name={name} state={state} />
    </fieldset>
  );
}
