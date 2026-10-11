"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  Field,
  FormMessage,
  SelectField,
  SubmitButton,
  TimezoneField,
} from "@/components/patterns";
import { routing } from "@/i18n/routing";
import { updateCenterAction } from "../actions";

export function CenterForm({
  center,
  editable,
}: {
  center: { name: string; defaultLocale: string; timezone: string };
  editable: boolean;
}) {
  const t = useTranslations("settings.center");
  const tl = useTranslations("locale");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateCenterAction, null);

  useEffect(() => {
    if (state?.ok) toast.success(tc("saved"));
  }, [state, tc]);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <fieldset disabled={!editable} className="space-y-4 disabled:opacity-80">
        <Field name="name" label={t("name")} defaultValue={center.name} state={state} required />
        <SelectField
          name="defaultLocale"
          label={t("defaultLocale")}
          state={state}
          defaultValue={center.defaultLocale}
          disabled={!editable}
          options={routing.locales.map((l) => ({ value: l, label: tl(l) }))}
        />
        <TimezoneField
          label={t("timezone")}
          hint={t("timezoneHint")}
          state={state}
          defaultValue={center.timezone}
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
