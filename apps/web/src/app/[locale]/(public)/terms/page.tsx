import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage, pageLocale, publicAlternates } from "../legal";

const SECTIONS = [
  "about",
  "trial",
  "paying",
  "late",
  "duties",
  "use",
  "availability",
  "ending",
  "liability",
  "law",
  "contact",
] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return { title: t("title"), alternates: publicAlternates(locale, "/terms") };
}

/** Terms of service (M7e); a draft until a lawyer reads it. */
export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  return (
    <LegalPage
      title={t("title")}
      sections={SECTIONS.map((id) => ({ id, title: t(`${id}.title`), body: t(`${id}.body`) }))}
    />
  );
}
