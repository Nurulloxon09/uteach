import { Activity, CircleAlert, CircleCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  PageHeader,
  Section,
  StatTiles,
  StatusChip,
} from "@/components/patterns";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function generateMetadata() {
  const t = await getTranslations("admin.health");
  return { title: t("title") };
}

/** A heartbeat older than this means the service is down (the worker beats every 30 s; 30-milestones M4). */
const STALE_MS = 2 * 60 * 1000;

type Health = {
  heartbeats: { service: string; last_beat_at: string }[];
  outbox: {
    pending: number;
    due: number;
    oldest_due_at: string | null;
    sent_24h: number;
    failed_24h: number;
    sms_failed_24h: number;
  };
  cron: {
    job: string;
    schedule: string;
    active: boolean;
    last_start: string | null;
    last_status: string | null;
    last_message: string | null;
  }[];
};

/**
 * /admin/health (M7b): worker heartbeats, the outbox backlog and 24 h failure rate, SMS failures and each pg_cron
 * job's last run.
 */
export default async function AdminHealthPage() {
  const admin = await requireSuperAdmin();
  const t = await getTranslations("admin.health");
  const format = await getFormatter();
  const { data } = await admin.db!.rpc("admin_health", { p_actor: admin.id });
  const h = data as unknown as Health;
  // A server render: "now" is the request time.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const ago = (d: string | null) => (d ? format.relativeTime(new Date(d), now) : t("never"));
  const finished = h.outbox.sent_24h + h.outbox.failed_24h;
  const failureRate = finished === 0 ? 0 : h.outbox.failed_24h / finished;

  type Job = Health["cron"][number];
  const jobOk = (j: Job) => j.active && j.last_status !== "failed";
  const jobChip = (j: Job) => (
    <StatusChip tone={!j.active ? "muted" : jobOk(j) ? "success" : "destructive"}>
      {!j.active ? t("paused") : j.last_status === "failed" ? t("failed") : t("ok")}
    </StatusChip>
  );

  return (
    <>
      <PageHeader title={t("title")} />
      <StatTiles
        items={[
          {
            key: "due",
            label: t("due"),
            value: format.number(h.outbox.due),
            icon: Activity,
            tone: "blue",
          },
          {
            key: "pending",
            label: t("pending"),
            value: format.number(h.outbox.pending),
            icon: Activity,
            tone: "purple",
          },
          {
            key: "failed",
            label: t("failureRate"),
            value: format.number(failureRate, { style: "percent", maximumFractionDigits: 1 }),
            icon: CircleAlert,
            tone: failureRate > 0.05 ? "orange" : "green",
          },
          {
            key: "sms",
            label: t("smsFailed"),
            value: format.number(h.outbox.sms_failed_24h),
            icon: CircleAlert,
            tone: h.outbox.sms_failed_24h > 0 ? "orange" : "green",
          },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("servicesTitle")} description={t("servicesHint")}>
          {h.heartbeats.length === 0 ? (
            <EmptyState icon={Activity} title={t("noHeartbeats")} />
          ) : (
            <ul className="divide-y divide-border">
              {h.heartbeats.map((s) => {
                const ok = now - new Date(s.last_beat_at).getTime() < STALE_MS;
                return (
                  <li
                    key={s.service}
                    className="flex items-center justify-between gap-4 py-3"
                    data-testid="admin-service"
                  >
                    <div className="flex items-center gap-3">
                      {ok ? (
                        <CircleCheck className="size-5 text-success" aria-hidden />
                      ) : (
                        <CircleAlert className="size-5 text-destructive" aria-hidden />
                      )}
                      <div>
                        <p className="font-semibold text-foreground">{s.service}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("lastBeat", { when: ago(s.last_beat_at) })}
                        </p>
                      </div>
                    </div>
                    <StatusChip tone={ok ? "success" : "destructive"}>
                      {ok ? t("ok") : t("down")}
                    </StatusChip>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title={t("outboxTitle")}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{t("oldestDue")}</dt>
            <dd className="font-medium">
              {h.outbox.oldest_due_at ? ago(h.outbox.oldest_due_at) : "—"}
            </dd>
            <dt className="text-muted-foreground">{t("sent24h")}</dt>
            <dd className="font-medium tabular-nums">{format.number(h.outbox.sent_24h)}</dd>
            <dt className="text-muted-foreground">{t("failed24h")}</dt>
            <dd className="font-medium tabular-nums">{format.number(h.outbox.failed_24h)}</dd>
          </dl>
        </Section>
      </div>
      <Section title={t("cronTitle")} description={t("cronHint")}>
        <DataTable
          testId="admin-cron-row"
          rows={h.cron}
          rowKey={(j) => j.job}
          columns={[
            {
              key: "job",
              header: t("job"),
              cell: (j) => <span className="font-mono text-sm">{j.job}</span>,
            },
            {
              key: "schedule",
              header: t("schedule"),
              cell: (j) => <span className="font-mono text-sm">{j.schedule}</span>,
            },
            { key: "last", header: t("lastRun"), cell: (j) => ago(j.last_start) },
            { key: "status", header: t("status"), cell: jobChip },
            {
              key: "message",
              header: t("message"),
              cell: (j) => (
                <span className="text-sm text-muted-foreground">{j.last_message ?? "—"}</span>
              ),
            },
          ]}
          mobileCard={(j) => (
            <MobileRecord
              title={j.job}
              subtitle={j.schedule}
              status={jobChip(j)}
              fields={[{ label: t("lastRun"), value: ago(j.last_start) }]}
            />
          )}
        />
      </Section>
    </>
  );
}
