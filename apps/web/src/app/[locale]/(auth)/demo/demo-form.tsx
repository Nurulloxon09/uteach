"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { demoLoginAction } from "../actions";

export function DemoForm() {
  const t = useTranslations("auth.demo");
  const [state, action] = useActionState(demoLoginAction, null);

  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <SubmitButton className="w-full">{t("submit")}</SubmitButton>
      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {t("toLogin")}
        </Link>
      </p>
    </form>
  );
}
