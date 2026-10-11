"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next: string | null }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(loginAction, null);

  return (
    <form action={action} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
      <Field
        name="password"
        type="password"
        autoComplete="current-password"
        label={t("fields.password")}
        state={state}
        required
      />
      <SubmitButton className="w-full">{t("login.submit")}</SubmitButton>
      <div className="flex flex-col gap-2 text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {t("login.forgot")}
        </Link>
        <Link
          href={next ? { pathname: "/signup", query: { next } } : "/signup"}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("login.toSignup")}
        </Link>
      </div>
    </form>
  );
}
