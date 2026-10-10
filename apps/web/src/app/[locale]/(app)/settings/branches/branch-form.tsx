"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Field, FieldError, FormMessage, SubmitButton } from "@/components/form-bits";
import { Label } from "@/components/ui/label";
import { createBranchAction, updateBranchAction } from "../actions";

type Branch = { id: string; name: string; address: string | null; phone: string | null };

/** Create a branch, or edit one when `branch` is given. */
export function BranchForm({
  branch,
  editable = true,
  timezoneSelect,
}: {
  branch?: Branch;
  editable?: boolean;
  timezoneSelect: ReactNode;
}) {
  const t = useTranslations("settings.branches");
  const tc = useTranslations("common");
  const [state, action] = useActionState(branch ? updateBranchAction : createBranchAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && !branch) formRef.current?.reset();
  }, [state, branch]);

  return (
    <form ref={formRef} action={action} className="grid gap-4" noValidate>
      {branch ? <input type="hidden" name="id" value={branch.id} /> : null}
      <FormMessage state={state} success={branch ? tc("saved") : t("added")} />
      <fieldset disabled={!editable} className="grid gap-4">
        <Field
          name="name"
          label={t("fields.name")}
          defaultValue={branch?.name}
          state={state}
          required
        />
        <Field
          name="address"
          label={t("fields.address")}
          defaultValue={branch?.address ?? ""}
          state={state}
        />
        <Field
          name="phone"
          type="tel"
          inputMode="tel"
          label={t("fields.phone")}
          defaultValue={branch?.phone ?? ""}
          state={state}
        />
        <div className="grid gap-2">
          <Label htmlFor="field-timezone">{t("fields.timezone")}</Label>
          {timezoneSelect}
          <p className="text-sm text-muted-foreground">{t("fields.timezoneHint")}</p>
          <FieldError name="timezone" state={state} />
        </div>
      </fieldset>
      {editable ? (
        <div>
          <SubmitButton>{branch ? tc("save") : t("addSubmit")}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
