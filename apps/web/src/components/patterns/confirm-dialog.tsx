"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, type ReactNode } from "react";
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
} from "@/components/ui/dialog";
import type { ActionState } from "@/lib/actions";
import { FormMessage, SubmitButton } from "./fields";

/**
 * "Are you sure?" in the FormDialog style. Submits hidden `fields` to `action`; closes on success.
 * Used for archive (and later delete/void) actions.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "default",
  action,
  fields,
  successToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  tone?: "default" | "destructive";
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  successToast?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {open ? (
          <ConfirmBody
            action={action}
            fields={fields}
            confirmLabel={confirmLabel}
            tone={tone}
            successToast={successToast}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  action,
  fields,
  confirmLabel,
  tone,
  successToast,
  onDone,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  confirmLabel: ReactNode;
  tone: "default" | "destructive";
  successToast?: string;
  onDone: () => void;
}) {
  const t = useTranslations("common");
  const [state, formAction] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok) {
      if (successToast) toast.success(successToast);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <FormMessage state={state} />
      <DialogFooter className="mt-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <SubmitButton variant={tone === "destructive" ? "destructive" : "default"}>
          {confirmLabel}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
