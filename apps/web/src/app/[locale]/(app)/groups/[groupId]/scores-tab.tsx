import { examGradeLabel, formatScore } from "@uteach/core";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ClipboardList, Target } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { DataTable, EmptyState, MobileRecord, PageAction, StatusChip } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { ExamTypeOption } from "@/lib/exams";
import { dayAsDate } from "@/lib/dates";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExamSwitch, TargetDialog } from "../../exams/exam-ui";

type Row = {
  studentId: string;
  name: string;
  results: number;
  latestOn: string | null;
  latestKind: string | null;
  latest: number | null;
  previous: number | null;
  target: number | null;
  examDate: string | null;
  gap: number | null;
  baseline: number | null;
  uplift: number | null;
};

/**
 * The group's Scores tab (16): exam switcher, "Enter scores", and the gap table (latest, trend, target, gap,
 * exam date, uplift) from `group_scores`. Teachers of the group and admins read it; who may enter scores or
 * set targets is decided by the database.
 */
export async function ScoresTab({
  groupId,
  type,
  types,
  canEnter,
}: {
  groupId: string;
  type: ExamTypeOption;
  types: ExamTypeOption[];
  canEnter: boolean;
}) {
  const t = await getTranslations("exams");
  const tg = await getTranslations("exams.grade");
  const format = await getFormatter();
  const supabase = await createClient();
  const { data } = await supabase.rpc("group_scores", {
    p_group_id: groupId,
    p_exam_type_id: type.id,
  });
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  const rows: Row[] = (data ?? []).map((r) => ({
    studentId: r.student_id,
    name: r.full_name,
    results: r.results_count,
    latestOn: r.latest_on,
    latestKind: r.latest_kind,
    latest: num(r.latest_total),
    previous: num(r.previous_total),
    target: num(r.target_total),
    examDate: r.exam_date,
    gap: num(r.gap),
    baseline: num(r.baseline_total),
    uplift: num(r.uplift),
  }));

  const fmt = (v: number | null) => formatScore(v, type.totalRule);
  const day = (d: string) =>
    format.dateTime(dayAsDate(d), { day: "numeric", month: "short", timeZone: "UTC" });
  const gradeText = (v: number | null) => {
    const g = examGradeLabel(type.presetCode, v);
    if (!g) return v !== null && type.presetCode === "milliy" ? tg("noCertificate") : null;
    return type.presetCode === "cefr" ? tg(g as "b1") : g;
  };

  const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));
  const latestOf = (r: Row) =>
    r.latest === null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className="block">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground tabular-nums">{fmt(r.latest)}</span>
          {gradeText(r.latest) ? (
            <StatusChip tone="primary">{gradeText(r.latest)}</StatusChip>
          ) : null}
        </span>
        <span className="block text-sm whitespace-nowrap text-muted-foreground">
          {r.latestOn ? day(r.latestOn) : ""}
          {r.latestKind ? ` · ${t(`kind.${r.latestKind as "mock"}`)}` : ""}
        </span>
      </span>
    );
  const trendOf = (r: Row) => {
    if (r.latest === null || r.previous === null)
      return <span className="text-muted-foreground">—</span>;
    const Icon =
      r.latest > r.previous ? ArrowUpRight : r.latest < r.previous ? ArrowDownRight : ArrowRight;
    const tone =
      r.latest > r.previous
        ? "text-success"
        : r.latest < r.previous
          ? "text-destructive"
          : "text-muted-foreground";
    const label =
      r.latest > r.previous
        ? t("group.trendUp", { value: fmt(r.previous) })
        : r.latest < r.previous
          ? t("group.trendDown", { value: fmt(r.previous) })
          : t("group.trendSame");
    return (
      <span className={`inline-flex items-center gap-1 ${tone}`} title={label} aria-label={label}>
        <Icon className="size-4" />
        <span className="text-sm tabular-nums">{fmt(r.previous)}</span>
      </span>
    );
  };
  const gapOf = (r: Row) =>
    r.gap === null ? (
      <span className="text-muted-foreground">—</span>
    ) : r.gap <= 0 ? (
      <StatusChip tone="success">{t("group.reached")}</StatusChip>
    ) : (
      <StatusChip tone="warning">{signed(r.gap)}</StatusChip>
    );
  const upliftOf = (r: Row) =>
    r.uplift === null || r.results < 2 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className={r.uplift > 0 ? "text-success" : r.uplift < 0 ? "text-destructive" : ""}>
        {signed(r.uplift)}
      </span>
    );
  const targetAction = (r: Row) => (
    <TargetDialog
      studentId={r.studentId}
      type={{
        id: type.id,
        name: type.name,
        sections: type.sections,
        totalRule: type.totalRule,
        totalMin: type.totalMin,
        totalMax: type.totalMax,
      }}
      current={{ targetTotal: r.target, examDate: r.examDate, baselineTotal: null }}
      showBaseline={false}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("group.setTarget")}
          title={t("group.setTarget")}
          data-testid="set-target"
        >
          <Target />
        </Button>
      }
    />
  );

  const enterHref = `/groups/${groupId}/scores?exam=${type.id}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ExamSwitch
          types={types.map((x) => ({ id: x.id, name: x.name }))}
          value={type.id}
          extra={{ tab: "scores" }}
        />
        {canEnter ? (
          <PageAction icon={ClipboardList} asChild>
            <Link href={enterHref} data-testid="enter-scores">
              <ClipboardList className="size-[18px]" strokeWidth={2.4} />
              {t("enter.button")}
            </Link>
          </PageAction>
        ) : null}
      </div>
      {rows.every((r) => r.results === 0) ? (
        <EmptyState
          icon={ClipboardList}
          title={rows.length ? t("group.empty", { exam: type.name }) : t("group.noStudents")}
          hint={rows.length && canEnter ? t("group.emptyHint") : undefined}
        />
      ) : (
        <DataTable
          testId="group-score-row"
          rows={rows}
          rowKey={(r) => r.studentId}
          columns={[
            {
              key: "name",
              header: t("group.student"),
              cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
            },
            { key: "latest", header: t("group.latest"), cell: latestOf },
            { key: "trend", header: t("group.previous"), cell: trendOf },
            { key: "target", header: t("group.target"), cell: (r) => fmt(r.target) },
            { key: "gap", header: t("group.gap"), cell: gapOf },
            {
              key: "examDate",
              header: t("group.examDate"),
              cell: (r) => (r.examDate ? day(r.examDate) : "—"),
            },
            { key: "results", header: t("group.results"), cell: (r) => r.results },
            ...(canEnter
              ? [{ key: "actions", header: "", cell: targetAction, className: "w-14" }]
              : []),
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={r.name}
              status={gapOf(r)}
              fields={[
                { label: t("group.latest"), value: latestOf(r) },
                { label: t("group.previous"), value: trendOf(r) },
                { label: t("group.target"), value: fmt(r.target) },
                ...(r.examDate ? [{ label: t("group.examDate"), value: day(r.examDate) }] : []),
                { label: t("group.uplift"), value: upliftOf(r) },
              ]}
              actions={canEnter ? targetAction(r) : undefined}
            />
          )}
        />
      )}
    </div>
  );
}
