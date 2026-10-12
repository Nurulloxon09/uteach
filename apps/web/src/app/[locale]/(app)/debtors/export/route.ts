import "server-only";
import { intlLocale, isLocale } from "@uteach/i18n";
import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";
import { loadBranches } from "@/lib/academics";
import { getCenterContext } from "@/lib/center";
import { dayAsDate } from "@/lib/dates";
import { isBucket, loadDebtors } from "@/lib/debtors";
import { toSheetAmount } from "@/lib/money";

/**
 * The Debtors list as .xlsx (15): the same rows and filters as the page (all pages), labels in the user's
 * language. Uses the user's session, so RLS limits it to `billing` staff and their branches.
 */
export async function GET(request: Request, { params }: RouteContext<"/[locale]/debtors/export">) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response(null, { status: 404 });
  const ctx = await getCenterContext();
  if (!ctx.can.billing) return new Response(null, { status: 404 });

  const search = new URL(request.url).searchParams;
  const branches = await loadBranches(ctx);
  const branchParam = search.get("branch");
  const bucketParam = search.get("bucket");
  const { rows } = await loadDebtors(ctx, {
    q: search.get("q") ?? "",
    branch: branches.some((b) => b.id === branchParam) ? branchParam : null,
    group: search.get("group") || null,
    course: search.get("course") || null,
    bucket: isBucket(bucketParam) ? bucketParam : null,
  });

  const t = await getTranslations({ locale, namespace: "debtors" });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const intl = intlLocale(locale);
  const dateFormat = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "UTC" });
  const paidFormat = new Intl.DateTimeFormat(intl, {
    dateStyle: "medium",
    timeZone: ctx.center.timezone,
  });
  const moneyFormat = `#,##0" ${ctx.center.currency}"`;

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(t("title").slice(0, 31));
  const head = [
    t("student"),
    t("studentPhone"),
    t("guardian"),
    t("guardianPhone"),
    t("groups"),
    ...(branches.length > 1 ? [t("branch")] : []),
    t("debt"),
    t("oldestDue"),
    t("overdueDays"),
    t("bucket"),
    t("lastPayment"),
    t("lastPaymentAmount"),
  ];
  sheet.addRow(head).font = { bold: true };
  const debtCol = head.indexOf(t("debt")) + 1;
  for (const d of rows) {
    const row = sheet.addRow([
      d.name,
      d.phone ?? "",
      d.guardianName ?? "",
      d.guardianPhone ?? "",
      d.groups.join(", "),
      ...(branches.length > 1 ? [branchName.get(d.branchId) ?? ""] : []),
      toSheetAmount(d.debt),
      d.oldestDueDate ? dateFormat.format(dayAsDate(d.oldestDueDate)) : "",
      d.daysOverdue,
      t(`buckets.${d.bucket}`),
      d.lastPayment ? paidFormat.format(new Date(d.lastPayment.paidAt)) : "",
      d.lastPayment ? toSheetAmount(d.lastPayment.amount) : "",
    ]);
    row.getCell(debtCol).numFmt = moneyFormat;
    row.getCell(head.length).numFmt = moneyFormat;
  }
  sheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 28 : 18;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const file = Buffer.from(await book.xlsx.writeBuffer());
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="debtors.xlsx"; filename*=UTF-8''${encodeURIComponent(`${t("fileName")}.xlsx`)}`,
    },
  });
}
