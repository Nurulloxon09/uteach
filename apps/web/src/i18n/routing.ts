import { defaultLocale, locales } from "@uteach/i18n";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeCookie: { name: "uteach_locale" },
});
