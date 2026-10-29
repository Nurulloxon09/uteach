"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/patterns";
import { routing } from "@/i18n/routing";
import { updateProfileAction } from "./actions";

export type MyProfile = { fullName: string; phone: string; locale: string };

/** My profile (M7g): name, contact phone and the language for messages to you. */
export function ProfileForm({ profile }: { profile: MyProfile }) {
  const t = useTranslations("profile");
  const ta = useTranslations("auth");
  const tl = useTranslations("locale");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateProfileAction, null);

  useEffect(() => {
    if (state?.ok) toast.success(tc("saved"));
  }, [state, tc]);

  return (
    <form action={action} className="space-y-4" noValidate data-testid="profile-form">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="fullName"
          autoComplete="name"
          label={ta("fields.fullName")}
          defaultValue={profile.fullName}
          state={state}
          required
        />
        <Field
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          label={ta("fields.phone")}
          placeholder={ta("fields.phonePlaceholder")}
          hint={t("phoneHint")}
          defaultValue={profile.phone}
          state={state}
          required
        />
        <SelectField
          name="locale"
          label={t("language")}
          hint={t("languageHint")}
          state={state}
          defaultValue={profile.locale}
          options={routing.locales.map((l) => ({ value: l, label: tl(l) }))}
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton>{tc("save")}</SubmitButton>
      </div>
    </form>
  );
}
