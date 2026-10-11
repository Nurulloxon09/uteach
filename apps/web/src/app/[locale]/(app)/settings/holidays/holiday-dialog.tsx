"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  ConfirmDialog,
  Field,
  FormDialog,
  PageAction,
  RowActions,
  SelectField,
} from "@/components/patterns";
import type { ActionState } from "@/lib/actions";
import { addHolidayAction, removeHolidayAction } from "./actions";

const ALL = "__all__";

/** "+ Add holiday": a date, a name and the branch (or every branch, owners only). */
export function AddHolidayDialog({
  branches,
  allowCenterWide,
  defaultDate,
}: {
  branches: { id: string; name: string }[];
  allowCenterWide: boolean;
  defaultDate: string;
}) {
  const t = useTranslations("holidays");

  const action = async (prev: ActionState, form: FormData) => {
    if (form.get("branchId") === ALL) form.set("branchId", "");
    const result = await addHolidayAction(prev, form);
    if (result?.ok) toast.success(t("added", { count: Number(result.data?.cancelled ?? 0) }));
    return result;
  };

  const options = [
    ...(allowCenterWide ? [{ value: ALL, label: t("allBranches") }] : []),
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ];

  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      title={t("addTitle")}
      description={t("addHint")}
      action={action}
      submitLabel={t("addSubmit")}
      testId="holiday-dialog"
    >
      {(state) => (
        <>
          <Field
            name="date"
            type="date"
            label={t("fields.date")}
            defaultValue={defaultDate}
            state={state}
            required
          />
          <Field
            name="name"
            label={t("fields.name")}
            placeholder={t("fields.namePlaceholder")}
            state={state}
            required
          />
          <SelectField
            name="branchId"
            label={t("fields.branch")}
            state={state}
            defaultValue={options[0]?.value}
            options={options}
          />
        </>
      )}
    </FormDialog>
  );
}

/** Remove a holiday (its cancelled lessons come back). */
export function HolidayRowActions({ id, name }: { id: string; name: string }) {
  const t = useTranslations("holidays");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowActions
        actions={[
          {
            key: "remove",
            label: t("removeRow", { name }),
            icon: Trash2,
            tone: "destructive",
            onSelect: () => setOpen(true),
          },
        ]}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("removeTitle")}
        description={t("removeDescription")}
        confirmLabel={tc("remove")}
        tone="destructive"
        action={removeHolidayAction}
        fields={{ id }}
        successToast={t("removed")}
      />
    </>
  );
}
