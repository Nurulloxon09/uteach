import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/patterns";
import { routing } from "@/i18n/routing";

/** When the legal text last changed (shown on the page). */
const UPDATED = "2026-10-14";

/** True until a lawyer has read the text (M7e: the owner removes it after the review). */
const DRAFT = true;

/** A known locale for metadata (an unknown one 404s in the layout). */
export function pageLocale(locale: string) {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/** The canonical URL and the uz / ru / en alternates of a public page. */
export function publicAlternates(locale: string, path: string): Metadata["alternates"] {
  return {
    canonical: `/${locale}${path}`,
    languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}${path}`])),
  };
}

/** Terms or privacy: the title, the draft notice and the date, then one paragraph per section. */
export async function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: { id: string; title: string; body: string }[];
}) {
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const updated = format.dateTime(new Date(`${UPDATED}T00:00:00Z`), {
    dateStyle: "long",
    timeZone: "UTC",
  });
  return (
    <LegalDocument
      title={title}
      notice={DRAFT ? { title: t("draftTitle"), body: t("draftBody") } : undefined}
      updated={t("updated", { date: updated })}
      sections={sections}
    />
  );
}
