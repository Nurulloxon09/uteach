import { attendanceRate, changeSince, collectionRate } from "@uteach/core";
import { Building2, CalendarCheck2, GraduationCap, Percent, Wallet } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { FilterButton, MoneyAmount, Section, StatTiles } from "@/components/patterns";
import { Link } from "@/i18n/navigation";
import type { CenterContext } from "@/lib/center";
import type { OwnerDashboard as Data } from "@/lib/dashboards";

const BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;

/**
 * The owner's Home (20 · M7c): today, this month's money and debt by age, students and leads, then a card per
 * branch. The branch filter narrows everything to one branch.
 */
export async function OwnerDashboard({
  ctx,
  data,
  branches,
}: {
  ctx: CenterContext;
  data: Data;
  branches: { id: string; name: string }[];
}) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const currency = ctx.center.currency;
  const pct = (r: number | null) =>
    r === null ? "—" : format.number(r, { style: "percent", maximumFractionDigits: 0 });
  const attendance = attendanceRate(data.today.present, data.today.late, data.today.absent);
  const rate = collectionRate(data.month.collected, data.month.charged);
  const delta = changeSince(data.students.active, data.students.active_last_month);
  const money = (minor: number) => <MoneyAmount minor={minor} currency={currency} />;

  return (
    <>
      <Section
        title={t("todayTitle")}
        titleSize="card"
        tools={
          branches.length > 1 ? (
            <FilterButton
              icon={<Building2 strokeWidth={1.8} />}
              label={t("branch")}
              param="branch"
              allLabel={t("allBranches")}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          ) : undefined
        }
      >
        <div data-testid="owner-today">
          <StatTiles
            items={[
              {
                key: "lessons",
                label: t("lessonsToday"),
                value: t("markedOf", {
                  marked: format.number(data.today.marked_lessons),
                  total: format.number(data.today.lessons),
                }),
                icon: CalendarCheck2,
                tone: "purple",
                href: "/attendance",
              },
              {
                key: "attendance",
                label: t("attendanceToday"),
                value: pct(attendance),
                icon: Percent,
                tone: "blue",
              },
              {
                key: "payments",
                label: t("paymentsToday", { count: data.today.payments_count }),
                value: money(data.today.payments_amount),
                icon: Wallet,
                tone: "green",
                href: "/payments",
              },
              {
                key: "students",
                label: t("activeStudents"),
                value: (
                  <span>
                    {format.number(data.students.active)}{" "}
                    <span className="text-[15px] font-semibold text-muted-foreground">
                      {t("sinceLastMonth", {
                        delta: format.number(delta, { signDisplay: "exceptZero" }),
                      })}
                    </span>
                  </span>
                ),
                icon: GraduationCap,
                tone: "orange",
                href: "/students",
              },
            ]}
          />
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("monthTitle")} titleSize="card" description={t("monthHint")}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4" data-testid="owner-month">
            <div>
              <dt className="text-sm text-muted-foreground">{t("charged")}</dt>
              <dd className="mt-1 text-xl font-bold">{money(data.month.charged)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("collected")}</dt>
              <dd className="mt-1 text-xl font-bold">{money(data.month.collected)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("collectionRate")}</dt>
              <dd className="mt-1 text-xl font-bold">{pct(rate)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("leads")}</dt>
              <dd className="mt-1 text-xl font-bold">
                {t("leadsValue", { new: data.leads.new, won: data.leads.won })}
              </dd>
            </div>
          </dl>
        </Section>

        <Section
          title={t("debtTitle")}
          titleSize="card"
          description={t("debtHint", { count: data.debt.students })}
          tools={
            <Link href="/debtors" className="text-sm font-semibold text-primary hover:underline">
              {t("openDebtors")}
            </Link>
          }
        >
          <div data-testid="owner-debt" className="space-y-3">
            <p className="text-2xl font-bold">{money(data.debt.total)}</p>
            <ul className="space-y-2">
              {BUCKETS.map((b) => {
                const share = data.debt.total === 0 ? 0 : data.debt.buckets[b] / data.debt.total;
                return (
                  <li
                    key={b}
                    className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">{t(`buckets.${b}`)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </span>
                    <span className="font-medium tabular-nums">{money(data.debt.buckets[b])}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
      </div>

      {data.branches.length > 1 ? (
        <Section title={t("branchesTitle")} titleSize="card">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="branch-cards">
            {data.branches.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl border border-border/70 p-4"
                data-testid="branch-card"
              >
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  <Building2 className="size-4 text-primary" aria-hidden />
                  {b.name}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t("lessonsToday")}</dt>
                  <dd className="font-medium tabular-nums">{format.number(b.lessons_today)}</dd>
                  <dt className="text-muted-foreground">{t("activeStudents")}</dt>
                  <dd className="font-medium tabular-nums">{format.number(b.active_students)}</dd>
                  <dt className="text-muted-foreground">{t("collected")}</dt>
                  <dd className="font-medium">{money(b.collected_month)}</dd>
                  <dt className="text-muted-foreground">{t("debtTitle")}</dt>
                  <dd className="font-medium">{money(b.debt)}</dd>
                </dl>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}
