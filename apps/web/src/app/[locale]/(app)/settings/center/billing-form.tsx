"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/patterns";
import { minorToInput } from "@/lib/validation";
import { updateBillingSettingsAction } from "../actions";

export type BillingSettings = {
  /** Minor units, as a decimal string. */
  roundingUnit: string;
  dueDays: number;
  leavePolicy: "ask" | "credit" | "no_credit";
};

/** Center settings → Billing (15): rounding, due days, unused-lessons policy. Owners edit; others read. */
export function BillingForm({
  settings,
  editable,
}: {
  settings: BillingSettings;
  editable: boolean;
}) {
  const t = useTranslations("settings.center");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateBillingSettingsAction, null);

  useEffect(() => {
    if (state?.ok) toast.success(tc("saved"));
  }, [state, tc]);

  return (
    <form action={action} className="space-y-4" noValidate data-testid="billing-settings">
      <FormMessage state={state} />
      <fieldset disabled={!editable} className="space-y-4 disabled:opacity-80">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="roundingUnit"
            inputMode="decimal"
            label={t("roundingUnit")}
            hint={t("roundingUnitHint")}
            defaultValue={minorToInput(settings.roundingUnit)}
            state={state}
            required
          />
          <Field
            name="dueDays"
            type="number"
            inputMode="numeric"
            min={0}
            max={90}
            label={t("dueDays")}
            defaultValue={settings.dueDays}
            state={state}
            required
          />
        </div>
        <SelectField
          name="leavePolicy"
          label={t("leavePolicy")}
          state={state}
          defaultValue={settings.leavePolicy}
          disabled={!editable}
          options={(["ask", "credit", "no_credit"] as const).map((p) => ({
            value: p,
            label: t(`policies.${p}`),
          }))}
        />
      </fieldset>
      {editable ? (
        <div className="flex justify-end pt-2">
          <SubmitButton>{tc("save")}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
