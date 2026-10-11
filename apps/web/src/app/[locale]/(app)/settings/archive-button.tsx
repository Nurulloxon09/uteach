"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog, RowActions, type RowAction } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { archiveBranchAction, archiveRoomAction } from "./actions";

type Kind = "branch" | "room";

function useArchive(kind: Kind, id: string, archived: boolean) {
  const tc = useTranslations("common");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const action = kind === "branch" ? archiveBranchAction : archiveRoomAction;

  const run = () => {
    if (!archived) return setConfirmOpen(true);
    startTransition(async () => {
      const form = new FormData();
      form.set("id", id);
      form.set("archived", "false");
      const result = await action(null, form);
      if (result?.ok) toast.success(tc("restored"));
    });
  };
  return { action, confirmOpen, setConfirmOpen, pending, run };
}

function ArchiveConfirm({
  kind,
  id,
  open,
  onOpenChange,
}: {
  kind: Kind;
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tc = useTranslations("common");
  const tb = useTranslations("settings.branches");
  const tr = useTranslations("settings.rooms");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "branch" ? tb("archiveTitle") : tr("archiveTitle")}
      description={tc("archiveConfirm")}
      confirmLabel={tc("archive")}
      tone="destructive"
      action={kind === "branch" ? archiveBranchAction : archiveRoomAction}
      fields={{ id, archived: "true" }}
      successToast={tc("archivedToast")}
    />
  );
}

/** Row actions for a branch or room: the given extra actions plus Archive (confirmed) / Restore. */
export function ArchiveRowActions({
  kind,
  id,
  name,
  archived,
  extra = [],
}: {
  kind: Kind;
  id: string;
  name: string;
  archived: boolean;
  extra?: RowAction[];
}) {
  const tc = useTranslations("common");
  const a = useArchive(kind, id, archived);
  return (
    <>
      <RowActions
        actions={[
          ...extra,
          {
            key: "archive",
            label: archived ? tc("rowRestore", { name }) : tc("rowArchive", { name }),
            icon: archived ? ArchiveRestore : Archive,
            tone: archived ? "default" : "destructive",
            onSelect: a.run,
            disabled: a.pending,
          },
        ]}
      />
      <ArchiveConfirm kind={kind} id={id} open={a.confirmOpen} onOpenChange={a.setConfirmOpen} />
    </>
  );
}

/** Full-size Archive / Restore button (branch detail page). */
export function ArchiveButton({
  kind,
  id,
  archived,
}: {
  kind: Kind;
  id: string;
  archived: boolean;
}) {
  const tc = useTranslations("common");
  const a = useArchive(kind, id, archived);
  return (
    <>
      <Button type="button" variant="outline" onClick={a.run} disabled={a.pending}>
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? tc("restore") : tc("archive")}
      </Button>
      <ArchiveConfirm kind={kind} id={id} open={a.confirmOpen} onOpenChange={a.setConfirmOpen} />
    </>
  );
}
