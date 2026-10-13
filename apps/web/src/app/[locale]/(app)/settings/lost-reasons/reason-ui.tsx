"use client";

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog, Field, FormDialog, PageAction, RowActions } from "@/components/patterns";
import { useRouter } from "@/i18n/navigation";
import {
  addLostReasonAction,
  archiveLostReasonAction,
  moveLostReasonAction,
  renameLostReasonAction,
} from "./actions";

export function AddReasonDialog() {
  const t = useTranslations("lostReasons");
  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      title={t("addTitle")}
      action={addLostReasonAction}
      submitLabel={t("addSubmit")}
      successToast={t("added")}
      testId="reason-dialog"
    >
      {(state) => <Field name="label" label={t("fields.label")} state={state} required />}
    </FormDialog>
  );
}

/** Rename, move up / down, archive or restore one reason. */
export function ReasonRowActions({
  id,
  label,
  archived,
  first,
  last,
}: {
  id: string;
  label: string;
  archived: boolean;
  first: boolean;
  last: boolean;
}) {
  const t = useTranslations("lostReasons");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [renaming, setRenaming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const move = (direction: "up" | "down") =>
    startTransition(async () => {
      const result = await moveLostReasonAction(id, direction);
      if (result && !result.ok) toast.error(te((result.error ?? "generic") as never));
      else router.refresh();
    });

  return (
    <>
      <RowActions
        actions={[
          {
            key: "up",
            label: t("moveUp"),
            icon: ArrowUp,
            onSelect: () => move("up"),
            disabled: first || pending,
          },
          {
            key: "down",
            label: t("moveDown"),
            icon: ArrowDown,
            onSelect: () => move("down"),
            disabled: last || pending,
          },
          { key: "rename", label: t("rename"), icon: Pencil, onSelect: () => setRenaming(true) },
          {
            key: "archive",
            label: archived ? tc("restore") : tc("archive"),
            icon: archived ? ArchiveRestore : Archive,
            tone: archived ? "default" : "destructive",
            onSelect: () => setArchiving(true),
          },
        ]}
      />
      <FormDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t("renameTitle")}
        action={renameLostReasonAction}
        submitLabel={tc("save")}
        successToast={tc("saved")}
      >
        {(state) => (
          <>
            <input type="hidden" name="id" value={id} />
            <Field
              name="label"
              label={t("fields.label")}
              defaultValue={label}
              state={state}
              required
            />
          </>
        )}
      </FormDialog>
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={archived ? t("restoreTitle", { label }) : t("archiveTitle", { label })}
        description={archived ? undefined : t("archiveHint")}
        confirmLabel={archived ? tc("restore") : tc("archive")}
        tone={archived ? "default" : "destructive"}
        action={archiveLostReasonAction}
        fields={{ id, restore: archived ? "1" : "0" }}
        successToast={archived ? tc("restored") : tc("archivedToast")}
      />
    </>
  );
}
