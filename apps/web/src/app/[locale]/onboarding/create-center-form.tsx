"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormMessage, SelectField, SubmitButton, TimezoneField } from "@/components/patterns";
import { Separator } from "@/components/ui/separator";
import { routing } from "@/i18n/routing";
import { createCenterAction } from "./actions";

export function CreateCenterForm({
  defaultLocale,
  defaultTimezone,
}: {
  defaultLocale: string;
  defaultTimezone: string;
}) {
  const t = useTranslations("onboarding");
  const tl = useTranslations("locale");
  const [state, action] = useActionState(createCenterAction, null);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field name="name" label={t("centerName")} placeholder={t("centerNamePlaceholder")} state={state} required />
      <SelectField
        name="locale"
        label={t("language")}
        state={state}
        defaultValue={defaultLocale}
        options={routing.locales.map((l) => ({ value: l, label: tl(l) }))}
      />
      <TimezoneField label={t("timezone")} state={state} defaultValue={defaultTimezone} />
      <Separator className="my-2" />
      <p className="text-[15px] text-muted-foreground">{t("firstBranchHint")}</p>
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
