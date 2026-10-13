import { examGradeLabel, formatScore, scoreUplift } from "@uteach/core";
import { CalendarClock, FileText, Flag, GraduationCap, TrendingUp } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  Section,
  StatTiles,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { CenterContext } from "@/lib/center";
import { dayAsDate } from "@/lib/dates";
import { loadExamTypes, loadStudentScores, type ExamResultRow } from "@/lib/exams";
import { createClient } from "@/lib/supabase/server";
import {
  DeleteResultButton,
  ExamProgressChart,
  ExamSwitch,
  OfficialResultDialog,
  TargetDialog,
} from "../../exams/exam-ui";

const KIND_TONE: Record<string, ChipTone> = {
  diagnostic: "muted",
  mock: "primary",
  official: "success",
};

/**
 * The student's Scores tab (16): per exam type the chart (total over time, target line, exam day, sections),
 * target tiles (latest, target and gap, exam day, uplift) and every result. Staff with `academics` add
 * official results and set targets; the database decides.
 */
export async function ScoresPanel({
  ctx,
  student,
  examParam,
  today,
  groupNames,
}: {
  ctx: CenterContext;
  student: { id: string; branchId: string; archived: boolean };
  examParam: string | undefined;
  today: string;
  groupNames: Map<string, string>;
}) {
  const t = await getTranslations("exams");
  const tg = await getTranslations("exams.grade");
  const format = await getFormatter();
  const locale = ctx.locale;
  const [allTypes, { results, targets }] = await Promise.all([
    loadExamTypes(ctx),
    loadStudentScores(student.id),
  ]);
  const canEdit = ctx.can.academics && ctx.can.inBranch(student.branchId) && !student.archived;
  const liveTypes = allTypes.filter((x) => !x.archived);
  const typeInfo = (x: (typeof allTypes)[number]) => ({
    id: x.id,
    name: x.name,
    sections: x.sections,
    totalRule: x.totalRule,
    totalMin: x.totalMin,
    totalMax: x.totalMax,
  });
  const officialButton = canEdit ? (
    <OfficialResultDialog
      studentId={student.id}
      centerId={ctx.center.id}
      types={liveTypes.map(typeInfo)}
      today={today}
    />
  ) : null;

  // Types with something to show, the most recent result's first.
  const used = [
    ...new Set(
      [...results]
        .reverse()
        .map((r) => r.examTypeId)
        .concat(targets.map((x) => x.examTypeId)),
    ),
  ];
  const shown = allTypes.filter((x) => used.includes(x.id));
  if (shown.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title={t("student.empty")}
        hint={t("student.emptyHint")}
        action={officialButton}
      />
    );
  }
  const type = shown.find((x) => x.id === examParam) ?? allTypes.find((x) => x.id === used[0])!;
  const rows = results.filter((r) => r.examTypeId === type.id);
  const target = targets.find((x) => x.examTypeId === type.id);
  const fmt = (v: number | null) => formatScore(v, type.totalRule);
  const day = (d: string, long = false) =>
    format.dateTime(dayAsDate(d), {
      day: "numeric",
      month: long ? "long" : "short",
      year: long ? "numeric" : undefined,
      timeZone: "UTC",
    });
  const label = (s: (typeof type.sections)[number]) => s.label[locale] ?? s.label.en;
  const gradeOf = (v: number | null) => {
    const g = examGradeLabel(type.presetCode, v);
    if (!g) return v !== null && type.presetCode === "milliy" ? tg("noCertificate") : null;
    return type.presetCode === "cefr" ? tg(g as "b1") : g;
  };

  // Chart: totals (complete results only) and per-section lines.
  const withTotal = rows.filter((r) => r.total !== null);
  const pointLabel = (r: ExamResultRow, v: number) =>
    `${day(r.takenOn)} · ${t(`kind.${r.kind}`)} · ${fmt(v)}`;
  const points = withTotal.map((r) => ({
    date: r.takenOn,
    value: r.total!,
    official: r.kind === "official",
    label: pointLabel(r, r.total!),
  }));
  const sections =
    type.sections.length > 1
      ? type.sections.map((s) => ({
          key: s.key,
          label: label(s),
          points: rows
            .filter((r) => r.scores[s.key] !== undefined)
            .map((r) => ({
              date: r.takenOn,
              value: r.scores[s.key]!,
              label: pointLabel(r, r.scores[s.key]!),
            })),
        }))
      : [];

  const latest = withTotal.at(-1) ?? null;
  const baseline =
    target?.baselineTotal ??
    withTotal.find((r) => r.kind === "diagnostic")?.total ??
    withTotal[0]?.total ??
    null;
  const gap =
    target?.targetTotal !== null && target?.targetTotal !== undefined && latest
      ? target.targetTotal - latest.total!
      : null;
  const daysLeft = target?.examDate
    ? Math.round((Date.parse(target.examDate) - Date.parse(today)) / 86_400_000)
    : null;
  const uplift = scoreUplift(latest?.total ?? null, baseline);

  // Signed links for certificates (private bucket).
  const supabase = await createClient();
  const certificates = new Map<string, string>();
  await Promise.all(
    rows
      .filter((r) => r.certificatePath)
      .map(async (r) => {
        const { data } = await supabase.storage
          .from("attachments")
          .createSignedUrl(r.certificatePath!, 3600);
        if (data?.signedUrl) certificates.set(r.id, data.signedUrl);
      }),
  );

  const sectionsText = (r: ExamResultRow) =>
    type.sections
      .filter((s) => r.scores[s.key] !== undefined)
      .map(
        (s) =>
          `${label(s)} ${formatScore(r.scores[s.key]!, type.totalRule === "ielts_band" ? "ielts_band" : "sum")}`,
      )
      .join(" · ");
  const kindOf = (r: ExamResultRow) => (
    <StatusChip tone={KIND_TONE[r.kind] ?? "muted"}>{t(`kind.${r.kind}`)}</StatusChip>
  );
  const totalOf = (r: ExamResultRow) => (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-foreground tabular-nums">{fmt(r.total)}</span>
      {gradeOf(r.total) ? <StatusChip tone="primary">{gradeOf(r.total)}</StatusChip> : null}
    </span>
  );
  const actionsOf = (r: ExamResultRow) => (
    <span className="flex items-center gap-1">
      {certificates.has(r.id) ? (
        <Button variant="ghost" size="icon" asChild>
          <a
            href={certificates.get(r.id)}
            target="_blank"
            rel="noreferrer"
            aria-label={t("student.openCertificate")}
          >
            <FileText />
          </a>
        </Button>
      ) : null}
      {canEdit ? (
        <DeleteResultButton
          id={r.id}
          title={t("student.deleteTitle", { exam: type.name, date: day(r.takenOn, true) })}
        />
      ) : null}
    </span>
  );
  const ordered = [...rows].reverse();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ExamSwitch
          types={shown.map((x) => ({ id: x.id, name: x.name }))}
          value={type.id}
          extra={{ tab: "scores" }}
        />
        <div className="flex flex-wrap gap-3">
          {canEdit ? (
            <TargetDialog
              studentId={student.id}
              type={typeInfo(type)}
              current={target}
              trigger={
                <Button variant="outline" size="lg" data-testid="student-target">
                  <Flag />
                  {target ? t("student.editTarget") : t("student.setTarget")}
                </Button>
              }
            />
          ) : null}
          {officialButton}
        </div>
      </div>

      <StatTiles
        className="xl:grid-cols-2 2xl:grid-cols-4"
        items={[
          {
            key: "latest",
            label: t("student.latest"),
            value: latest
              ? `${fmt(latest.total)}${gradeOf(latest.total) ? ` · ${gradeOf(latest.total)}` : ""}`
              : "—",
            icon: GraduationCap,
            tone: "purple",
          },
          {
            key: "target",
            label: t("student.target"),
            value:
              target?.targetTotal !== null && target?.targetTotal !== undefined
                ? `${fmt(target.targetTotal)}${gap !== null ? (gap <= 0 ? " ✓" : ` (+${fmt(gap)})`) : ""}`
                : t("student.noTarget"),
            icon: Flag,
            tone: "green",
          },
          {
            key: "examDate",
            label: t("student.examDate"),
            value: target?.examDate
              ? `${day(target.examDate)} ${daysLeft !== null && daysLeft >= 0 ? t("student.daysLeft", { days: daysLeft }) : t("student.examPassed")}`
              : "—",
            icon: CalendarClock,
            tone: "orange",
          },
          {
            key: "uplift",
            label: t("student.uplift"),
            value: uplift === null ? "—" : `${uplift > 0 ? "+" : ""}${fmt(uplift)}`,
            icon: TrendingUp,
            tone: "blue",
          },
        ]}
      />

      {points.length > 0 ? (
        <Section title={t("student.chartTitle", { exam: type.name })} titleSize="card">
          <ExamProgressChart
            points={points}
            sections={sections}
            totalRule={type.totalRule}
            min={type.totalMin}
            max={type.totalMax}
            target={target?.targetTotal ?? null}
            examDate={target?.examDate ?? null}
            title={t("student.chartTitle", { exam: type.name })}
          />
        </Section>
      ) : null}

      <Section title={t("student.results")} titleSize="card" className="p-0 shadow-none sm:p-0">
        <DataTable
          testId="student-result-row"
          rows={ordered}
          rowKey={(r) => r.id}
          empty={<EmptyState title={t("student.empty")} />}
          columns={[
            { key: "date", header: t("student.date"), cell: (r) => day(r.takenOn) },
            { key: "kind", header: t("student.kindLabel"), cell: kindOf },
            {
              key: "group",
              header: t("student.group"),
              cell: (r) => (r.groupId ? (groupNames.get(r.groupId) ?? "—") : "—"),
            },
            { key: "sections", header: t("student.sections"), cell: sectionsText },
            { key: "total", header: t("student.total"), cell: totalOf },
            { key: "actions", header: "", cell: actionsOf, className: "w-24" },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={day(r.takenOn, true)}
              subtitle={r.groupId ? groupNames.get(r.groupId) : undefined}
              status={kindOf(r)}
              fields={[
                { label: t("student.sections"), value: sectionsText(r) },
                { label: t("student.total"), value: totalOf(r) },
              ]}
              actions={actionsOf(r)}
            />
          )}
        />
      </Section>
    </div>
  );
}
