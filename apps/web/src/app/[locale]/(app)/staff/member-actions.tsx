"use client";

import { Link2, Pencil, UserCheck, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ConfirmDialog,
  FormMessage,
  RowActions,
  SubmitButton,
  type RowAction,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { regenerateInviteAction, setMemberStatusAction } from "./actions";
import { EditMemberDialog, type EditableMember } from "./edit-member-dialog";
import { InviteLink } from "./invite-link";

/** Row actions on the staff list: new invite link (invited), disable (with confirmation) or enable. */
export function MemberActions({
  membershipId,
  name,
  status,
  edit,
}: {
  membershipId: string;
  name: string;
  status: "invited" | "active" | "disabled";
  /** Present when the viewer may edit this member. */
  edit?: {
    member: EditableMember;
    branches: { id: string; name: string }[];
    flags: string[];
    canEditFlags: boolean;
  };
}) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const editAction: RowAction[] = edit
    ? [
        {
          key: "edit",
          label: tc("rowEdit", { name }),
          icon: Pencil,
          onSelect: () => setEditOpen(true),
        },
      ]
    : [];
  const statusActions: RowAction[] =
    status === "invited"
      ? [
          {
            key: "link",
            label: t("rowNewLink", { name }),
            icon: Link2,
            onSelect: () => setLinkOpen(true),
          },
        ]
      : status === "active"
        ? [
            {
              key: "disable",
              label: t("rowDisable", { name }),
              icon: UserX,
              tone: "destructive",
              onSelect: () => setConfirmOpen(true),
            },
          ]
        : [
            {
              key: "enable",
              label: t("rowEnable", { name }),
              icon: UserCheck,
              disabled: pending,
              onSelect: () =>
                startTransition(async () => {
                  const form = new FormData();
                  form.set("membershipId", membershipId);
                  form.set("status", "active");
                  const result = await setMemberStatusAction(null, form);
                  if (result?.ok) toast.success(t("enabledToast"));
                }),
            },
          ];

  const actions = [...editAction, ...statusActions];

  return (
    <>
      <RowActions actions={actions} />
      {edit ? (
        <EditMemberDialog
          member={edit.member}
          open={editOpen}
          onOpenChange={setEditOpen}
          branches={edit.branches}
          flags={edit.flags}
          canEditFlags={edit.canEditFlags}
        />
      ) : null}
      {status === "invited" ? (
        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("newLinkTitle")}</DialogTitle>
              <DialogDescription>{t("newLinkDescription")}</DialogDescription>
            </DialogHeader>
            {linkOpen ? <NewLinkBody membershipId={membershipId} /> : null}
          </DialogContent>
        </Dialog>
      ) : null}
      {status === "active" ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t("disableTitle")}
          description={t("disableDescription")}
          confirmLabel={t("disable")}
          tone="destructive"
          action={setMemberStatusAction}
          fields={{ membershipId, status: "disabled" }}
          successToast={t("disabledToast")}
        />
      ) : null}
    </>
  );
}

function NewLinkBody({ membershipId }: { membershipId: string }) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const [state, action] = useActionState(regenerateInviteAction, null);

  if (state?.ok && state.data?.inviteUrl) {
    return (
      <>
        <div className="mt-5">
          <InviteLink url={state.data.inviteUrl} title={t("linkReady")} hint={t("linkHint")} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button className="px-7">{tc("done")}</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="membershipId" value={membershipId} />
      <FormMessage state={state} />
      <DialogFooter className="mt-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {tc("cancel")}
          </Button>
        </DialogClose>
        <SubmitButton>{t("newLink")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
