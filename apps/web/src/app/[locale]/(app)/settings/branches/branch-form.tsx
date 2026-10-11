"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Field, FormDialog, FormMessage, PageAction, SubmitButton, TimezoneField } from "@/components/patterns";
import type { ActionState } from "@/lib/actions";
import { createBranchAction, updateBranchAction } from "../actions";

type Branch = { id: string; name: string; address: string | null; phone: string | null; timezone: string };

function BranchFields({
  state,
  branch,
  defaultTimezone,
  disabled,
}: {
  state: ActionState;
  branch?: Branch;
  defaultTimezone: string;
  disabled?: boolean;
}) {
  const t = useTranslations("settings.branches.fields");
  return (
    <>
      <Field name="name" label={t("name")} defaultValue={branch?.name} state={state} required />
      <Field name="address" label={t("address")} defaultValue={branch?.address ?? ""} state={state} />
      <Field name="phone" type="tel" inputMode="tel" label={t("phone")} defaultValue={branch?.phone ?? ""} state={state} />
      <TimezoneField
        label={t("timezone")}
        hint={t("timezoneHint")}
        state={state}
        defaultValue={branch?.timezone ?? defaultTimezone}
        disabled={disabled}
      />
    </>
  );
}

/** "+ Add branch" page action and its FormDialog. */
export function AddBranchDialog({ defaultTimezone }: { defaultTimezone: string }) {
  const t = useTranslations("settings.branches");
  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      title={t("addTitle")}
      description={t("addHint")}
      action={createBranchAction}
      submitLabel={t("addSubmit")}
      successToast={t("added")}
      testId="branch-dialog"
    >
      {(state) => <BranchFields state={state} defaultTimezone={defaultTimezone} />}
    </FormDialog>
  );
}

/** Inline edit form on the branch detail page (Details tab). */
export function EditBranchForm({ branch, editable }: { branch: Branch; editable: boolean }) {
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateBranchAction, null);
  useEffect(() => {
    if (state?.ok) toast.success(tc("saved"));
  }, [state, tc]);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={branch.id} />
      <FormMessage state={state} />
      <fieldset disabled={!editable} className="space-y-4 disabled:opacity-80">
        <BranchFields state={state} branch={branch} defaultTimezone={branch.timezone} disabled={!editable} />
      </fieldset>
      {editable ? (
        <div className="flex justify-end pt-2">
          <SubmitButton>{tc("save")}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
