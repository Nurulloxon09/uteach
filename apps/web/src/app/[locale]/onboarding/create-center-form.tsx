"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";
import { Field, FieldError, FormMessage, NativeSelect, SubmitButton } from "@/components/form-bits";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { routing } from "@/i18n/routing";
import { createCenterAction } from "./actions";

export function CreateCenterForm({
  defaultLocale,
  timezoneSelect,
}: {
  defaultLocale: string;
  timezoneSelect: ReactNode;
}) {
  const t = useTranslations("onboarding");
  const tl = useTranslations("locale");
  const [state, action] = useActionState(createCenterAction, null);

  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <Field
        name="name"
        label={t("centerName")}
        placeholder={t("centerNamePlaceholder")}
        state={state}
        required
      />
      <div className="grid gap-2">
        <Label htmlFor="field-locale">{t("language")}</Label>
        <NativeSelect id="field-locale" name="locale" defaultValue={defaultLocale}>
          {routing.locales.map((l) => (
            <option key={l} value={l}>
              {tl(l)}
            </option>
          ))}
        </NativeSelect>
        <FieldError name="locale" state={state} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="field-timezone">{t("timezone")}</Label>
        {timezoneSelect}
        <FieldError name="timezone" state={state} />
      </div>
      <Separator />
      <p className="text-sm text-muted-foreground">{t("firstBranchHint")}</p>
      <Field
        name="branchName"
        label={t("branchName")}
        placeholder={t("branchNamePlaceholder")}
        state={state}
        required
      />
      <Field name="branchAddress" label={t("branchAddress")} state={state} />
      <SubmitButton className="w-full">{t("submit")}</SubmitButton>
    </form>
  );
}
