"use client";

import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendReminderAction } from "../broadcasts/actions";

/** Debtors → "Send reminder" (15, 17): queues the payment reminder now; once a day per student. */
export function ReminderButton({ studentId, name }: { studentId: string; name: string }) {
  const t = useTranslations("debtors");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState(sendReminderAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (state.data?.queued === "0") toast.info(t("reminderAlready", { name }));
      else toast.success(t("reminderQueued", { name }));
    } else if (state.error) {
      toast.error(te(state.error as never));
    }
  }, [state, t, te, name]);

  return (
    <form action={action}>
      <input type="hidden" name="studentId" value={studentId} />
      <Button
        type="submit"
        variant="outline"
        size="icon-sm"
        disabled={pending}
        aria-label={t("remind", { name })}
        title={t("remind", { name })}
        data-testid="send-reminder"
      >
        <BellRing />
      </Button>
    </form>
  );
}
