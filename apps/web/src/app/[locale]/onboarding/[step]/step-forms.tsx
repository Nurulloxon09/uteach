"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  CheckboxField,
  CheckboxGroup,
  Field,
  FormMessage,
  SubmitButton,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COURSE_PRESETS, type LaterStep } from "@/lib/onboarding";
import { addCoursesAction, addRoomsAction, completeStepAction, skipStepAction } from "../actions";

/** "Skip this step" (recorded as skipped; the step stays reachable from the stepper). */
export function SkipButton({ step }: { step: LaterStep }) {
  const t = useTranslations("onboarding");
  const [, action] = useActionState(skipStepAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="step" value={step} />
      <Button type="submit" variant="ghost" data-testid="skip-step">
        {t("skip")}
      </Button>
    </form>
  );
}

/** Continue without entering anything on this step (import, staff). */
export function ContinueButton({ step, label }: { step: LaterStep; label: string }) {
  const [state, action] = useActionState(completeStepAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="step" value={step} />
      <SubmitButton className="w-full" data-testid="continue-step">
        {label}
      </SubmitButton>
    </form>
  );
}

/** Step 3: a quick list of rooms (name + capacity). */
export function RoomsStepForm() {
  const t = useTranslations("onboarding");
  const [state, action] = useActionState(addRoomsAction, null);
  const [rows, setRows] = useState(3);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`room-${i}`} className="text-sm">
              {t("roomName", { n: i + 1 })}
            </Label>
            <Input
              id={`room-${i}`}
              name="roomName"
              placeholder={t("roomPlaceholder", { n: i + 1 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`capacity-${i}`} className="text-sm">
              {t("roomCapacity")}
            </Label>
            <Input
              id={`capacity-${i}`}
              name="roomCapacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => setRows(rows + 1)}>
        <Plus />
        {t("addRoomRow")}
      </Button>
      <SubmitButton className="w-full" data-testid="continue-step">
        {t("continue")}
      </SubmitButton>
    </form>
  );
}

/** Step 4: pick course presets (created with their levels) and/or one custom course. */
export function CoursesStepForm() {
  const t = useTranslations("onboarding");
  const [state, action] = useActionState(addCoursesAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <CheckboxGroup legend={t("presetsLegend")} name="preset" state={state}>
        <div className="grid gap-1 sm:grid-cols-2">
          {COURSE_PRESETS.map((p) => (
            <CheckboxField
              key={p.key}
              name="preset"
              value={p.key}
              label={t(`presets.${p.key}.name`)}
              hint={t(`presets.${p.key}.levels`) || undefined}
            />
          ))}
        </div>
      </CheckboxGroup>
      <Field
        name="customCourse"
        label={t("customCourse")}
        placeholder={t("customCoursePlaceholder")}
        state={state}
      />
      <SubmitButton className="w-full" data-testid="continue-step">
        {t("continue")}
      </SubmitButton>
    </form>
  );
}
