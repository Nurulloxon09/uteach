"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { ActionState } from "@/lib/actions";
import { ComboboxField } from "./fields";

/** IANA time zones known to this runtime, e.g. "Asia/Tashkent". */
function timeZones(current: string): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

/** Time zone picker: a searchable `Combobox` (~400 zones). */
export function TimezoneField({
  name = "timezone",
  label,
  hint,
  state,
  defaultValue,
  disabled,
}: {
  name?: string;
  label: string;
  hint?: string;
  state: ActionState;
  defaultValue: string;
  disabled?: boolean;
}) {
  const t = useTranslations("timezone");
  const options = useMemo(
    () => timeZones(defaultValue).map((z) => ({ value: z, label: z.replaceAll("_", " ") })),
    [defaultValue],
  );
  return (
    <ComboboxField
      name={name}
      label={label}
      hint={hint}
      state={state}
      options={options}
      defaultValue={defaultValue}
      placeholder={t("placeholder")}
      searchPlaceholder={t("search")}
      emptyText={t("empty")}
      disabled={disabled}
    />
  );
}
