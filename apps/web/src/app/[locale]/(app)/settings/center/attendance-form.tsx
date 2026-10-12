"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { CheckboxField, Field, FormMessage, SubmitButton } from "@/components/patterns";
import { updateAttendanceSettingsAction } from "../actions";

export type AttendanceSettings = {
  editHours: number;
  alertDelay: number;
  lateAlerts: boolean;
  /** "HH:MM" */
  quietStart: string;
  quietEnd: string;
};

/** Center settings → Attendance & notifications (14, 17). Owners edit; everyone else reads. */
export function AttendanceForm({
  settings,
  editable,
}: {
  settings: AttendanceSettings;
  editable: boolean;
}) {
  const t = useTranslations("settings.center");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateAttendanceSettingsAction, null);

  useEffect(() => {
    if (state?.ok) toast.success(tc("saved"));
  }, [state, tc]);

  return (
    <form action={action} className="space-y-4" noValidate data-testid="attendance-settings">
      <FormMessage state={state} />
      <fieldset disabled={!editable} className="space-y-4 disabled:opacity-80">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="editHours"
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            label={t("editHours")}
            hint={t("editHoursHint")}
            defaultValue={settings.editHours}
            state={state}
            required
          />
          <Field
            name="alertDelay"
            type="number"
            inputMode="numeric"
            min={0}
            max={240}
            label={t("alertDelay")}
            hint={t("alertDelayHint")}
            defaultValue={settings.alertDelay}
            state={state}
            required
          />
        </div>
        <CheckboxField
          name="lateAlerts"
          value="on"
          label={t("lateAlerts")}
          defaultChecked={settings.lateAlerts}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="quietStart"
            type="time"
            step={300}
            label={t("quietStart")}
            defaultValue={settings.quietStart}
            state={state}
            required
          />
          <Field
            name="quietEnd"
            type="time"
            step={300}
            label={t("quietEnd")}
            defaultValue={settings.quietEnd}
            state={state}
            required
          />
        </div>
        <p className="text-sm text-muted-foreground">{t("quietHint")}</p>
      </fieldset>
      {editable ? (
        <div className="flex justify-end pt-2">
          <SubmitButton>{tc("save")}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
