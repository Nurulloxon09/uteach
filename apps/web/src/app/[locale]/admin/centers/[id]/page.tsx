import type { CenterStatus } from "@uteach/db";
import { Eye, Inbox } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  MoneyAmount,
  PageHeader,
  Section,
  StatusChip,
} from "@/components/patterns";
import { Alert } from "@/components/ui/alert";
import { uuidField } from "@/lib/validation";
import { requireSuperAdmin } from "@/lib/super-admin";

export async function generateMetadata() {
  const t = await getTranslations("admin.support");
  return { title: t("title") };
}

type Support = {
  center: {
    id: string;
    name: string;
    status: CenterStatus;
    timezone: string;
    default_locale: string;
    currency: string;
    created_at: string;
  };
  branches: { name: string; archived: boolean }[];
  staff: {
    name: string;
    role: "owner" | "admin" | "teacher";
    status: "invited" | "active" | "disabled";
    last_sign_in_at: string | null;
  }[];
  students: { total: number; active: number; archived: number };
  groups: { name: string; status: "forming" | "active" | "finished"; students: number }[];
  payments: {
    paid_at: string;
    amount: number;
    method: "cash" | "card" | "transfer" | "online";
    voided: boolean;
  }[];
  failed_messages: { at: string; template: string; channel: string | null; error: string | null }[];
  imports: {
    at: string;
    kind: string;
    status: string;
    rows: number | null;
    errors: number | null;
  }[];
};

/**
 * Support view (03, M7b): a read-only summary of one center for helping its owner. Each open is written to the
 * center's audit log (`support_view`), which the owner sees. No student names; no "log in as".
 */
