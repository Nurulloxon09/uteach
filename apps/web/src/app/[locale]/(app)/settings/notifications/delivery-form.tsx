"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { CheckboxField, Field, FormMessage, SubmitButton } from "@/components/patterns";
import { updateDeliverySettingsAction } from "./actions";

export type DeliverySettings = {
  reminderEveryDays: number;
  dueSoon: boolean;
  smsEnabled: boolean;
  smsMonthlyCap: number;
};

/** Settings → Notifications → reminders and SMS (15, 17). Owners edit; others read. */
export function DeliveryForm({
  settings,
  editable,
}: {
  settings: DeliverySettings;
  editable: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateDeliverySettingsAction, null);

  useEffect(() => {
    if (state?.ok) toast.success(tc("saved"));
  }, [state, tc]);

  return (
    <form action={action} className="space-y-4" noValidate data-testid="delivery-settings">
      <FormMessage state={state} />
      <fieldset disabled={!editable} className="space-y-4 disabled:opacity-80">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="reminderEveryDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            label={t("reminderEveryDays")}
            hint={t("reminderEveryDaysHint")}
            defaultValue={settings.reminderEveryDays}
            state={state}
            required
          />
          <Field
            name="smsMonthlyCap"
            type="number"
            inputMode="numeric"
            min={0}
            label={t("smsMonthlyCap")}
            hint={t("smsMonthlyCapHint")}
            defaultValue={settings.smsMonthlyCap}
            state={state}
            required
          />
        </div>
        <CheckboxField
          name="dueSoon"
          value="on"
          label={t("dueSoon")}
          hint={t("dueSoonHint")}
          defaultChecked={settings.dueSoon}
          disabled={!editable}
        />
        <CheckboxField
          name="smsEnabled"
          value="on"
          label={t("smsEnabled")}
          hint={t("smsEnabledHint")}
          defaultChecked={settings.smsEnabled}
          disabled={!editable}
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
