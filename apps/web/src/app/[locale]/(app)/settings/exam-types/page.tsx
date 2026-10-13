import { formatScore } from "@uteach/core";
import { NotebookPen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  PageHeader,
  Section,
  StatusChip,
} from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { loadExamTypes } from "@/lib/exams";
import { createClient } from "@/lib/supabase/server";
import { AddExamTypeDialog, ExamTypeRowActions } from "./exam-type-ui";

export async function generateMetadata() {
  const t = await getTranslations("exams.types");
  return { title: t("title") };
}

/**
 * Exam types (16): the four standard presets (read-only) and the center's own types. Owners and admins with
 * `academics` add, edit and archive their own; sections freeze once scores use a type.
 */
export default async function ExamTypesPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("exams.types");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const types = await loadExamTypes(ctx);
  const own = types.filter((x) => !x.presetCode).map((x) => x.id);
  const supabase = await createClient();
  const { data: used } = own.length
    ? await supabase.from("exam_results").select("exam_type_id").in("exam_type_id", own).limit(1000)
    : { data: [] };
  const inUse = new Set((used ?? []).map((r) => r.exam_type_id));

  const rows = types.map((x) => ({
    ...x,
    sectionsText: x.sections.map((s) => s.label[ctx.locale] ?? s.label.en).join(", "),
    range: `${formatScore(x.totalMin, x.totalRule)}–${formatScore(x.totalMax, x.totalRule)}`,
  }));
  type Row = (typeof rows)[number];

  const kindOf = (r: Row) =>
    r.archived ? (
      <StatusChip tone="muted">{tc("archived")}</StatusChip>
    ) : r.presetCode ? (
      <StatusChip tone="primary">{t("preset")}</StatusChip>
    ) : (
      <StatusChip tone="success">{t("custom")}</StatusChip>
    );
  const actionsOf = (r: Row) =>
    !r.presetCode && ctx.can.academics ? (
      <ExamTypeRowActions
        archived={r.archived}
        type={{
          id: r.id,
          name: r.name,
          totalRule: r.totalRule,
          inUse: inUse.has(r.id),
          sections: r.sections.map((s) => ({
            name: s.label[ctx.locale] ?? s.label.en,
            min: s.min,
            max: s.max,
            step: s.step,
          })),
        }}
      />
    ) : null;

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
        action={ctx.can.academics ? <AddExamTypeDialog /> : undefined}
      />
      <Section title={t("listTitle")} description={t("listHint")}>
        <DataTable
          testId="exam-type-row"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={NotebookPen} title={t("emptyTitle")} />}
          columns={[
            { key: "name", header: t("name"), cell: (r) => r.name },
            { key: "kind", header: tc("status"), cell: kindOf },
            { key: "sections", header: t("sections"), cell: (r) => r.sectionsText },
            { key: "rule", header: t("rule"), cell: (r) => t(`rules.${r.totalRule}`) },
            { key: "range", header: t("range"), cell: (r) => r.range },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-28" },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={r.name}
              subtitle={r.sectionsText}
              status={kindOf(r)}
              fields={[
                { label: t("rule"), value: t(`rules.${r.totalRule}`) },
                { label: t("range"), value: r.range },
              ]}
              actions={actionsOf(r) ?? undefined}
            />
          )}
        />
      </Section>
    </>
  );
}
