"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";
import { NativeSelect } from "@/components/form-bits";

export function CenterSwitcher({
  current,
  centers,
  action,
}: {
  current: string;
  centers: { id: string; name: string }[];
  action: (form: FormData) => Promise<void>;
}) {
  const t = useTranslations("nav");
  const formRef = useRef<HTMLFormElement>(null);
  const currentName = centers.find((c) => c.id === current)?.name;

  if (centers.length < 2) {
    return <span className="font-heading text-lg font-semibold">{currentName}</span>;
  }

  return (
    <form ref={formRef} action={action}>
      <NativeSelect
        name="centerId"
        aria-label={t("switchCenter")}
        defaultValue={current}
        className="w-auto font-medium"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {centers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
    </form>
  );
}
