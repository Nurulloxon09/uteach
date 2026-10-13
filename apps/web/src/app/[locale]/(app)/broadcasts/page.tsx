import { Megaphone, Plus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  PageHeader,
  Section,
  StatusChip,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { loadComposerOptions } from "@/lib/broadcasts";
import { requireAdminContext } from "@/lib/center";
import { createClient } from "@/lib/supabase/server";
import { BroadcastComposer } from "./broadcast-composer";
import { CancelBroadcastButton } from "./cancel-button";

export async function generateMetadata() {
  const t = await getTranslations("broadcasts");
  return { title: t("title") };
}

type AudienceDb = {
  branch_ids?: string[];
  group_ids?: string[];
  course_ids?: string[];
  student_ids?: string[];
  debtors?: boolean;
  recipients?: "guardians" | "students" | "both";
};

type Row = {
  id: string;
  created_at: string;
  scheduled_at: string | null;
  body: string;
  channel: "telegram" | "sms" | "whatsapp" | "email";
  status: string;
  recipient_count: number;
  audience: AudienceDb;
  stats: { pending: number; sent: number; failed: number; skipped: number; cancelled: number };
};

/**
 * Broadcasts (17): history (when, audience, channel, recipients, delivered / waiting / not delivered, status)
 * with cancel for messages not sent yet, and "New broadcast". `broadcasts`; RLS keeps admins to broadcasts
 * inside their branches.
 */
export default async function BroadcastsPage() {
  const ctx = await requireAdminContext();
  if (!ctx.can.broadcasts) notFound();
  const t = await getTranslations("broadcasts");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data }, options] = await Promise.all([
    supabase
      .from("broadcasts")
      .select("id, created_at, scheduled_at, body, channel, status, recipient_count, audience")
      .eq("center_id", ctx.center.id)
      .order("created_at", { ascending: false })
      .limit(100),
    loadComposerOptions(ctx),
  ]);
  const ids = (data ?? []).map((b) => b.id);
  const { data: stats } = ids.length
    ? await supabase.rpc("broadcast_stats", { p_broadcast_ids: ids })
    : { data: [] };
  const statsOf = new Map((stats ?? []).map((s) => [s.broadcast_id, s]));
  const rows: Row[] = (data ?? []).map((b) => ({
    ...b,
    audience: (b.audience ?? {}) as AudienceDb,
    stats: statsOf.get(b.id) ?? { pending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0 },
  }));

  const when = (r: Row) =>
    format.dateTime(new Date(r.scheduled_at ?? r.created_at), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: ctx.center.timezone,
    });
  const audienceOf = (r: Row) => {
    const a = r.audience;
    const parts: string[] = [];
    if (a.student_ids?.length) parts.push(t("summary.students", { count: a.student_ids.length }));
    if (a.debtors) parts.push(t("summary.debtors"));
    if (a.group_ids?.length) parts.push(t("summary.groups", { count: a.group_ids.length }));
    if (a.course_ids?.length) parts.push(t("summary.courses", { count: a.course_ids.length }));
    if (a.branch_ids?.length) parts.push(t("summary.branches", { count: a.branch_ids.length }));
    if (parts.length === 0) parts.push(t("summary.everyone"));
    parts.push(t(`audience.${a.recipients ?? "guardians"}`));
    return parts.join(" · ");
  };
  const deliveryOf = (r: Row) => (
    <div className="flex flex-wrap gap-2 text-sm">
      <StatusChip tone="success">{t("delivered", { count: r.stats.sent })}</StatusChip>
      {r.stats.pending > 0 ? (
        <StatusChip tone="warning">{t("waiting", { count: r.stats.pending })}</StatusChip>
      ) : null}
      {r.stats.failed + r.stats.skipped > 0 ? (
        <StatusChip tone="destructive">
          {t("notDelivered", { count: r.stats.failed + r.stats.skipped })}
        </StatusChip>
      ) : null}
    </div>
  );
  const statusOf = (r: Row) =>
    r.status === "cancelled" ? (
      <StatusChip tone="muted">{t("status.cancelled")}</StatusChip>
    ) : r.stats.pending > 0 ? (
      <StatusChip tone="primary">
        {r.scheduled_at && new Date(r.scheduled_at) > new Date(r.created_at)
          ? t("status.scheduled")
          : t("status.sending")}
      </StatusChip>
    ) : (
      <StatusChip tone="success">{t("status.done")}</StatusChip>
    );
  const actionsOf = (r: Row) =>
    r.status !== "cancelled" && r.stats.pending > 0 ? <CancelBroadcastButton id={r.id} /> : null;
  const messageOf = (r: Row) => (
    <div className="max-w-md space-y-0.5">
      <p className="line-clamp-2 text-[15px] text-foreground">{r.body}</p>
      <p className="text-sm text-muted-foreground">{audienceOf(r)}</p>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("home"), href: "/home" }, { label: t("title") }]}
        action={
          <BroadcastComposer
            options={options}
            trigger={
              <Button size="lg" data-testid="new-broadcast">
                <Plus />
                {t("new")}
              </Button>
            }
          />
        }
      />
      <Section title={t("historyTitle")} description={t("historyHint")}>
        <DataTable
          testId="broadcast-row"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Megaphone} title={t("emptyTitle")} hint={t("emptyHint")} />}
          columns={[
            { key: "when", header: t("whenColumn"), cell: when, className: "w-36" },
            { key: "message", header: t("message"), cell: messageOf },
            {
              key: "channel",
              header: t("channel"),
              cell: (r) => t(`channels.${r.channel === "sms" ? "sms" : "telegram"}`),
            },
            {
              key: "recipients",
              header: t("recipients"),
              cell: (r) => format.number(r.recipient_count),
            },
            { key: "delivery", header: t("delivery"), cell: deliveryOf },
            { key: "status", header: tc("status"), cell: statusOf },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-32" },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={when(r)}
              subtitle={audienceOf(r)}
              status={statusOf(r)}
              fields={[
                { label: t("message"), value: r.body },
                { label: t("delivery"), value: deliveryOf(r) },
              ]}
              actions={actionsOf(r)}
            />
          )}
        />
      </Section>
    </>
  );
}
