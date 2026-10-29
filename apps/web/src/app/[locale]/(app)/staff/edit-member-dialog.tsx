"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  CheckboxField,
  CheckboxGroup,
  Field,
  FormDialog,
  PaletteField,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { PaletteKey } from "@/lib/palette";
import { updateMemberAction } from "./actions";

export type EditableMember = {
  id: string;
  name: string;
  phone: string | null;
  role: "owner" | "admin" | "teacher";
  branchIds: string[];
  permissions: string[];
  color: PaletteKey | null;
};

/**
 * Edit a staff member: name, phone, branches, admin flags (owners only, 03) and timetable color.
 * Role changes aren't offered here.
 */
export function EditMemberDialog({
  member,
  open,
  onOpenChange,
  branches,
  flags,
  canEditFlags,
}: {
  member: EditableMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: { id: string; name: string }[];
  flags: string[];
  canEditFlags: boolean;
}) {
  const t = useTranslations("staff");
  const tf = useTranslations("flags");
  const tc = useTranslations("common");
  const tAuth = useTranslations("auth");
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("editTitle")}
      description={t("editHint", { name: member.name })}
      action={updateMemberAction}
      submitLabel={tc("save")}
      successToast={tc("saved")}
      testId="member-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="membershipId" value={member.id} />
          <Field
            name="displayName"
            label={t("fields.name")}
            defaultValue={member.name}
            state={state}
            required
          />
          <Field
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            label={t("fields.phone")}
            placeholder={tAuth("fields.phonePlaceholder")}
            defaultValue={member.phone ?? ""}
            state={state}
          />
          {member.role !== "owner" ? (
            <CheckboxGroup legend={t("fields.branches")} name="branchIds" state={state}>
              {branches.map((b) => (
                <CheckboxField
                  key={b.id}
                  name="branchIds"
                  value={b.id}
                  label={b.name}
                  defaultChecked={member.branchIds.includes(b.id)}
                />
              ))}
            </CheckboxGroup>
          ) : null}
          {member.role === "admin" && canEditFlags ? (
            <CheckboxGroup legend={t("fields.permissions")} name="permissions" state={state}>
              {flags.map((flag) => (
                <CheckboxField
                  key={flag}
                  name="permissions"
                  value={flag}
                  label={tf(`${flag}.label` as never)}
                  hint={tf(`${flag}.hint` as never)}
                  defaultChecked={member.permissions.includes(flag)}
                />
              ))}
            </CheckboxGroup>
          ) : null}
          <PaletteField name="color" label={t("fields.color")} defaultValue={member.color} />
        </>
      )}
    </FormDialog>
  );
}

/** "Edit" button for the staff profile header (M7g): opens the same dialog. */
export function EditMemberButton(
  props: Omit<Parameters<typeof EditMemberDialog>[0], "open" | "onOpenChange">,
) {
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline-primary"
        size="lg"
        onClick={() => setOpen(true)}
        data-testid="member-edit"
      >
        {tc("edit")}
      </Button>
      <EditMemberDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
