import { IMPORT_FIELDS, type ImportKind } from "@uteach/core";
import en from "@uteach/i18n/messages/en.json";
import ru from "@uteach/i18n/messages/ru.json";
import uz from "@uteach/i18n/messages/uz.json";

/** Column headers of the import templates come from the catalogs, so the guesser knows all three languages. */
const CATALOGS = { en, uz, ru } as const;

type FieldLabels = Record<string, string>;

function fieldLabels(locale: keyof typeof CATALOGS, kind: ImportKind): FieldLabels {
  const fields = (CATALOGS[locale].import.fields as Record<string, FieldLabels>)[kind] ?? {};
  return fields;
}

/** Template header of each field in `locale`. */
export function templateHeaders(kind: ImportKind, locale: keyof typeof CATALOGS): string[] {
  const labels = fieldLabels(locale, kind);
  return IMPORT_FIELDS[kind].map((f) => labels[f] ?? f);
}

/** Every language's header for each field (used by `guessMapping`). */
export function allHeaderLabels(kind: ImportKind): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const locale of ["en", "uz", "ru"] as const) {
    for (const [field, label] of Object.entries(fieldLabels(locale, kind))) {
      (result[field] ??= []).push(label);
    }
  }
  return result;
}
