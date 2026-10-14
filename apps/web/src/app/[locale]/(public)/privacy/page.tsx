import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage, pageLocale, publicAlternates } from "../legal";

const SECTIONS = [
  "roles",
  "data",
  "purposes",
  "processors",
  "location",
  "retention",
  "rights",
  "security",
  "children",
  "changes",
] as const;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("title"), alternates: publicAlternates(locale, "/privacy") };
}

/** Privacy policy (M7e); a draft until a lawyer reads it. */
export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  return (
    <LegalPage
      title={t("title")}
      sections={SECTIONS.map((id) => ({ id, title: t(`${id}.title`), body: t(`${id}.body`) }))}
    />
  );
}
