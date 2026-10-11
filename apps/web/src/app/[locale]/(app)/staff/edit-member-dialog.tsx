"use client";

import { useTranslations } from "next-intl";
import {
  CheckboxField,
  CheckboxGroup,
  Field,
  FormDialog,
  PaletteField,
} from "@/components/patterns";
import type { PaletteKey } from "@/lib/palette";
import { updateMemberAction } from "./actions";

export type EditableMember = {
  id: string;
  name: string;
  role: "owner" | "admin" | "teacher";
  branchIds: string[];
  permissions: string[];
  color: PaletteKey | null;
};

/**
 * Edit a staff member: name, branches, admin flags (owners only, 03) and timetable color.
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
