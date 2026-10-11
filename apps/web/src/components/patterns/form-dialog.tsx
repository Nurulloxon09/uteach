"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "./fields";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;
type Success = Extract<ActionState, { ok: true }>;

/**
 * A form in a dialog (reference "Add Teacher" dialog, Radix underneath: focus trap, Esc, aria).
 * Fields get the current ActionState so they can show errors. On success it closes and shows
 * `successToast`, or, when `success` is given, shows that content instead (e.g. a new invite link).
 */
export function FormDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  action,
  submitLabel,
  successToast,
  success,
  children,
  testId,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  action: Action;
  submitLabel: ReactNode;
  successToast?: string;
  success?: (state: Success) => ReactNode;
  children: (state: ActionState) => ReactNode;
  testId?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  // A new key per opening (by trigger or by the parent) resets the form and its ActionState.
  const [round, setRound] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRound((r) => r + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <FormDialogBody
          key={round}
          action={action}
          submitLabel={submitLabel}
          successToast={successToast}
          success={success}
          onDone={() => setOpen(false)}
        >
          {children}
        </FormDialogBody>
      </DialogContent>
    </Dialog>
  );
}

function FormDialogBody({
  action,
  submitLabel,
  successToast,
  success,
  onDone,
  children,
}: {
  action: Action;
  submitLabel: ReactNode;
  successToast?: string;
  success?: (state: Success) => ReactNode;
  onDone: () => void;
  children: (state: ActionState) => ReactNode;
}) {
  const t = useTranslations("common");
  const [state, formAction] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok && !success) {
      if (successToast) toast.success(successToast);
      onDone();
    }
    // onDone is stable enough for this effect; re-run only when the result changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state?.ok && success) {
    return (
      <>
        <div className="mt-5">{success(state)}</div>
        <DialogFooter>
          <DialogClose asChild>
            <Button className="px-7">{t("done")}</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={formAction} className="mt-5 space-y-4" noValidate>
      <FormMessage state={state} />
      {children(state)}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <SubmitButton>{submitLabel}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
