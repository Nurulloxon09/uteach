import type { Locale } from "@uteach/i18n";
import en from "@uteach/i18n/messages/en.json";
import ru from "@uteach/i18n/messages/ru.json";
import uz from "@uteach/i18n/messages/uz.json";

export type Messages = typeof en;

export const messagesByLocale: Record<Locale, Messages> = { en, ru, uz };
