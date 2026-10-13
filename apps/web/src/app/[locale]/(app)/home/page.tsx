import {
  ArrowRight,
  Building2,
  DoorOpen,
  GraduationCap,
  Send,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ActivityList,
  Section,
  StatTiles,
  StatusChip,
  type ActivityItem,
} from "@/components/patterns";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireAdminContext } from "@/lib/center";
import { LATER_STEPS, nextStep, readProgress } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("home");
  return { title: t("title") };
}

/** Owner/admin landing page: stat tiles + next steps. Real dashboards come in M7 (20-analytics). */
export default async function HomePage() {
  const ctx = await requireAdminContext();
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
      >
        <StatTiles
          items={[
            {
              key: "students",
              label: t("students"),
              value: format.number(counts.students),
              icon: GraduationCap,
              tone: "green",
              href: "/students",
            },
            {
              key: "groups",
              label: t("groups"),
              value: format.number(counts.groups),
              icon: UsersRound,
              tone: "purple",
              href: "/groups",
            },
            {
              key: "branches",
              label: t("branches"),
              value: format.number(counts.branches),
              icon: Building2,
              tone: "blue",
              href: "/settings/branches",
            },
            {
              key: "staff",
              label: t("staff"),
              value: format.number(counts.staff),
              icon: Users,
              tone: "orange",
              href: ctx.can.manageStaff ? "/staff" : undefined,
            },
          ]}
        />
      </Section>

      <Section title={t("nextSteps")} titleSize="card" description={t("nextStepsHint")}>
        <ActivityList items={steps} />
      </Section>
    </>
  );
}
