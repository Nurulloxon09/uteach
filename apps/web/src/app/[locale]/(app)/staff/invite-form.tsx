"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field, FieldError, FormMessage, NativeSelect, SubmitButton } from "@/components/form-bits";
import { InviteLink } from "./invite-link";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { inviteAction } from "./actions";

type Role = "admin" | "teacher";

export function InviteForm({
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
  const [state, action] = useActionState(inviteAction, null);
  const [role, setRole] = useState<Role>(roles[0] ?? "teacher");

  return (
    <div className="grid gap-4">
      {state?.ok && state.data?.inviteUrl ? <InviteLink url={state.data.inviteUrl} /> : null}
      <form action={action} className="grid gap-4 md:grid-cols-2" noValidate>
        <div className="md:col-span-2">
          <FormMessage state={state} />
        </div>
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
        <div className="grid gap-2">
          <Label htmlFor="field-role">{t("fields.role")}</Label>
          <NativeSelect
            id="field-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div />

        <fieldset className="grid gap-2 md:col-span-2">
          <legend className="mb-1 text-sm font-medium">{t("fields.branches")}</legend>
          <div className="flex flex-wrap gap-4">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <Checkbox name="branchIds" value={b.id} defaultChecked={branches.length === 1} />
                {b.name}
              </label>
            ))}
          </div>
          <FieldError name="branchIds" state={state} />
        </fieldset>

        {role === "admin" ? (
          <fieldset className="grid gap-2 md:col-span-2">
            <legend className="mb-1 text-sm font-medium">{t("fields.permissions")}</legend>
            <p className="text-sm text-muted-foreground">{t("fields.permissionsHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {flags.map((flag) => (
                <label key={flag} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    name="permissions"
                    value={flag}
                    defaultChecked={defaultFlags.includes(flag)}
                  />
                  <span>
                    <span className="font-medium">{tf(`${flag}.label` as never)}</span>
                    <span className="block text-muted-foreground">
                      {tf(`${flag}.hint` as never)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="md:col-span-2">
          <SubmitButton>{t("inviteSubmit")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
