"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";
import { Field, FieldError, FormMessage, NativeSelect, SubmitButton } from "@/components/form-bits";
import { Label } from "@/components/ui/label";
import { routing } from "@/i18n/routing";
import { updateCenterAction } from "../actions";

export function CenterForm({
  center,
  editable,
  timezoneSelect,
}: {
  center: { name: string; defaultLocale: string };
  editable: boolean;
  timezoneSelect: ReactNode;
}) {
  const t = useTranslations("settings.center");
  const tl = useTranslations("locale");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateCenterAction, null);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} success={tc("saved")} />
      <fieldset disabled={!editable} className="grid gap-4">
        <Field name="name" label={t("name")} defaultValue={center.name} state={state} required />
        <div className="grid gap-2">
          <Label htmlFor="field-defaultLocale">{t("defaultLocale")}</Label>
          <NativeSelect
            id="field-defaultLocale"
            name="defaultLocale"
            defaultValue={center.defaultLocale}
          >
            {routing.locales.map((l) => (
              <option key={l} value={l}>
                {tl(l)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="field-timezone">{t("timezone")}</Label>
          {timezoneSelect}
          <p className="text-sm text-muted-foreground">{t("timezoneHint")}</p>
          <FieldError name="timezone" state={state} />
        </div>
      </fieldset>
      {editable ? (
        <div>
          <SubmitButton>{tc("save")}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
