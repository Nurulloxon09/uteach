"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { regenerateInviteAction, setMemberStatusAction } from "./actions";
import { InviteLink } from "./invite-link";

export function MemberActions({ membershipId, status }: { membershipId: string; status: string }) {
  const t = useTranslations("staff");
  const [linkState, regenerate] = useActionState(regenerateInviteAction, null);
  const [statusState, setStatus] = useActionState(setMemberStatusAction, null);

  if (status === "invited") {
    return (
      <div className="grid justify-items-end gap-2">
        {linkState?.ok && linkState.data?.inviteUrl ? (
          <InviteLink url={linkState.data.inviteUrl} />
        ) : null}
        <FormMessage state={linkState} />
        <form action={regenerate}>
          <input type="hidden" name="membershipId" value={membershipId} />
          <SubmitButton variant="outline" size="sm">
            {t("newLink")}
          </SubmitButton>
        </form>
      </div>
    );
  }

  const next = status === "active" ? "disabled" : "active";
  return (
    <div className="grid justify-items-end gap-2">
      <FormMessage state={statusState} />
      <form action={setStatus}>
        <input type="hidden" name="membershipId" value={membershipId} />
        <input type="hidden" name="status" value={next} />
        <SubmitButton variant={next === "disabled" ? "destructive" : "outline"} size="sm">
          {next === "disabled" ? t("disable") : t("enable")}
        </SubmitButton>
      </form>
    </div>
  );
}
