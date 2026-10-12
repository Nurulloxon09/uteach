"use client";

import { Building2, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { FilterButton, TableSearch } from "@/components/patterns";
import { useListParams } from "@/components/patterns/url-params";
import { Input } from "@/components/ui/input";

/** Period (from / to), search, method and branch filters of the Payments page; state in the URL. */
export function PaymentsToolbar({
  from,
  to,
  branches,
}: {
  from: string;
  to: string;
  branches: { id: string; name: string }[];
}) {
  const t = useTranslations("billing.page");
  const tm = useTranslations("billing.methods");
  const { setParams } = useListParams();

  return (
    <>
      <TableSearch placeholder={t("search")} label={t("search")} />
      <div className="flex items-center gap-2">
        <Input
          id="payments-from"
          type="date"
          value={from}
          max={to}
          aria-label={t("from")}
          onChange={(e) => e.target.value && setParams({ from: e.target.value })}
          className="h-11 w-40"
        />
        <span className="h-px w-3 bg-border" aria-hidden />
        <Input
          id="payments-to"
          type="date"
          value={to}
          min={from}
          aria-label={t("to")}
          onChange={(e) => e.target.value && setParams({ to: e.target.value })}
          className="h-11 w-40"
        />
      </div>
      <FilterButton
        icon={<CreditCard strokeWidth={1.8} />}
        label={t("method")}
        param="method"
        allLabel={t("allMethods")}
        options={(["cash", "card", "transfer", "online"] as const).map((m) => ({
          value: m,
          label: tm(m),
        }))}
      />
      {branches.length > 1 ? (
        <FilterButton
          icon={<Building2 strokeWidth={1.8} />}
          label={t("branch")}
          param="branch"
          allLabel={t("allBranches")}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : null}
    </>
  );
}
