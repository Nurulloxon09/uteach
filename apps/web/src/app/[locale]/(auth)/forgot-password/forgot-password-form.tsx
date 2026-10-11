"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-bits";
import { Link } from "@/i18n/navigation";
import { forgotPasswordAction } from "../actions";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(forgotPasswordAction, null);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        label={t("fields.phone")}
        placeholder={t("fields.phonePlaceholder")}
        state={state}
        required
      />
      <SubmitButton className="w-full">{t("forgot.submit")}</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/login" className="underline-offset-4 hover:underline">
          {t("verify.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
