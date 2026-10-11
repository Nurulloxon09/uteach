"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  CheckboxField,
  CheckboxGroup,
  Field,
  FormDialog,
  PageAction,
  SelectField,
} from "@/components/patterns";
import { inviteAction } from "./actions";
import { InviteLink } from "./invite-link";

type Role = "admin" | "teacher";

/** "+ Invite staff" page action and its FormDialog. On success the dialog shows the one-time link. */
export function InviteDialog({
  roles,
  branches,
  flags,
  defaultFlags,
}: {
  roles: Role[];
  branches: { id: string; name: string }[];
  flags: string[];
  defaultFlags: string[];
}) {
  const t = useTranslations("staff");
  const tr = useTranslations("roles");
  const tf = useTranslations("flags");
  const [role, setRole] = useState<Role>(roles[0] ?? "teacher");

  return (
    <FormDialog
      trigger={<PageAction>{t("inviteButton")}</PageAction>}
      onOpenChange={(open) => {
        if (open) setRole(roles[0] ?? "teacher");
      }}
      title={t("inviteTitle")}
      description={t("inviteDescription")}
      action={inviteAction}
      submitLabel={t("inviteSubmit")}
      testId="invite-dialog"
      success={(state) => (
        <InviteLink url={state.data?.inviteUrl ?? ""} title={t("linkReady")} hint={t("linkHint")} />
      )}
    >
      {(state) => (
        <>
          <Field name="displayName" label={t("fields.name")} state={state} required />
          <Field
            name="phone"
            type="tel"
            inputMode="tel"
            label={t("fields.phone")}
            hint={t("fields.phoneHint")}
            state={state}
            required
          />
          <SelectField
            name="role"
            label={t("fields.role")}
            state={state}
            value={role}
            onValueChange={(v) => setRole(v as Role)}
            options={roles.map((r) => ({ value: r, label: tr(r) }))}
          />
          <CheckboxGroup legend={t("fields.branches")} name="branchIds" state={state}>
            {branches.map((b) => (
              <CheckboxField
                key={b.id}
                name="branchIds"
                value={b.id}
                label={b.name}
                defaultChecked={branches.length === 1}
              />
            ))}
          </CheckboxGroup>
          {role === "admin" ? (
            <CheckboxGroup legend={t("fields.permissions")} name="permissions" state={state}>
              <p className="mb-2 text-sm text-muted-foreground">{t("fields.permissionsHint")}</p>
              {flags.map((flag) => (
                <CheckboxField
                  key={flag}
                  name="permissions"
                  value={flag}
                  label={tf(`${flag}.label` as never)}
                  hint={tf(`${flag}.hint` as never)}
                  defaultChecked={defaultFlags.includes(flag)}
                />
              ))}
            </CheckboxGroup>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
