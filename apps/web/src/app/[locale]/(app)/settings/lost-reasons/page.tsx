import { CircleSlash } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  DataTable,
  EmptyState,
  MobileRecord,
  PageHeader,
  Section,
  StatusChip,
} from "@/components/patterns";
import { requireAdminContext } from "@/lib/center";
import { loadLostReasons } from "@/lib/leads";
import { AddReasonDialog, ReasonRowActions } from "./reason-ui";

export async function generateMetadata() {
  const t = await getTranslations("lostReasons");
  return { title: t("title") };
}

/** Lost reasons (11): the list offered when a lead is lost. Owners and admins with `settings` edit it. */
export default async function LostReasonsPage() {
  const ctx = await requireAdminContext();
  const t = await getTranslations("lostReasons");
  const tl = await getTranslations("leads");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const reasons = await loadLostReasons(ctx);
  const rows = reasons.map((r, i) => ({
    ...r,
    name: r.label ?? tl(`lostReason.${r.systemKey ?? "other"}`),
    first: i === 0,
    last: i === reasons.length - 1,
  }));
  type Row = (typeof rows)[number];

  const statusOf = (r: Row) =>
    r.archived ? (
      <StatusChip tone="muted">{tc("archived")}</StatusChip>
    ) : (
      <StatusChip tone="success">{tc("active")}</StatusChip>
    );
  const actionsOf = (r: Row) =>
    ctx.can.settings ? (
      <ReasonRowActions
        id={r.id}
        label={r.name}
        archived={r.archived}
        first={r.first}
        last={r.last}
      />
    ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumbLabel={tc("breadcrumb")}
        crumbs={[
          { label: tn("home"), href: "/home" },
          { label: tn("settings") },
          { label: t("title") },
        ]}
        action={ctx.can.settings ? <AddReasonDialog /> : undefined}
      />
      <Section title={t("listTitle")} description={t("listHint")}>
        <DataTable
          testId="reason-row"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={CircleSlash} title={t("emptyTitle")} />}
          columns={[
            { key: "name", header: t("fields.label"), cell: (r) => r.name },
            { key: "status", header: tc("status"), cell: statusOf },
            { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-44" },
          ]}
          mobileCard={(r) => (
            <MobileRecord title={r.name} status={statusOf(r)} actions={actionsOf(r) ?? undefined} />
          )}
        />
      </Section>
    </>
  );
}
