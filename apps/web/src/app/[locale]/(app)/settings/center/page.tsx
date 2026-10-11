import { getTranslations } from "next-intl/server";
import { PageHeader, Section } from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { CenterForm } from "./center-form";

export async function generateMetadata() {
  const t = await getTranslations("settings.center");
  return { title: t("title") };
}

export default async function CenterSettingsPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("settings.center");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: tn("settings") },
          { label: t("title") },
        ]}
      />
      <Section
        className="max-w-3xl"
        title={t("detailsTitle")}
        description={ctx.can.editCenter ? t("detailsHint") : t("readOnlyHint")}
      >
        <CenterForm center={ctx.center} editable={ctx.can.editCenter} />
      </Section>
    </>
  );
}
