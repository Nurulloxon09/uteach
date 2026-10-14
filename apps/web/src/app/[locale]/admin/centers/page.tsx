import { addDays, todayIn } from "@uteach/core";
import type { CenterStatus } from "@uteach/db";
import { Building2, CircleAlert, CircleCheck, Hourglass } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  NameCell,
  PageHeader,
  Section,
  StatTiles,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { CenterRowActions } from "../admin-dialogs";

export async function generateMetadata() {
  const t = await getTranslations("admin.centers");
  return { title: t("title") };
}

const STATUS_TONE: Record<CenterStatus, ChipTone> = {
  trial: "primary",
  active: "success",
  past_due: "warning",
  read_only: "destructive",
  cancelled: "muted",
};

/**
 * /admin/centers (M7b): every center with its status, plan, active students against the limit, trial end or paid
 * period, and last activity. Row actions: support view, extend trial, change plan, set status, issue invoice.
 */
export default async function AdminCentersPage() {
  const admin = await requireSuperAdmin();
  const db = admin.db!;
  const t = await getTranslations("admin.centers");
  const ts = await getTranslations("centerStatus");
  const format = await getFormatter();
  // Plans and platform settings are readable by anyone signed in; only admin_* go through the service role.
  const supabase = await createClient();

  const [{ data: centers }, { data: plans }] = await Promise.all([
    db.rpc("admin_centers", { p_actor: admin.id }),
    supabase
      .from("plans")
      .select("id, name, code, archived_at")
      .is("archived_at", null)
      .order("sort_order"),
  ]);
  const rows = centers ?? [];
  const planOptions = (plans ?? []).map((p) => ({ value: p.id, label: p.name }));
  const invoicePlans = (plans ?? [])
    .filter((p) => p.code !== "trial")
    .map((p) => ({ value: p.id, label: p.name }));
  const trialPlanId = (plans ?? []).find((p) => p.code === "trial")?.id ?? "";
  // uteach bills in Tashkent time; the default period is the next 30 days.
  const today = todayIn("Asia/Tashkent");
  const defaultPeriod = { start: today, end: addDays(today, 29) };

  const count = (s: CenterStatus) => rows.filter((r) => r.status === s).length;
  const when = (d: string | null) =>
    d ? format.dateTime(new Date(d), { dateStyle: "medium", timeZone: "Asia/Tashkent" }) : "—";
  const day = (d: string | null) =>
    d ? format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) : "—";
  type Row = (typeof rows)[number];
  const students = (r: Row) =>
    r.student_limit === null
      ? format.number(r.active_students)
      : t("used", {
          used: format.number(r.active_students),
          limit: format.number(r.student_limit),
        });
  const dates = (r: Row) =>
    r.status === "trial" || (!r.paid_until && r.trial_ends_at)
      ? t("trialEnds", { date: when(r.trial_ends_at) })
      : r.paid_until
        ? t("paidUntil", { date: day(r.paid_until) })
        : "—";
  const statusChip = (r: Row) => (
    <StatusChip tone={STATUS_TONE[r.status]}>{ts(r.status)}</StatusChip>
  );
  const name = (r: Row) => (
    <Link href={`/admin/centers/${r.id}`} className="hover:text-primary">
      <NameCell name={r.name} sub={[r.owner_name, r.owner_phone].filter(Boolean).join(" · ")} />
    </Link>
  );
  const actions = (r: Row) => (
    <CenterRowActions
      center={{
        id: r.id,
        name: r.name,
        status: r.status,
        planId: r.plan_id ?? trialPlanId,
        canExtend: ["trial", "past_due", "read_only"].includes(r.status) && !r.paid_until,
      }}
      plans={planOptions}
      invoicePlans={invoicePlans}
      defaultPeriod={defaultPeriod}
    />
  );

  return (
    <>
      <PageHeader title={t("title")} />
      <StatTiles
        items={[
          {
            key: "all",
            label: t("total"),
            value: format.number(rows.length),
            icon: Building2,
            tone: "purple",
          },
          {
            key: "trial",
            label: ts("trial"),
            value: format.number(count("trial")),
            icon: Hourglass,
            tone: "blue",
          },
          {
            key: "active",
            label: ts("active"),
            value: format.number(count("active")),
            icon: CircleCheck,
            tone: "green",
          },
          {
            key: "late",
            label: t("overdueOrReadOnly"),
            value: format.number(count("past_due") + count("read_only")),
            icon: CircleAlert,
            tone: "orange",
          },
        ]}
      />
      <Section title={t("listTitle")} description={t("listHint")}>
        <DataTable
          testId="admin-center-row"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Building2} title={t("empty")} />}
          columns={[
            { key: "center", header: t("center"), cell: name },
            { key: "status", header: t("status"), cell: statusChip },
            { key: "plan", header: t("plan"), cell: (r) => r.plan_name },
            {
              key: "students",
              header: t("students"),
              cell: (r) => <span className="tabular-nums">{students(r)}</span>,
            },
            { key: "dates", header: t("dates"), cell: dates },
            { key: "activity", header: t("lastActivity"), cell: (r) => when(r.last_activity_at) },
            { key: "actions", header: t("actions"), cell: actions, className: "w-56" },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={r.name}
              subtitle={r.owner_name ?? undefined}
              status={statusChip(r)}
              fields={[
                { label: t("plan"), value: r.plan_name },
                { label: t("students"), value: students(r) },
                { label: t("dates"), value: dates(r) },
              ]}
              actions={actions(r)}
            />
          )}
        />
      </Section>
    </>
  );
}
