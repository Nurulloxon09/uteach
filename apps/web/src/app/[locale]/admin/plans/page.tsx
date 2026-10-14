import { Layers } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  MoneyAmount,
  PageAction,
  PageHeader,
  Section,
  StatusChip,
} from "@/components/patterns";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/super-admin";
import { minorToInput } from "@/lib/validation";
import {
  PaymentInstructionsForm,
  PlanDialog,
  PlanRowActions,
  type PlanFormValues,
} from "./plan-dialogs";

export async function generateMetadata() {
  const t = await getTranslations("admin.plans");
  return { title: t("title") };
}

/**
 * /admin/plans (M7b): plans with their limits and monthly price. A plan in use can only be hidden; the trial
 * plan holds the trial limits and is never public. Below: the "How to pay" text owners see.
 */
export default async function AdminPlansPage() {
  const admin = await requireSuperAdmin();
  const db = admin.db!;
  const t = await getTranslations("admin.plans");
  const format = await getFormatter();
  // Plans and platform settings are readable by anyone signed in; only admin_* go through the service role.
  const supabase = await createClient();

  const [{ data: plans }, { data: centers }, { data: setting }] = await Promise.all([
    supabase
      .from("plans")
      .select(
        "id, code, name, student_limit, branch_limit, price_amount, currency, is_public, sort_order, archived_at",
      )
      .order("sort_order")
      .order("name"),
    db.rpc("admin_centers", { p_actor: admin.id }),
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_instructions")
      .maybeSingle(),
  ]);
  const rows = plans ?? [];
  type Row = (typeof rows)[number];
  // Centers per plan (a center without a plan is on the trial plan).
  const used = new Map<string, number>();
  for (const c of centers ?? []) used.set(c.plan_id ?? "", (used.get(c.plan_id ?? "") ?? 0) + 1);
  const trialId = rows.find((p) => p.code === "trial")?.id;
  const centersOn = (p: Row) =>
    (used.get(p.id) ?? 0) + (p.id === trialId ? (used.get("") ?? 0) : 0);

  const limit = (n: number | null) => (n === null ? t("unlimited") : format.number(n));
  const formValues = (p: Row): PlanFormValues => ({
    id: p.id,
    code: p.code,
    name: p.name,
    studentLimit: p.student_limit?.toString() ?? "",
    branchLimit: p.branch_limit?.toString() ?? "",
    price: minorToInput(p.price_amount),
    isPublic: p.is_public,
    sortOrder: p.sort_order.toString(),
  });
  const visibility = (p: Row) =>
    p.archived_at ? (
      <StatusChip tone="muted">{t("hiddenChip")}</StatusChip>
    ) : p.is_public ? (
      <StatusChip tone="success">{t("publicChip")}</StatusChip>
    ) : (
      <StatusChip tone="warning">{t("privateChip")}</StatusChip>
    );
  const actions = (p: Row) => (
    <PlanRowActions plan={formValues(p)} archived={p.archived_at !== null} />
  );
  const price = (p: Row) => <MoneyAmount minor={p.price_amount} currency={p.currency} />;

  return (
    <>
      <PageHeader
        title={t("title")}
        action={<PlanDialog trigger={<PageAction>{t("addButton")}</PageAction>} />}
      />
      <Section title={t("listTitle")} description={t("listHint")}>
        <DataTable
          testId="admin-plan-row"
          rows={rows}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={Layers} title={t("empty")} />}
          columns={[
            {
              key: "name",
              header: t("name"),
              cell: (p) => (
                <div>
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                </div>
              ),
            },
            { key: "students", header: t("studentLimit"), cell: (p) => limit(p.student_limit) },
            { key: "branches", header: t("branchLimit"), cell: (p) => limit(p.branch_limit) },
            { key: "price", header: t("price"), cell: price },
            { key: "visible", header: t("visibility"), cell: visibility },
            {
              key: "centers",
              header: t("centers"),
              cell: (p) => <span className="tabular-nums">{format.number(centersOn(p))}</span>,
            },
            { key: "actions", header: t("actions"), cell: actions, className: "w-40" },
          ]}
          mobileCard={(p) => (
            <MobileRecord
              title={p.name}
              subtitle={p.code}
              status={visibility(p)}
              fields={[
                { label: t("price"), value: price(p) },
                { label: t("studentLimit"), value: limit(p.student_limit) },
                { label: t("branchLimit"), value: limit(p.branch_limit) },
              ]}
              actions={actions(p)}
            />
          )}
        />
      </Section>
      <Section title={t("instructionsTitle")} description={t("instructionsHint")}>
        <PaymentInstructionsForm values={(setting?.value ?? {}) as Record<string, string>} />
      </Section>
    </>
  );
}
