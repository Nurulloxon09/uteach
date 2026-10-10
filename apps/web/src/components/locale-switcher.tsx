"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { NativeSelect } from "@/components/form-bits";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("locale");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <NativeSelect
      aria-label={t("label")}
      className={className}
      value={locale}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value as (typeof routing.locales)[number];
        startTransition(() => {
          // usePathname() is locale-free, so the same page reopens in the new language.
          router.replace(pathname, { locale: next });
        });
      }}
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {t(l)}
        </option>
      ))}
    </NativeSelect>
  );
}
