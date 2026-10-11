"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/patterns";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(resetPasswordAction, null);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        name="password"
        type="password"
        autoComplete="new-password"
        label={t("fields.newPassword")}
        hint={t("fields.passwordHint")}
        state={state}
        required
      />
      <Field
        name="confirm"
        type="password"
        autoComplete="new-password"
        label={t("fields.confirmPassword")}
        state={state}
        required
      />
      <SubmitButton className="w-full">{t("reset.submit")}</SubmitButton>
    </form>
  );
}
