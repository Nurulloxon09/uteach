"use client";

import { AlertTriangle } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FormMessage,
  SubmitButton,
  WeeklySlotsField,
  type WeeklySlot,
} from "@/components/patterns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { weekdayLabels } from "@/lib/dates";
import { checkRulesAction, saveRulesAction, type RuleConflict } from "../actions";

type Option = { value: string; label: string };

/**
 * The group's weekly times. Saving first runs the conflict pre-check (13): clashes are listed and the user
 * can still save; generation then records them in the conflicts inbox. Saving regenerates future lessons.
 */
export function RulesEditor({
  groupId,
  slots,
  rooms,
  teachers,
  timeZone,
}: {
  groupId: string;
  slots: WeeklySlot[];
  rooms: Option[];
  teachers: Option[];
  timeZone: string;
}) {
  const t = useTranslations("groups.schedule");
  const locale = useLocale();
  const format = useFormatter();
  const longDays = useMemo(() => weekdayLabels(locale, "long"), [locale]);
  const [state, formAction] = useActionState(saveRulesAction, null);
  const [conflicts, setConflicts] = useState<RuleConflict[] | null>(null);
  const [checking, setChecking] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(
        t("saved", {
          created: Number(state.data?.created ?? 0),
          conflicts: Number(state.data?.conflicts ?? 0),
        }),
      );
    }
  }, [state, t]);

  const submit = (force: boolean) => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    if (force) {
      setConflicts(null);
      startTransition(() => formAction(data));
      return;
    }
    setChecking(true);
    void checkRulesAction(groupId, String(data.get("slots") ?? "[]")).then((found) => {
      setChecking(false);
      if (found && found.length > 0) setConflicts(found);
      else startTransition(() => formAction(data));
    });
  };

  return (
    <form
      ref={formRef}
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <p className="text-[15px] text-muted-foreground">{t("hint")}</p>
      <FormMessage state={state} />
      <WeeklySlotsField
        name="slots"
        label={t("slots")}
        state={state}
        defaultValue={slots}
        onChange={() => setConflicts(null)}
        dayLabels={longDays}
        rooms={rooms}
        teachers={teachers}
      />
      {conflicts ? (
        <Alert variant="destructive" data-testid="rules-conflicts">
          <AlertTriangle />
          <AlertDescription>
            <p className="font-semibold">{t("conflictsTitle", { count: conflicts.length })}</p>
            <ul className="mt-2 space-y-1">
              {conflicts.slice(0, 5).map((c) => (
                <li key={`${c.startsAt}-${c.kind}`}>
                  {t(c.kind === "room" ? "conflictRoom" : "conflictTeacher", {
                    when: format.dateTime(new Date(c.startsAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone,
                    }),
                    group: c.otherGroup,
                  })}
                </li>
              ))}
            </ul>
            <p className="mt-2">{t("conflictsHint")}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        {conflicts ? (
          <Button type="button" variant="outline" onClick={() => submit(true)}>
            {t("saveAnyway")}
          </Button>
        ) : null}
        <SubmitButton disabled={checking}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
