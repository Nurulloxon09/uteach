import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarCheck2,
  DoorOpen,
  GraduationCap,
  Send,
  Sparkles,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ActivityList,
  EmptyState,
  Section,
  StatusChip,
  type ActivityItem,
} from "@/components/patterns";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseListParams } from "@/components/patterns/list-params";
import { loadBranches } from "@/lib/academics";
import { requireAdminContext } from "@/lib/center";
import { loadAdminDashboard, loadOwnerDashboard } from "@/lib/dashboards";
import { LATER_STEPS, nextStep, readProgress } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboard } from "./admin-dashboard";
import { OwnerDashboard } from "./owner-dashboard";

export async function generateMetadata() {
  const t = await getTranslations("home");
  return { title: t("title") };
}

/**
 * Owner/admin landing page: the role dashboard (20 · M7c), my follow-ups, and the setup steps until they are done.
 */
export default async function HomePage({ searchParams }: PageProps<"/[locale]/home">) {
  const ctx = await requireAdminContext();
  const isOwner = ctx.membership.role === "owner";
  const branchParam = parseListParams(await searchParams, ["branch"] as const).filters.branch;
  const branchList = isOwner ? await loadBranches(ctx) : [];
  const branch = branchList.some((b) => b.id === branchParam) ? (branchParam ?? null) : null;
  const [ownerData, adminData] = await Promise.all([
    isOwner ? loadOwnerDashboard(ctx, branch) : null,
    isOwner ? null : loadAdminDashboard(ctx),
  ]);
  const t = await getTranslations("home");
  const format = await getFormatter();
  const supabase = await createClient();

  const [branches, rooms, staff, students, groups, center, telegram] = await Promise.all([
    supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .is("archived_at", null),
    supabase
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .is("archived_at", null),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .eq("status", "active"),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .is("archived_at", null),
    supabase
      .from("groups")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .is("archived_at", null),
    supabase.from("centers").select("settings").eq("id", ctx.center.id).single(),
    supabase
      .from("telegram_links")
      .select("id", { count: "exact", head: true })
      .eq("center_id", ctx.center.id)
      .is("unlinked_at", null)
      .is("membership_id", null),
  ]);
  // "My follow-ups" (11): my open lead tasks due today or overdue.
  const { data: followUps } = ctx.can.leads
    ? await supabase.rpc("my_follow_ups", { p_center_id: ctx.center.id })
    : { data: null };
  const followUpItems: ActivityItem[] = (followUps ?? []).map((f) => ({
    key: f.activity_id,
    icon: BellRing,
    tone: f.is_overdue ? "orange" : "blue",
    title: f.lead_name,
    description: f.body ?? undefined,
    meta: (
      <StatusChip tone={f.is_overdue ? "destructive" : "muted"}>
        {format.dateTime(new Date(f.due_at), {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: ctx.center.timezone,
        })}
      </StatusChip>
    ),
    href: `/leads/${f.lead_id}`,
  }));
  const counts = {
    branches: branches.count ?? 0,
    rooms: rooms.count ?? 0,
    staff: staff.count ?? 0,
    students: students.count ?? 0,
    groups: groups.count ?? 0,
    telegram: telegram.count ?? 0,
  };
  // The owner is never forced back into the wizard; Home offers to continue it (10).
  const progress = readProgress(center.data?.settings);
  const resume = ctx.membership.role === "owner" ? nextStep(progress) : null;
  const doneSteps = LATER_STEPS.filter((s) => progress[s]).length;

  const stepMeta = (done: boolean) => (
    <StatusChip tone={done ? "success" : "muted"}>{done ? t("done") : t("todo")}</StatusChip>
  );
  const steps: ActivityItem[] = [
    {
      key: "branches",
      icon: Building2,
      tone: "blue",
      title: t("addBranch"),
      description: t("addBranchHint"),
      meta: stepMeta(counts.branches > 0),
      href: "/settings/branches",
    },
    {
      key: "rooms",
      icon: DoorOpen,
      tone: "orange",
      title: t("addRooms"),
      description: t("addRoomsHint"),
      meta: stepMeta(counts.rooms > 0),
      href: "/settings/branches",
    },
    {
      key: "group",
      icon: UsersRound,
      tone: "purple",
      title: t("addGroup"),
      description: t("addGroupHint"),
      meta: stepMeta(counts.groups > 0),
      href: "/groups",
    },
    {
      key: "students",
      icon: GraduationCap,
      tone: "green",
      title: t("addStudents"),
      description: t("addStudentsHint"),
      meta: stepMeta(counts.students > 0),
      href: "/students",
    },
    {
      key: "telegram",
      icon: Send,
      tone: "blue",
      title: t("connectTelegram"),
      description: t("connectTelegramHint"),
      meta: stepMeta(counts.telegram > 0),
      href: "/settings/telegram",
    },
    ...(ctx.can.manageStaff
      ? [
          {
            key: "staff",
            icon: UserPlus,
            tone: "green",
            title: t("inviteStaff"),
            description: t("inviteStaffHint"),
            meta: stepMeta(counts.staff > 1),
            href: "/staff",
          } satisfies ActivityItem,
        ]
      : []),
  ];

  // Setup steps disappear once every one of them is done.
  const setupDone =
    counts.branches > 0 &&
    counts.rooms > 0 &&
    counts.groups > 0 &&
    counts.students > 0 &&
    counts.telegram > 0 &&
    (!ctx.can.manageStaff || counts.staff > 1);

  return (
    <>
      {resume ? (
        <Section className="bg-primary-soft/60 shadow-none">
          <div className="flex flex-wrap items-center gap-4" data-testid="continue-setup">
            <span className="grid size-11 place-items-center rounded-xl bg-card text-primary">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold text-foreground">{t("continueSetup")}</p>
              <p className="text-[15px] text-secondary-foreground">
                {t("continueSetupHint", { done: doneSteps + 2, total: LATER_STEPS.length + 2 })}
              </p>
            </div>
            <Link href={`/onboarding/${resume}`} className={buttonVariants()}>
              {t("continueSetupButton")}
              <ArrowRight />
            </Link>
          </div>
        </Section>
      ) : null}
      <Section
        title={t("greeting", { name: ctx.user.fullName })}
        titleSize="dashboard"
        description={
          ctx.center.status === "trial" && ctx.center.trialEndsAt
            ? t("trialEnds", {
                date: format.dateTime(new Date(ctx.center.trialEndsAt), {
                  dateStyle: "long",
                  timeZone: ctx.center.timezone,
                }),
              })
            : undefined
        }
      ></Section>
      {ownerData ? (
        <OwnerDashboard
          ctx={ctx}
          data={ownerData}
          branches={branchList.map((b) => ({ id: b.id, name: b.name }))}
        />
      ) : null}
      {adminData ? <AdminDashboard ctx={ctx} data={adminData} /> : null}

      {ctx.can.leads ? (
        <Section
          title={t("followUps")}
          titleSize="card"
          description={t("followUpsHint")}
          id="follow-ups"
        >
          {followUpItems.length > 0 ? (
            <div data-testid="follow-ups">
              <ActivityList items={followUpItems} />
            </div>
          ) : (
            <EmptyState icon={CalendarCheck2} title={t("followUpsEmpty")} />
          )}
        </Section>
      ) : null}

      {setupDone ? null : (
        <Section title={t("nextSteps")} titleSize="card" description={t("nextStepsHint")}>
          <ActivityList items={steps} />
        </Section>
      )}
    </>
  );
}
