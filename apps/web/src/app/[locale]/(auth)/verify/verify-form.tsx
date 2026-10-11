"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-bits";
import { Button } from "@/components/ui/button";
import { resendCodeAction, verifyAction } from "../actions";

export function VerifyForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(verifyAction, null);
  const [resendState, resend, resending] = useActionState(resendCodeAction, null);

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4" noValidate>
        <FormMessage state={state} />
        <Field
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          label={t("fields.code")}
          state={state}
          autoFocus
          required
        />
        <SubmitButton className="w-full">{t("verify.submit")}</SubmitButton>
      </form>
      <form action={resend}>
        <FormMessage state={resendState} success={t("verify.resent")} />
        <Button type="submit" variant="ghost" className="w-full" disabled={resending}>
          {t("verify.resend")}
        </Button>
      </form>
    </div>
  );
}
