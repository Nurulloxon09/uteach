"use client";

import type { Locale } from "@uteach/i18n";
import { renderTemplate, samplePayload, type TemplateKey } from "@uteach/i18n/notifications";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CheckboxField, ConfirmDialog, Field, FieldError, FormDialog } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/actions";
import { resetTemplateAction, saveTemplateAction } from "./actions";

export type TemplateText = { body: string; systemBody: string; smsId: string | null };

export type TemplateEntry = {
  key: TemplateKey;
  enabled: boolean;
  customized: boolean;
  /** Per channel and language: what applies now and the system text. */
  telegram: Partial<Record<Locale, TemplateText>>;
  sms: Partial<Record<Locale, TemplateText>>;
};

const LOCALES: Locale[] = ["uz", "ru", "en"];

/** A text with its live preview (rendered with the key's sample values). */
function TemplateText({
  name,
  label,
  templateKey,
  locale,
  initial,
  center,
  currency,
  today,
  state,
  disabled,
}: {
  name: string;
  label: string;
  templateKey: TemplateKey;
  locale: Locale;
  initial: string;
  center: string;
  currency: string;
  today: string;
  state: ActionState;
  disabled: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const echoed = state && !state.ok ? state.values?.[name] : undefined;
  const [body, setBody] = useState(echoed ?? initial);
  let preview: string | null = null;
  try {
    preview = renderTemplate(body, samplePayload(templateKey, center), { locale, currency, today });
  } catch {
    preview = null;
  }
  const id = `field-${name}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        disabled={disabled}
        className="min-h-28"
      />
      <FieldError name={name} state={state} />
      <div
        className="rounded-xl border border-border bg-card px-4 py-3"
        data-testid={`preview-${name}`}
      >
        <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("preview")}
        </p>
        {preview ? (
          <p className="text-[15px] whitespace-pre-wrap text-foreground">{preview}</p>
        ) : (
          <p className="text-[15px] text-destructive">{t("previewInvalid")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Edit one message (17): on/off for the whole key, the Telegram text per language and, for keys that can go by
 * SMS, the SMS text and its Eskiz template id. Only differences from the system text are stored.
 */
export function TemplateEditor({
  entry,
  center,
  currency,
  today,
  editable,
}: {
  entry: TemplateEntry;
  center: string;
  currency: string;
  /** "YYYY-MM-DD" in the center: previews leave out this year, as sent messages do. */
  today: string;
  editable: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const tl = useTranslations("locale");
  const tc = useTranslations("common");
  const [resetOpen, setResetOpen] = useState(false);
  const hasSms = LOCALES.some((l) => entry.sms[l]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormDialog
        trigger={
          <Button variant="outline" size="sm" data-testid={`edit-${entry.key}`}>
            {editable ? tc("edit") : t("view")}
          </Button>
        }
        title={t(`keys.${entry.key}.title`)}
        description={t(`keys.${entry.key}.hint`)}
        action={saveTemplateAction}
        submitLabel={tc("save")}
        successToast={tc("saved")}
        testId="template-editor"
      >
        {(state) => (
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            <input type="hidden" name="key" value={entry.key} />
            <CheckboxField
              name="enabled"
              value="on"
              label={t("enabled")}
              hint={t("enabledHint")}
              defaultChecked={entry.enabled}
              disabled={!editable}
            />
            <Tabs defaultValue="uz">
              <TabsList aria-label={t("language")}>
                {LOCALES.map((l) => (
                  <TabsTrigger key={l} value={l}>
                    {tl(l)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {LOCALES.map((l) => (
                // Every language stays in the form; inactive tabs are only hidden.
                <TabsContent
                  key={l}
                  value={l}
                  forceMount
                  className="space-y-5 data-[state=inactive]:hidden"
                >
                  {entry.telegram[l] ? (
                    <TemplateText
                      name={`telegram.${l}`}
                      label={t("telegramText")}
                      templateKey={entry.key}
                      locale={l}
                      initial={entry.telegram[l].body}
                      center={center}
                      currency={currency}
                      today={today}
                      state={state}
                      disabled={!editable}
                    />
                  ) : null}
                  {entry.sms[l] ? (
                    <>
                      <TemplateText
                        name={`sms.${l}`}
                        label={t("smsText")}
                        templateKey={entry.key}
                        locale={l}
                        initial={entry.sms[l].body}
                        center={center}
                        currency={currency}
                        today={today}
                        state={state}
                        disabled={!editable}
                      />
                      <Field
                        name={`smsId.${l}`}
                        label={t("eskizId")}
                        hint={t("eskizIdHint")}
                        defaultValue={entry.sms[l].smsId ?? ""}
                        state={state}
                        disabled={!editable}
                        maxLength={64}
                      />
                    </>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
            {hasSms ? <p className="text-sm text-muted-foreground">{t("smsHint")}</p> : null}
          </div>
        )}
      </FormDialog>
      {editable && entry.customized ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
            {t("reset")}
          </Button>
          <ConfirmDialog
            open={resetOpen}
            onOpenChange={setResetOpen}
            title={t("resetTitle")}
            description={t("resetHint")}
            confirmLabel={t("reset")}
            action={resetTemplateAction}
            fields={{ key: entry.key }}
            successToast={tc("saved")}
          />
        </>
      ) : null}
    </div>
  );
}
