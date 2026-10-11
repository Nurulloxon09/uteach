import type { Locale } from "@uteach/i18n";
import type { Messages } from "./i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
