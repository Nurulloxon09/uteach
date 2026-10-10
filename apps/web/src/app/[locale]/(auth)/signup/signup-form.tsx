"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-bits";
import { Link } from "@/i18n/navigation";
import { signUpAction } from "../actions";

export function SignupForm({ next }: { next: string | null }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(signUpAction, null);

  return (
    <form action={action} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormMessage state={state} />
      <Field
        name="fullName"
        autoComplete="name"
        label={t("fields.fullName")}
        state={state}
        required
      />
      <Field
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        label={t("fields.phone")}
        placeholder={t("fields.phonePlaceholder")}
        hint={t("signup.phoneHint")}
        state={state}
        required
      />
      <Field
        name="password"
        type="password"
        autoComplete="new-password"
        label={t("fields.password")}
        hint={t("fields.passwordHint")}
        state={state}
        required
      />
      <SubmitButton className="w-full">{t("signup.submit")}</SubmitButton>
      <p className="text-center text-sm">
        <Link
          href={next ? { pathname: "/login", query: { next } } : "/login"}
          className="underline-offset-4 hover:underline"
        >
          {t("signup.toLogin")}
        </Link>
      </p>
    </form>
  );
}