export default async function SupportViewPage({
  params,
}: PageProps<"/[locale]/admin/centers/[id]">) {
  const { id } = await params;
  if (!uuidField.safeParse(id).success) notFound();
  const admin = await requireSuperAdmin();
  const t = await getTranslations("admin.support");
  const tn = await getTranslations("admin.nav");
  const tc = await getTranslations("common");
  const ts = await getTranslations("centerStatus");
  const tr = await getTranslations("roles");
  const tm = await getTranslations("memberStatus");
  const tg = await getTranslations("groups.status");
  const tp = await getTranslations("billing.methods");
  const format = await getFormatter();

  const { data, error } = await admin.db!.rpc("admin_support_view", {
    p_actor: admin.id,
    p_center_id: id,
  });
  if (error || !data) notFound();
  const v = data as unknown as Support;
  const tz = v.center.timezone;
  const when = (d: string | null) =>
    d
      ? format.dateTime(new Date(d), {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: tz,
        })
      : "—";
  const n = (x: number | null) => (x === null ? "—" : format.number(x));
  const empty = <EmptyState icon={Inbox} title={t("nothing")} />;

  return (
    <>
      <PageHeader
        title={v.center.name}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[{ label: tn("centers"), href: "/admin/centers" }, { label: t("title") }]}
        meta={<StatusChip tone="muted">{ts(v.center.status)}</StatusChip>}
      />
      <Alert data-testid="support-audited">
        <Eye />
        <p>{t("audited")}</p>
      </Alert>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("centerTitle")}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{t("created")}</dt>
            <dd className="font-medium">{when(v.center.created_at)}</dd>
            <dt className="text-muted-foreground">{t("timezone")}</dt>
            <dd className="font-medium">{v.center.timezone}</dd>
            <dt className="text-muted-foreground">{t("language")}</dt>
            <dd className="font-medium uppercase">{v.center.default_locale}</dd>
            <dt className="text-muted-foreground">{t("branches")}</dt>
            <dd className="font-medium">
              {v.branches
                .map((b) => (b.archived ? t("archivedName", { name: b.name }) : b.name))
                .join(", ") || "—"}
            </dd>
            <dt className="text-muted-foreground">{t("students")}</dt>
            <dd className="font-medium" data-testid="support-students">
              {t("studentCounts", {
                total: v.students.total,
                active: v.students.active,
                archived: v.students.archived,
              })}
            </dd>
          </dl>
        </Section>

        <Section title={t("staffTitle")}>
          <DataTable
            rows={v.staff}
            rowKey={(s) => `${s.name}-${s.role}`}
            empty={empty}
            columns={[
              { key: "name", header: t("name"), cell: (s) => s.name },
              { key: "role", header: t("role"), cell: (s) => tr(s.role) },
              { key: "status", header: t("status"), cell: (s) => tm(s.status) },
              { key: "seen", header: t("lastSignIn"), cell: (s) => when(s.last_sign_in_at) },
            ]}
            mobileCard={(s) => (
              <MobileRecord
                title={s.name}
                subtitle={`${tr(s.role)} · ${tm(s.status)}`}
                fields={[{ label: t("lastSignIn"), value: when(s.last_sign_in_at) }]}
              />
            )}
          />
        </Section>

        <Section title={t("groupsTitle")}>
          <DataTable
            rows={v.groups}
            rowKey={(g) => g.name}
            empty={empty}
            columns={[
              { key: "name", header: t("name"), cell: (g) => g.name },
              { key: "status", header: t("status"), cell: (g) => tg(g.status) },
              {
                key: "students",
                header: t("activeStudents"),
                cell: (g) => <span className="tabular-nums">{n(g.students)}</span>,
              },
            ]}
            mobileCard={(g) => (
              <MobileRecord
                title={g.name}
                subtitle={tg(g.status)}
                fields={[{ label: t("activeStudents"), value: n(g.students) }]}
              />
            )}
          />
        </Section>

        <Section title={t("paymentsTitle")} description={t("paymentsHint")}>
          <DataTable
            rows={v.payments}
            rowKey={(p) => `${p.paid_at}-${p.amount}`}
            empty={empty}
            columns={[
              { key: "at", header: t("when"), cell: (p) => when(p.paid_at) },
              { key: "method", header: t("method"), cell: (p) => tp(p.method) },
              {
                key: "amount",
                header: t("amount"),
                cell: (p) => (
                  <MoneyAmount
                    minor={p.amount}
                    currency={v.center.currency}
                    tone={p.voided ? "muted" : "plain"}
                  />
                ),
              },
            ]}
            mobileCard={(p) => (
              <MobileRecord
                title={<MoneyAmount minor={p.amount} currency={v.center.currency} />}
                subtitle={`${when(p.paid_at)} · ${tp(p.method)}`}
              />
            )}
          />
        </Section>

        <Section title={t("failedTitle")}>
          <DataTable
            rows={v.failed_messages}
            rowKey={(m) => `${m.at}-${m.template}`}
            empty={empty}
            columns={[
              { key: "at", header: t("when"), cell: (m) => when(m.at) },
              {
                key: "what",
                header: t("message"),
                cell: (m) => `${m.template} · ${m.channel ?? "—"}`,
              },
              {
                key: "error",
                header: t("error"),
                cell: (m) => (
                  <span className="text-sm text-muted-foreground">{m.error ?? "—"}</span>
                ),
              },
            ]}
            mobileCard={(m) => (
              <MobileRecord
                title={m.template}
                subtitle={when(m.at)}
                fields={[{ label: t("error"), value: m.error ?? "—" }]}
              />
            )}
          />
        </Section>

        <Section title={t("importsTitle")}>
          <DataTable
            rows={v.imports}
            rowKey={(j) => `${j.at}-${j.kind}`}
            empty={empty}
            columns={[
              { key: "at", header: t("when"), cell: (j) => when(j.at) },
              { key: "kind", header: t("kind"), cell: (j) => `${j.kind} · ${j.status}` },
              {
                key: "rows",
                header: t("rows"),
                cell: (j) => (
                  <span className="tabular-nums">
                    {t("rowsErrors", { rows: n(j.rows), errors: n(j.errors) })}
                  </span>
                ),
              },
            ]}
            mobileCard={(j) => (
              <MobileRecord
                title={`${j.kind} · ${j.status}`}
                subtitle={when(j.at)}
                fields={[
                  {
                    label: t("rows"),
                    value: t("rowsErrors", { rows: n(j.rows), errors: n(j.errors) }),
                  },
                ]}
              />
            )}
          />
        </Section>
      </div>
    </>
  );
}
