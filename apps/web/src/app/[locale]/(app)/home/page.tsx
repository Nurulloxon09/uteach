import { Building2, DoorOpen, UserPlus, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  ActivityList,
  Section,
  StatTiles,
  StatusChip,
  type ActivityItem,
} from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
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

  const [branches, rooms, staff] = await Promise.all([
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
  ]);
  const counts = {
    branches: branches.count ?? 0,
    rooms: rooms.count ?? 0,
    staff: staff.count ?? 0,
  };

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
              key: "branches",
              label: t("branches"),
              value: format.number(counts.branches),
              icon: Building2,
              tone: "purple",
              href: "/settings/branches",
            },
            {
              key: "rooms",
              label: t("rooms"),
              value: format.number(counts.rooms),
              icon: DoorOpen,
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
