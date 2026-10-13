"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FormDialog, SelectField } from "@/components/patterns";
import { Textarea } from "@/components/ui/textarea";
import { markLostAction } from "./actions";

export type ReasonOption = { id: string; label: string };

/** Moving a lead to Lost: a reason is required, a note is optional (11). */
export function LostDialog({
  leadId,
  leadName,
  reasons,
  open,
  onOpenChange,
  trigger,
}: {
  leadId: string;
  leadName: string;
  reasons: ReasonOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  const t = useTranslations("leads");
  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t("lost.title", { name: leadName })}
      description={t("lost.hint")}
      action={markLostAction}
      submitLabel={t("lost.submit")}
      successToast={t("lost.done")}
      testId="lost-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="leadId" value={leadId} />
          <SelectField
            name="reasonId"
            label={t("lost.reason")}
            placeholder={t("lost.reasonPlaceholder")}
            state={state}
            options={reasons.map((r) => ({ value: r.id, label: r.label }))}
          />
          <div className="space-y-2">
            <label htmlFor="lost-note" className="text-[15px] text-secondary-foreground">
              {t("lost.note")}
            </label>
            <Textarea
              id="lost-note"
              name="note"
              rows={3}
              maxLength={500}
              defaultValue={state && !state.ok ? (state.values?.note ?? "") : ""}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}
