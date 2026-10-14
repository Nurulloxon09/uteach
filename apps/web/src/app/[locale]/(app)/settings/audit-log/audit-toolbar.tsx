"use client";

import { Table2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { FilterButton, type FilterOption } from "@/components/patterns";
import { useListParams } from "@/components/patterns/url-params";
import { Input } from "@/components/ui/input";

/** Table, person and period (from / to) filters of the Audit log; state in the URL. */
export function AuditToolbar({
  from,
  to,
  tables,
  people,
}: {
  from: string;
  to: string;
  tables: FilterOption[];
  people: FilterOption[];
}) {
  const t = useTranslations("auditLog");
  const { setParams } = useListParams();

  return (
    <>
      <FilterButton
        icon={<Table2 strokeWidth={1.8} />}
        label={t("table")}
        param="table"
        allLabel={t("allTables")}
        options={tables}
      />
      <FilterButton
        icon={<UserRound strokeWidth={1.8} />}
        label={t("person")}
        param="person"
        allLabel={t("allPeople")}
        options={people}
      />
      <div className="flex items-center gap-2">
        <Input
          id="audit-from"
          type="date"
          value={from}
          max={to}
          aria-label={t("from")}
          onChange={(e) => e.target.value && setParams({ from: e.target.value })}
          className="h-11 w-40"
        />
        <span className="h-px w-3 bg-border" aria-hidden />
        <Input
          id="audit-to"
          type="date"
          value={to}
          min={from}
          aria-label={t("to")}
          onChange={(e) => e.target.value && setParams({ to: e.target.value })}
          className="h-11 w-40"
        />
      </div>
    </>
  );
}
