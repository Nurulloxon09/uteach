"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  AudiencePicker,
  CheckboxField,
  Field,
  FieldError,
  FormDialog,
  SegmentedControl,
  type Audience,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions";
import { createBroadcastAction, previewBroadcastAction, type BroadcastPreview } from "./actions";

type Option = { value: string; label: string };

export type ComposerOptions = {
  branches: Option[];
  groups: Option[];
  courses: Option[];
  /** An approved `broadcast` SMS template exists (else SMS is shown disabled). */
  smsAvailable: boolean;
  /** "YYYY-MM-DD" in the center's timezone, the earliest day to schedule. */
  today: string;
};

/** A fixed list of students (Students / Debtors → "Message this list") instead of the audience picker. */
export type ComposerPreset = { studentIds: string[]; label: string };

const EMPTY: Audience = {
  branchIds: [],
  groupIds: [],
  courseIds: [],
  debtors: false,
  recipients: "guardians",
};

function ComposerFields({
  state,
  options,
  preset,
  initialDebtors,
}: {
  state: ActionState;
  options: ComposerOptions;
  preset?: ComposerPreset;
  initialDebtors: boolean;
}) {
  const t = useTranslations("broadcasts");
  const tl = useTranslations("locale");
  const [audience, setAudience] = useState<Audience>({ ...EMPTY, debtors: initialDebtors });
  const [preview, setPreview] = useState<BroadcastPreview>(null);
  const [loading, startLoading] = useTransition();
  const [channel, setChannel] = useState<"telegram" | "sms">("telegram");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [perLocale, setPerLocale] = useState(false);

  const payload = { ...audience, studentIds: preset?.studentIds ?? [] };
  const payloadKey = JSON.stringify(payload);
  useEffect(() => {
    startLoading(async () => {
      setPreview(await previewBroadcastAction(JSON.parse(payloadKey) as Audience));
    });
  }, [payloadKey]);

  const echo = (name: string) => (state && !state.ok ? state.values?.[name] : undefined);

  return (
    <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
      <input type="hidden" name="audience" value={payloadKey} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="when" value={when} />

      {preset ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-[15px] text-foreground">{preset.label}</p>
      ) : (
        <AudiencePicker
          value={audience}
          onChange={setAudience}
          branches={options.branches}
          groups={options.groups}
          courses={options.courses}
          labels={{
            branches: t("audience.branches"),
            groups: t("audience.groups"),
            courses: t("audience.courses"),
            all: t("audience.all"),
            everyone: t("audience.everyone"),
            debtors: t("audience.debtors"),
            recipients: t("audience.recipients"),
            guardians: t("audience.guardians"),
            students: t("audience.students"),
            both: t("audience.both"),
          }}
        />
      )}
      {preset ? (
        <SegmentedControl
          label={t("audience.recipients")}
          value={audience.recipients}
          onChange={(recipients) => setAudience({ ...audience, recipients })}
          testId="audience-recipients"
          options={[
            { value: "guardians", label: t("audience.guardians") },
            { value: "students", label: t("audience.students") },
            { value: "both", label: t("audience.both") },
          ]}
        />
      ) : null}

      <p
        className="text-[15px] text-muted-foreground"
        aria-live="polite"
        data-testid="broadcast-preview"
      >
        {loading || !preview
          ? t("counting")
          : t("previewCount", {
              recipients: preview.recipients,
              students: preview.students,
              withoutTelegram: preview.withoutTelegram,
            })}
      </p>

      <div className="space-y-2">
        <Label htmlFor="field-body">{t("text")}</Label>
        <Textarea
          id="field-body"
          name="body"
          maxLength={2000}
          defaultValue={echo("body")}
          aria-invalid={state && !state.ok && state.fieldErrors?.body ? true : undefined}
          className="min-h-28"
          required
        />
        <FieldError name="body" state={state} />
        <p className="text-sm text-muted-foreground">{t("textHint")}</p>
      </div>
      {/* A toggle button, not a checkbox: React's form reset would untick a checkbox and drop the texts. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={perLocale}
        onClick={() => setPerLocale((v) => !v)}
      >
        {perLocale ? t("perLocaleHide") : t("perLocale")}
      </Button>
      {perLocale
        ? (["uz", "ru", "en"] as const).map((l) => (
            <div key={l} className="space-y-2">
              <Label htmlFor={`field-body.${l}`}>{tl(l)}</Label>
              <Textarea
                id={`field-body.${l}`}
                name={`body.${l}`}
                maxLength={2000}
                defaultValue={echo(`body.${l}`)}
              />
            </div>
          ))
        : null}

      <div className="space-y-2">
        <p className="text-[15px] text-secondary-foreground">{t("channel")}</p>
        <SegmentedControl
          label={t("channel")}
          value={channel}
          onChange={(c) => (c === "sms" && !options.smsAvailable ? null : setChannel(c))}
          options={[
            { value: "telegram", label: t("channels.telegram") },
            { value: "sms", label: t("channels.sms") },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          {options.smsAvailable ? t("smsCost") : t("smsUnavailable")}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[15px] text-secondary-foreground">{t("when")}</p>
        <SegmentedControl
          label={t("when")}
          value={when}
          onChange={setWhen}
          testId="broadcast-when"
          options={[
            { value: "now", label: t("now") },
            { value: "later", label: t("later") },
          ]}
        />
        {when === "later" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="date"
              type="date"
              min={options.today}
              label={t("date")}
              state={state}
              required
            />
            <Field name="time" type="time" label={t("time")} state={state} required />
          </div>
        ) : null}
      </div>
      <CheckboxField
        name="confirm"
        value="on"
        label={t("confirm", { recipients: preview?.recipients ?? 0 })}
        hint={t("confirmHint")}
      />
    </div>
  );
}

/**
 * New broadcast (17): audience (or a fixed list of students), text with optional translations, channel
 * (Telegram; SMS only with an approved template), now or later. The count comes from the same database query
 * that sends it.
 */
export function BroadcastComposer({
  trigger,
  options,
  preset,
  initialDebtors = false,
}: {
  trigger: ReactNode;
  options: ComposerOptions;
  preset?: ComposerPreset;
  initialDebtors?: boolean;
}) {
  const t = useTranslations("broadcasts");
  return (
    <FormDialog
      trigger={trigger}
      title={t("newTitle")}
      description={t("newHint")}
      action={createBroadcastAction}
      submitLabel={t("send")}
      testId="broadcast-composer"
      success={(state) => (
        <p className="text-[15px] font-semibold text-foreground" data-testid="broadcast-queued">
          {t("queued", { recipients: Number(state.data?.recipients ?? 0) })}
        </p>
      )}
    >
      {(state) => (
        <ComposerFields
          state={state}
          options={options}
          preset={preset}
          initialDebtors={initialDebtors}
        />
      )}
    </FormDialog>
  );
}
