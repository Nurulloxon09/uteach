import { todayIn } from "@uteach/core";
import { Building2, Cake, Phone, School } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DetailPage,
  InitialsAvatar,
  PageHeader,
  ProfileCard,
  StatusChip,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { loadBranches, loadGroupOptions } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { dayAsDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { EditStudentDialog } from "../student-dialog";
import { AttendanceSummary } from "./attendance-summary";
import {
  EnrollmentsPanel,
  GuardiansPanel,
  NotesPanel,
  type EnrollmentRow,
  type GuardianRow,
} from "./panels";

export async function generateMetadata() {
  const t = await getTranslations("students");
  return { title: t("title") };
}

/** Student profile (12): contacts and home branch; tabs Enrollments | Attendance | Guardians | Notes. */
export default async function StudentPage({ params }: PageProps<"/[locale]/students/[studentId]">) {
  const { studentId } = await params;
  const ctx = await requireAdminContext();
  const t = await getTranslations("students");
  const ta = await getTranslations("attendance");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, branch_id, full_name, phone, birth_date, gender, school, archived_at")
    .eq("id", studentId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!student) notFound();

  const [
    { data: links },
    { data: enrollments },
    { data: notes },
    { data: levels },
    groups,
    branches,
  ] = await Promise.all([
    supabase
      .from("student_guardians")
      .select(
        "guardian_id, relation, is_primary, receives_notifications, receives_billing, guardians ( full_name, phone )",
      )
      .eq("student_id", studentId),
    supabase
      .from("enrollments")
      .select(
        "id, group_id, status, start_date, end_date, end_reason, discount_bp, groups ( name, level_id )",
      )
      .eq("student_id", studentId)
      .order("start_date", { ascending: false }),
    supabase
      .from("student_notes")
      .select("id, body, is_pinned, visible_to_teachers, created_at, created_by")
      .eq("student_id", studentId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("levels").select("id, next_level_id").eq("center_id", ctx.center.id),
    loadGroupOptions(ctx),
    loadBranches(ctx),
  ]);

  const guardianIds = (links ?? []).map((l) => l.guardian_id);
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  const [{ data: others }, { data: freezes }] = await Promise.all([
    guardianIds.length
      ? supabase
          .from("student_guardians")
          .select("guardian_id, student_id, students ( full_name )")
          .in("guardian_id", guardianIds)
          .neq("student_id", studentId)
      : Promise.resolve({
          data: [] as {
            guardian_id: string;
            student_id: string;
            students: { full_name: string } | null;
          }[],
        }),
    enrollmentIds.length
      ? supabase
          .from("enrollment_freezes")
          .select("enrollment_id, from_date, to_date")
          .in("enrollment_id", enrollmentIds)
          .order("from_date")
      : Promise.resolve({
          data: [] as { enrollment_id: string; from_date: string; to_date: string }[],
        }),
  ]);

  const today = todayIn(ctx.center.timezone);
  const nextLevel = new Map((levels ?? []).map((l) => [l.id, l.next_level_id]));
  const editable =
    ctx.can.students && ctx.can.inBranch(student.branch_id) && student.archived_at === null;

  const guardianRows: GuardianRow[] = (links ?? []).map((l) => ({
    id: l.guardian_id,
    fullName: l.guardians?.full_name ?? "—",
    phone: l.guardians?.phone ?? "",
    relation: l.relation,
    isPrimary: l.is_primary,
    receivesNotifications: l.receives_notifications,
    receivesBilling: l.receives_billing,
    others: (others ?? [])
      .filter((o) => o.guardian_id === l.guardian_id && o.students)
      .map((o) => ({ id: o.student_id, name: o.students?.full_name ?? "" })),
  }));

  const enrollmentRows: EnrollmentRow[] = (enrollments ?? []).map((e) => ({
    id: e.id,
    studentId: student.id,
    studentName: student.full_name,
    groupId: e.group_id,
    groupName: e.groups?.name ?? "—",
    nextLevelId: e.groups?.level_id ? (nextLevel.get(e.groups.level_id) ?? null) : null,
    today,
    status: e.status,
    startDate: e.start_date,
    endDate: e.end_date,
    endReason: e.end_reason,
    discountBp: e.discount_bp,
    freezes: (freezes ?? [])
      .filter((f) => f.enrollment_id === e.id)
      .map((f) => ({ from: f.from_date, to: f.to_date })),
  }));

  const active = enrollmentRows.some((e) => e.status !== "ended");
  const branchName = branches.find((b) => b.id === student.branch_id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title={student.full_name}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: t("title"), href: "/students" },
          { label: student.full_name },
        ]}
        action={
          editable ? (
            <EditStudentDialog
              branches={branches.map((b) => ({ id: b.id, name: b.name }))}
              student={{
                id: student.id,
                branchId: student.branch_id,
                fullName: student.full_name,
                phone: student.phone,
                birthDate: student.birth_date,
                gender: student.gender as "male" | "female" | null,
                school: student.school,
              }}
              trigger={
                <Button variant="outline-primary" size="lg">
                  {tc("edit")}
                </Button>
              }
            />
          ) : undefined
        }
      />
      <DetailPage
        header={
          <ProfileCard
            avatar={<InitialsAvatar name={student.full_name} size="lg" />}
            name={student.full_name}
            subtitle={student.gender ? t(`gender.${student.gender as "male"}`) : undefined}
            rows={[
              { key: "phone", icon: Phone, value: student.phone ?? t("noPhone") },
              { key: "branch", icon: Building2, value: branchName },
              ...(student.birth_date
                ? [
                    {
                      key: "birth",
                      icon: Cake,
                      value: format.dateTime(dayAsDate(student.birth_date), {
                        dateStyle: "long",
                        timeZone: "UTC",
                      }),
                    },
                  ]
                : []),
              ...(student.school ? [{ key: "school", icon: School, value: student.school }] : []),
            ]}
            chip={
              student.archived_at ? (
                <StatusChip tone="muted">{tc("archived")}</StatusChip>
              ) : active ? (
                <StatusChip tone="success">{t("status.active")}</StatusChip>
              ) : (
                <StatusChip tone="muted">{t("status.inactive")}</StatusChip>
              )
            }
          />
        }
        tabs={[
          {
            value: "enrollments",
            label: t("tabEnrollments"),
            content: (
              <EnrollmentsPanel
                student={{ id: student.id, name: student.full_name }}
                rows={enrollmentRows}
                groups={groups
                  .filter((g) => ctx.can.inBranch(g.branchId))
                  .map((g) => ({
                    id: g.id,
                    name: g.name,
                    capacity: g.capacity,
                    count: g.count,
                    levelId: g.levelId,
                  }))}
                editable={editable}
                canDiscount={ctx.can.discounts}
                canOverridePrice={ctx.can.discounts && ctx.can.billing}
              />
            ),
          },
          {
            value: "attendance",
            label: ta("summary.tab"),
            content: (
              <AttendanceSummary
                studentId={student.id}
                today={today}
                groupNames={
                  new Map((enrollments ?? []).map((e) => [e.group_id, e.groups?.name ?? "—"]))
                }
              />
            ),
          },
          {
            value: "guardians",
            label: t("tabGuardians"),
            content: (
              <GuardiansPanel studentId={student.id} guardians={guardianRows} editable={editable} />
            ),
          },
          {
            value: "notes",
            label: t("tabNotes"),
            content: (
              <NotesPanel
                studentId={student.id}
                canAdd={student.archived_at === null}
                notes={(notes ?? []).map((n) => ({
                  id: n.id,
                  body: n.body,
                  isPinned: n.is_pinned,
                  visibleToTeachers: n.visible_to_teachers,
                  createdAt: n.created_at,
                  mine: n.created_by === ctx.user.id,
                }))}
              />
            ),
          },
        ]}
      />
    </>
  );
}
