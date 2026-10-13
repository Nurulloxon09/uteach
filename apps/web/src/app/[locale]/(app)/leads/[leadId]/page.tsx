import { addDays, todayIn, type LeadStatus } from "@uteach/core";
import {
  BellRing,
  BookOpen,
  Building2,
  CalendarClock,
  Phone,
  Send,
  Target,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DetailPage,
  InitialsAvatar,
  PageHeader,
  ProfileCard,
  Section,
  StatusChip,
} from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { loadBranches, loadCourses, loadGroupOptions, loadTeachers } from "@/lib/academics";
import { loadAccounts } from "@/lib/billing";
import { requireAdminContext } from "@/lib/center";
import {
  LEAD_COLUMNS,
  loadAssignees,
  loadLostReasons,
  loadTrialLessons,
  type LeadRow,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { DuplicateWarning } from "../lead-dialog";
import { SOURCE_ICONS, STATUS_TONES } from "../lead-meta";
import {
  LeadActions,
  LeadTimeline,
  MergeCandidates,
  OpenTrialCard,
  type MergeCandidate,
  type TimelineEntry,
} from "./lead-detail";

export async function generateMetadata() {
  const t = await getTranslations("leads");
  return { title: t("title") };
}

/** System timeline rows carry a code and an id (`trial_scheduled:{lesson}`, `converted:{student}`, …). */
function parseSystem(body: string | null): { code: string; ref: string | null } {
  const [code = "", ref = null] = (body ?? "").split(":");
  return { code, ref };
}

const LESSON_CODES = new Set([
  "trial_scheduled",
  "trial_attended",
  "trial_no_show",
  "trial_cancelled",
  "lesson_cancelled",
]);

/**
 * Lead detail (11): profile with status, source, assignee and next follow-up; actions (edit, move, lost,
 * archive); tabs Timeline (composer + history) and Details. Same-phone leads can be merged into.
 */
export default async function LeadPage({
  params,
  searchParams,
}: PageProps<"/[locale]/leads/[leadId]">) {
  const { leadId } = await params;
  const { do: doParam } = await searchParams;
  const ctx = await requireAdminContext();
  if (!ctx.can.leads) notFound();
  const t = await getTranslations("leads");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("id", leadId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!data) notFound();
  const lead = data as unknown as LeadRow;

  const [
    { data: activities },
    branches,
    courses,
    assignees,
    reasons,
    groups,
    duplicates,
    teachers,
    { data: trials },
  ] = await Promise.all([
    supabase
      .from("lead_activities")
      .select(
        "id, kind, body, call_outcome, from_status, to_status, due_at, done_at, created_by, created_at",
      )
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(300),
    loadBranches(ctx),
    loadCourses(ctx),
    loadAssignees(ctx),
    loadLostReasons(ctx),
    loadGroupOptions(ctx),
    lead.phone
      ? supabase
          .rpc("lead_duplicates", {
            p_center_id: ctx.center.id,
            p_phone: lead.phone,
            p_exclude_lead_id: lead.id,
          })
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    loadTeachers(ctx),
    supabase
      .from("lead_trials")
      .select("id, lesson_id, status, feedback, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
  ]);

  // Lessons named by trial rows in the timeline.
  const lessonIds = [
    ...new Set([
      ...(trials ?? []).map((tr) => tr.lesson_id),
      ...(activities ?? [])
        .filter((a) => a.kind === "system")
        .map((a) => parseSystem(a.body))
        .filter((sys) => LESSON_CODES.has(sys.code) && sys.ref)
        .map((sys) => sys.ref!),
    ]),
  ];
  const { data: lessons } = lessonIds.length
    ? await supabase.from("lessons").select("id, starts_at, group_id").in("id", lessonIds)
    : { data: [] as { id: string; starts_at: string; group_id: string }[] };
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const lessonLabel = new Map(
    (lessons ?? []).map((l) => [
      l.id,
      `${groupName.get(l.group_id) ?? "—"} · ${format.dateTime(new Date(l.starts_at), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ctx.center.timezone,
      })}`,
    ]),
  );

  const nowIso = new Date().toISOString();
  const openTrial = (trials ?? []).find((tr) => tr.status === "scheduled");
  const attended = (trials ?? []).find((tr) => tr.status === "attended");
  const lessonGroup = new Map((lessons ?? []).map((l) => [l.id, l.group_id]));
  const myGroups = groups.filter((g) => ctx.can.inBranch(g.branchId));
  const trialLessons = await loadTrialLessons(ctx, myGroups, teachers);
  const trialSetup = {
    lessons: trialLessons.map((l) => ({
      id: l.id,
      groupName: l.groupName,
      courseId: l.courseId,
      when: format.dateTime(new Date(l.startsAt), {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ctx.center.timezone,
      }),
      teacherName: l.teacherName,
      count: l.count,
      capacity: l.capacity,
    })),
    courses: courses
      .filter((c) => trialLessons.some((l) => l.courseId === c.id))
      .map((c) => ({ id: c.id, name: c.name })),
    defaultCourseId: lead.interested_course_id,
  };
  const accounts = ctx.can.payments ? await loadAccounts(ctx) : [];
  const today = todayIn(ctx.center.timezone);
  const convertSetup = ctx.can.students
    ? {
        students: duplicates
          .filter((d) => d.kind === "student" && d.student_id && !d.is_archived)
          .map((d) => ({ id: d.student_id!, name: d.full_name })),
        groups: myGroups.map((g) => ({
          id: g.id,
          label:
            g.capacity === null
              ? `${g.name} · ${t("trial.students", { count: g.count })}`
              : `${g.name} · ${t("trial.seats", { count: g.count, capacity: g.capacity })}`,
          courseId: g.courseId,
        })),
        defaultGroupId: attended ? (lessonGroup.get(attended.lesson_id) ?? null) : null,
        canDiscount: ctx.can.discounts,
        payment: ctx.can.payments
          ? {
              accounts,
              currency: ctx.center.currency,
              today,
              minDate: ctx.can.void ? null : addDays(today, -7),
            }
          : null,
      }
    : null;
  const authorOf = new Map(assignees.filter((a) => a.profileId).map((a) => [a.profileId!, a.name]));
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: ctx.center.timezone,
    });
  const statusLabel = (s: string | null) => (s ? t(`status.${s as LeadStatus}`) : "—");

  const entries: TimelineEntry[] = (activities ?? []).map((a) => {
    const base = {
      id: a.id,
      kind: a.kind,
      when: when(a.created_at),
      author: a.created_by ? (authorOf.get(a.created_by) ?? null) : null,
      link: null,
      task: null,
      body: a.body,
    } satisfies Omit<TimelineEntry, "title">;
    switch (a.kind) {
      case "note":
        return { ...base, title: t("timeline.kind.note") };
      case "call":
        return {
          ...base,
          title: t("timeline.callTitle", {
            outcome: t(`timeline.outcome.${(a.call_outcome ?? "reached") as "reached"}`),
          }),
        };
      case "status_change":
        return {
          ...base,
          body: null,
          title: t("timeline.moved", {
            from: statusLabel(a.from_status),
            to: statusLabel(a.to_status),
          }),
        };
      case "task":
        return {
          ...base,
          body: null,
          title: a.body ?? t("timeline.kind.task"),
          task: {
            due: when(a.due_at!),
            overdue: !a.done_at && a.due_at! < nowIso,
            done: a.done_at !== null,
          },
        };
      default: {
        const { code, ref } = parseSystem(a.body);
        const lesson = ref ? (lessonLabel.get(ref) ?? "—") : "—";
        const known: Record<string, string> = {
          created: t("timeline.created"),
          trial_scheduled: t("timeline.trialScheduled", { lesson }),
          trial_attended: t("timeline.trialAttended", { lesson }),
          trial_no_show: t("timeline.trialNoShow", { lesson }),
          trial_cancelled: t("timeline.trialCancelled", { lesson }),
          lesson_cancelled: t("timeline.lessonCancelled", { lesson }),
          merged: t("timeline.merged"),
          converted: t("timeline.converted"),
        };
        return {
          ...base,
          kind: "system" as const,
          body: null,
          title: known[code] ?? code,
          link:
            code === "merged" && ref
              ? { href: `/leads/${ref}`, label: t("timeline.openMerged") }
              : code === "converted" && ref
                ? { href: `/students/${ref}`, label: t("timeline.openStudent") }
                : null,
        };
      }
    }
  });

  const status = lead.status;
  const archived = lead.archived_at !== null;
  const canWrite = !archived && ctx.can.inBranch(lead.branch_id);
  const reasonOptions = reasons
    .filter((r) => !r.archived)
    .map((r) => ({ id: r.id, label: r.label ?? t(`lostReason.${r.systemKey ?? "other"}`) }));
  const lostReason = reasons.find((r) => r.id === lead.lost_reason_id);
  const assigneeName = new Map(assignees.map((a) => [a.id, a.name]));
  const branchName = branches.find((b) => b.id === lead.branch_id)?.name ?? "—";
  const courseName = courses.find((c) => c.id === lead.interested_course_id)?.name ?? null;
  const SourceIcon = SOURCE_ICONS[lead.source];
  const overdue = lead.next_follow_up_at !== null && lead.next_follow_up_at < nowIso;

  // The student this lead became isn't a duplicate of it.
  const dupes = duplicates
    .filter((d) => !(d.kind !== "lead" && d.student_id === lead.converted_student_id))
    .map((d) => ({
      kind: d.kind as "lead" | "student" | "guardian",
      leadId: d.lead_id,
      studentId: d.student_id,
      name: d.full_name,
      status: d.lead_status,
      archived: d.is_archived,
    }));
  const mergeCandidates: MergeCandidate[] = dupes
    .filter((d) => d.kind === "lead" && d.leadId && !d.archived && d.status !== "won")
    .map((d) => ({ id: d.leadId!, name: d.name, status: d.status! }));

  const details: { label: string; value: string | null }[] = [
    { label: t("fields.goal"), value: lead.goal },
    { label: t("fields.targetScore"), value: lead.target_score?.toString() ?? null },
    { label: t("fields.currentLevel"), value: lead.current_level },
    { label: t("fields.course"), value: courseName },
    { label: t("fields.preferredSchedule"), value: lead.preferred_schedule },
    { label: t("fields.source"), value: t(`source.${lead.source}`) },
    { label: t("fields.sourceDetail"), value: lead.source_detail },
    {
      label: t("fields.telegram"),
      value: lead.telegram_username ? `@${lead.telegram_username}` : null,
    },
    { label: t("fields.branch"), value: branchName },
    {
      label: t("fields.created"),
      value: when(lead.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        title={lead.full_name}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: t("title"), href: "/leads" },
          { label: lead.full_name },
        ]}
        action={
          ctx.can.inBranch(lead.branch_id) ? (
            <LeadActions
              lead={{
                id: lead.id,
                branchId: lead.branch_id,
                fullName: lead.full_name,
                phone: lead.phone,
                telegramUsername: lead.telegram_username,
                source: lead.source,
                sourceDetail: lead.source_detail,
                goal: lead.goal,
                targetScore: lead.target_score,
                currentLevel: lead.current_level,
                courseId: lead.interested_course_id,
                preferredSchedule: lead.preferred_schedule,
                assigneeId: lead.assigned_membership_id,
              }}
              status={status}
              archived={archived}
              options={{
                branches: branches.filter((b) => ctx.can.inBranch(b.id)),
                courses,
                assignees,
              }}
              reasons={reasonOptions}
              trial={trialSetup}
              convert={convertSetup}
              autoOpen={doParam === "trial" || doParam === "convert" ? doParam : null}
            />
          ) : undefined
        }
      />
      <DetailPage
        header={
          <div className="space-y-5">
            <ProfileCard
              avatar={<InitialsAvatar name={lead.full_name} size="lg" />}
              name={lead.full_name}
              subtitle={t(`source.${lead.source}`)}
              rows={[
                ...(lead.phone ? [{ key: "phone", icon: Phone, value: lead.phone }] : []),
                ...(lead.telegram_username
                  ? [{ key: "tg", icon: Send, value: `@${lead.telegram_username}` }]
                  : []),
                { key: "source", icon: SourceIcon, value: t(`source.${lead.source}`) },
                ...(lead.goal ? [{ key: "goal", icon: Target, value: lead.goal }] : []),
                ...(courseName ? [{ key: "course", icon: BookOpen, value: courseName }] : []),
                { key: "branch", icon: Building2, value: branchName },
                {
                  key: "assignee",
                  icon: UserRound,
                  value: lead.assigned_membership_id
                    ? (assigneeName.get(lead.assigned_membership_id) ?? "—")
                    : t("fields.nobody"),
                },
                {
                  key: "followUp",
                  icon: lead.next_follow_up_at ? BellRing : CalendarClock,
                  value: lead.next_follow_up_at ? (
                    <span className={overdue ? "font-semibold text-destructive" : undefined}>
                      {t("nextFollowUpAt", { when: when(lead.next_follow_up_at) })}
                    </span>
                  ) : (
                    t("noFollowUp")
                  ),
                },
              ]}
              chip={
                <div className="flex flex-wrap gap-2" data-testid="lead-status">
                  {archived ? <StatusChip tone="muted">{tc("archived")}</StatusChip> : null}
                  <StatusChip tone={STATUS_TONES[status]}>{t(`status.${status}`)}</StatusChip>
                  {status === "lost" && lostReason ? (
                    <StatusChip tone="muted">
                      {lostReason.label ?? t(`lostReason.${lostReason.systemKey ?? "other"}`)}
                    </StatusChip>
                  ) : null}
                </div>
              }
            />
            {openTrial ? (
              <Section title={t("trial.openTitle")} titleSize="card">
                {canWrite ? (
                  <OpenTrialCard
                    leadId={lead.id}
                    trial={{
                      id: openTrial.id,
                      lesson: lessonLabel.get(openTrial.lesson_id) ?? "—",
                      feedback: openTrial.feedback,
                    }}
                  />
                ) : (
                  <p className="text-[15px] text-foreground">
                    {lessonLabel.get(openTrial.lesson_id) ?? "—"}
                  </p>
                )}
              </Section>
            ) : null}
            {(trials ?? []).some((tr) => tr.feedback && tr.status !== "scheduled") ? (
              <Section title={t("trial.feedbackTitle")} titleSize="card">
                <ul className="space-y-2" data-testid="trial-feedback-list">
                  {(trials ?? [])
                    .filter((tr) => tr.feedback && tr.status !== "scheduled")
                    .map((tr) => (
                      <li key={tr.id} className="space-y-0.5">
                        <p className="text-sm text-muted-foreground">
                          {lessonLabel.get(tr.lesson_id) ?? "—"} · {t(`trial.status.${tr.status}`)}
                        </p>
                        <p className="text-[15px] text-foreground">{tr.feedback}</p>
                      </li>
                    ))}
                </ul>
              </Section>
            ) : null}
            {status === "lost" && lead.lost_note ? (
              <Section title={t("lost.noteTitle")} titleSize="card">
                <p className="text-[15px] whitespace-pre-line text-secondary-foreground">
                  {lead.lost_note}
                </p>
              </Section>
            ) : null}
            {lead.converted_student_id ? (
              <Section title={t("convertedTitle")} titleSize="card">
                <Link
                  href={`/students/${lead.converted_student_id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {t("timeline.openStudent")}
                </Link>
              </Section>
            ) : null}
            {dupes.length > 0 ? (
              <Section
                title={
                  <span className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-warning" aria-hidden />
                    {t("duplicates.title")}
                  </span>
                }
                titleSize="card"
              >
                {canWrite && mergeCandidates.length > 0 ? (
                  <MergeCandidates
                    leadId={lead.id}
                    leadName={lead.full_name}
                    candidates={mergeCandidates}
                  />
                ) : null}
                <div className={canWrite && mergeCandidates.length > 0 ? "mt-3" : undefined}>
                  <DuplicateWarning
                    duplicates={dupes.filter(
                      (d) => !(canWrite && mergeCandidates.some((c) => c.id === d.leadId)),
                    )}
                  />
                </div>
              </Section>
            ) : null}
          </div>
        }
        tabs={[
          {
            value: "timeline",
            label: t("tabs.timeline"),
            content: (
              <LeadTimeline
                leadId={lead.id}
                entries={entries}
                canWrite={canWrite}
                assignees={assignees}
                myMembershipId={ctx.membership.id}
                today={today}
              />
            ),
          },
          {
            value: "details",
            label: t("tabs.details"),
            content: (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2" data-testid="lead-details">
                {details.map((d) => (
                  <div key={d.label} className="space-y-1">
                    <dt className="text-sm text-muted-foreground">{d.label}</dt>
                    <dd className="text-[15px] text-foreground">{d.value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            ),
          },
        ]}
      />
    </>
  );
}
