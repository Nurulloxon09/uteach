import { formatScore } from "@uteach/core";
import { ClipboardList } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  PageHeader,
  Section,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { getCenterContext } from "@/lib/center";
import { dayAsDate } from "@/lib/dates";
import { loadExamTypes } from "@/lib/exams";
import { createClient } from "@/lib/supabase/server";
import { ExamSwitch } from "./exam-ui";

export async function generateMetadata() {
  const t = await getTranslations("exams");
  return { title: t("title") };
}

const KIND_TONE: Record<string, ChipTone> = { diagnostic: "muted", mock: "primary" };

/**
 * Exams (owners/admins) and Scores (teachers) (16, M6 plan): recent score entries, one row per group, exam,
 * kind and day. `score_entries` runs as the caller, so each role sees only the groups RLS lets it read.
 */
export default async function ExamsPage({ searchParams }: PageProps<"/[locale]/exams">) {
  const { exam } = await searchParams;
  const ctx = await getCenterContext();
  const t = await getTranslations("exams");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();
  const types = await loadExamTypes(ctx);
  const examId = typeof exam === "string" && types.some((x) => x.id === exam) ? exam : "";
  const { data } = await supabase.rpc("score_entries", {
    p_center_id: ctx.center.id,
    ...(examId ? { p_exam_type_id: examId } : {}),
  });
  const ruleOf = new Map(types.map((x) => [x.id, x.totalRule]));
  const rows = (data ?? []).map((r) => ({
    key: `${r.group_id}|${r.exam_type_id}|${r.kind}|${r.taken_on}`,
    groupId: r.group_id,
    group: r.group_name,
    examTypeId: r.exam_type_id,
    exam: r.exam_name,
    kind: r.kind,
    date: r.taken_on,
    students: r.students,
    average:
      r.average_total === null
        ? "—"
        : formatScore(Number(r.average_total), ruleOf.get(r.exam_type_id) ?? "sum"),
  }));
  type Row = (typeof rows)[number];
  const isStaff = ctx.can.seeAdminPages;
  const title = isStaff ? t("title") : t("teacherTitle");

  const dateOf = (r: Row) =>
    format.dateTime(dayAsDate(r.date), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const groupOf = (r: Row) => (
    <Link
      href={`/groups/${r.groupId}?tab=scores&exam=${r.examTypeId}`}
      className="font-medium text-foreground hover:text-primary"
      aria-label={t("list.open", { group: r.group })}
    >
      {r.group}
    </Link>
  );
  const kindOf = (r: Row) => (
    <StatusChip tone={KIND_TONE[r.kind] ?? "muted"}>{t(`kind.${r.kind}`)}</StatusChip>
  );

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: isStaff ? "/home" : "/today" }, { label: title }]}
      />
      <Section
        title={t("list.title")}
        description={t("list.hint")}
        tools={
          <ExamSwitch
            types={types.map((x) => ({ id: x.id, name: x.name }))}
            value={examId}
            allLabel={t("list.allExams")}
          />
        }
      >
        <DataTable
          testId="score-entry-row"
          rows={rows}
          rowKey={(r) => r.key}
          empty={
            <EmptyState icon={ClipboardList} title={t("list.empty")} hint={t("list.emptyHint")} />
          }
          columns={[
            { key: "date", header: t("list.date"), cell: dateOf },
            { key: "group", header: t("list.group"), cell: groupOf },
            { key: "exam", header: t("list.exam"), cell: (r) => r.exam },
            { key: "kind", header: t("list.kindLabel"), cell: kindOf },
            { key: "students", header: t("list.students"), cell: (r) => r.students },
            { key: "average", header: t("list.average"), cell: (r) => r.average },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={groupOf(r)}
              subtitle={`${dateOf(r)} · ${r.exam}`}
              status={kindOf(r)}
              fields={[
                { label: t("list.students"), value: r.students },
                { label: t("list.average"), value: r.average },
              ]}
            />
          )}
        />
      </Section>
    </>
  );
}
