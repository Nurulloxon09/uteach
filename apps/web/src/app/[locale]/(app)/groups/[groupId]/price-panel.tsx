"use client";

import { Wallet } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  DataTable,
  EmptyState,
  Field,
  FormDialog,
  MobileRecord,
  StatusChip,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { setPriceAction } from "../actions";

export type PriceRow = {
  id: string;
  from: string;
  price: string;
  cycleLessons: number;
  current: boolean;
};

/** Price history (group_prices) and "Change price… from which month?" (12). Money, so `billing` only. */
export function PricePanel({
  groupId,
  rows,
  editable,
  nextMonth,
  currentPrice,
  currentCycle,
}: {
  groupId: string;
  /** `price` is already formatted for display. */
  rows: PriceRow[];
  editable: boolean;
  nextMonth: string;
  /** Major units for the input. */
  currentPrice: string;
  currentCycle: number;
}) {
  const t = useTranslations("groups.price");
  const format = useFormatter();
  const monthOf = (from: string) =>
    format.dateTime(new Date(`${from}T12:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">{t("hint")}</p>
        {editable ? (
          <FormDialog
            trigger={<Button variant="outline-primary">{t("change")}</Button>}
            title={t("changeTitle")}
            description={t("changeHint")}
            action={setPriceAction}
            submitLabel={t("changeSubmit")}
            successToast={t("changed")}
            testId="price-dialog"
          >
            {(state) => (
              <>
                <input type="hidden" name="groupId" value={groupId} />
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <Field
                    name="price"
                    inputMode="decimal"
                    label={t("price")}
                    defaultValue={currentPrice}
                    state={state}
                    required
                  />
                  <Field
                    name="cycleLessons"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    label={t("cycleLessons")}
                    defaultValue={currentCycle}
                    state={state}
                    required
                  />
                </div>
                <Field
                  name="fromMonth"
                  type="month"
                  label={t("fromMonth")}
                  hint={t("fromMonthHint")}
                  defaultValue={nextMonth}
                  state={state}
                  required
                />
              </>
            )}
          </FormDialog>
        ) : null}
      </div>
      <DataTable
        testId="price-row"
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={Wallet}
            title={t("emptyTitle")}
            hint={editable ? t("emptyHint") : undefined}
          />
        }
        columns={[
          { key: "from", header: t("from"), cell: (r) => monthOf(r.from) },
          { key: "price", header: t("price"), cell: (r) => r.price },
          { key: "cycle", header: t("cycleLessons"), cell: (r) => r.cycleLessons },
          {
            key: "status",
            header: t("status"),
            cell: (r) =>
              r.current ? <StatusChip tone="success">{t("current")}</StatusChip> : null,
          },
        ]}
        mobileCard={(r) => (
          <MobileRecord
            title={r.price}
            subtitle={monthOf(r.from)}
            status={r.current ? <StatusChip tone="success">{t("current")}</StatusChip> : undefined}
            fields={[{ label: t("cycleLessons"), value: r.cycleLessons }]}
          />
        )}
      />
    </div>
  );
}
