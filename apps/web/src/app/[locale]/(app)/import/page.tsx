import type { ImportKind } from "@uteach/core";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/patterns";
import { redirect } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { ImportWizard } from "./import-wizard";

export async function generateMetadata() {
  const t = await getTranslations("import");
  return { title: t("title") };
}

/** Excel import (10): students, groups, enrollments; opening balances (15) also need `billing` and `adjustments`. */
export default async function ImportPage({ searchParams }: PageProps<"/[locale]/import">) {
  const ctx = await requireAdminContext();
  if (!ctx.can.import) return redirect({ href: "/home", locale: await getLocale() });
  const t = await getTranslations("import");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const KINDS: ImportKind[] = [
    "students",
    "groups",
    "enrollments",
    ...(ctx.can.billing && ctx.can.adjustments ? (["opening_balances"] as const) : []),
  ];
  const raw = await searchParams;
  const wanted = Array.isArray(raw.kind) ? raw.kind[0] : raw.kind;
  const kind = KINDS.find((k) => k === wanted) ?? "students";
  const fromOnboarding = raw.from === "onboarding";

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          ...(fromOnboarding
            ? [{ label: t("setup"), href: "/onboarding/import" }]
            : [{ label: tn("students"), href: "/students" }]),
          { label: t("title") },
        ]}
      />
      <ImportWizard initialKind={kind} kinds={KINDS} />
    </>
  );
}
