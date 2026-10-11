"use client";

import { ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  Field,
  FormMessage,
  SelectField,
  SubmitButton,
  TimezoneField,
} from "@/components/patterns";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { ActionState } from "@/lib/actions";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { createCenterAction, setLogoAction } from "./actions";

const LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Wizard steps 1–2 (10): the center (name, logo, language, currency, time zone) and its first branch.
 * The center is created when this form is saved; the logo is uploaded right after, then step 3 opens.
 */
export function CreateCenterForm({
  defaultLocale,
  defaultTimezone,
  currency,
}: {
  defaultLocale: string;
  defaultTimezone: string;
  currency: string;
}) {
  const t = useTranslations("onboarding");
  const tl = useTranslations("locale");
  const router = useRouter();
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState(false);

  const submit = async (prev: ActionState, form: FormData): Promise<ActionState> => {
    const result = await createCenterAction(prev, form);
    if (!result?.ok || !result.data?.centerId) return result;
    const centerId = result.data.centerId;
    if (logo) {
      const ext = logo.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${centerId}/logo-${Date.now()}.${ext}`;
      const { error } = await createBrowserSupabase()
        .storage.from("center-assets")
        .upload(path, logo);
      if (!error) await setLogoAction(centerId, path);
    }
    router.push("/onboarding/rooms");
    return result;
  };
  const [state, action] = useActionState(submit, null);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">
        {t("stepCenter")}
      </p>
      <Field
        name="name"
        label={t("centerName")}
        placeholder={t("centerNamePlaceholder")}
        state={state}
        required
      />
      <div className="space-y-2">
        <Label htmlFor="center-logo">{t("logo")}</Label>
        <label
          htmlFor="center-logo"
          className="flex h-12 cursor-pointer items-center gap-3 rounded-xl bg-muted px-4 text-[15px] text-muted-foreground transition-colors hover:bg-muted/70"
        >
          <ImagePlus className="size-5 text-primary" />
          <span className="truncate">{logo ? logo.name : t("logoHint")}</span>
        </label>
        <input
          id="center-logo"
          type="file"
          accept={LOGO_TYPES}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            const tooBig = Boolean(file && file.size > MAX_LOGO_BYTES);
            setLogoError(tooBig);
            setLogo(tooBig ? null : file);
          }}
        />
        {logoError ? <p className="text-sm text-destructive">{t("logoTooBig")}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="locale"
          label={t("language")}
          state={state}
          defaultValue={defaultLocale}
          options={routing.locales.map((l) => ({ value: l, label: tl(l) }))}
        />
        <div className="space-y-2">
          <Label htmlFor="center-currency">{t("currency")}</Label>
          <input
            id="center-currency"
            value={currency}
            readOnly
            className="h-12 w-full rounded-xl bg-muted px-4 text-[15px] text-muted-foreground"
          />
        </div>
      </div>
      <TimezoneField label={t("timezone")} state={state} defaultValue={defaultTimezone} />
      <Separator className="my-2" />
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">
        {t("stepBranch")}
      </p>
      <p className="text-[15px] text-muted-foreground">{t("firstBranchHint")}</p>
      <Field
        name="branchName"
        label={t("branchName")}
        placeholder={t("branchNamePlaceholder")}
        state={state}
        required
      />
      <Field name="branchAddress" label={t("branchAddress")} state={state} />
      <SubmitButton className="w-full">{t("submit")}</SubmitButton>
    </form>
  );
}
