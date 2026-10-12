import "server-only";
import { intlLocale, isLocale } from "@uteach/i18n";
import { todayIn } from "@uteach/core";
import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";
import { getCenterContext } from "@/lib/center";
import { dayAsDate, hhmm } from "@/lib/dates";
import { loadMatrix, monthParam } from "@/lib/attendance-matrix";
import { createClient } from "@/lib/supabase/server";
import { uuidField } from "@/lib/validation";

/**
 * The group's attendance matrix for one month as .xlsx (14): the same cells and rate as the screen, labels in
 * the user's language. Uses the user's session, so teachers export only their own groups.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/[locale]/groups/[groupId]/attendance/export">,
) {
  const { locale, groupId } = await params;
  if (!isLocale(locale) || !uuidField.safeParse(groupId).success) {
    return new Response(null, { status: 404 });
  }
  const ctx = await getCenterContext();
  const supabase = await createClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, branch_id, branches ( timezone )")
    .eq("id", groupId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!group) return new Response(null, { status: 404 });

  const tz = group.branches?.timezone ?? ctx.center.timezone;
  const month = monthParam(new URL(request.url).searchParams.get("month"), todayIn(tz).slice(0, 7));
  const matrix = await loadMatrix(supabase, group.id, month, tz);
  if (!matrix) return new Response(null, { status: 404 });

  const t = await getTranslations({ locale, namespace: "attendance" });
  const intl = intlLocale(locale);
  const dayFormat = new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const weekdayFormat = new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat(intl, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(t("title").slice(0, 31));
  sheet.addRow([`${group.name} · ${monthFormat.format(dayAsDate(`${month}-01`))}`]);
  sheet.getRow(1).font = { bold: true, size: 13 };
  const head = [
    t("matrix.student"),
    ...matrix.lessons.map((l) => dayFormat.format(dayAsDate(l.date))),
    t("status.present"),
    t("status.late"),
    t("status.absent"),
    t("status.excused"),
    t("matrix.rate"),
  ];
  const sub = [
    "",
    ...matrix.lessons.map((l) =>
      l.cancelled
        ? t("matrix.cancelled")
        : `${weekdayFormat.format(dayAsDate(l.date))} ${hhmm(l.startMinutes)}`,
    ),
  ];
  sheet.addRow(head).font = { bold: true };
  sheet.addRow(sub).font = { italic: true };

  for (const s of matrix.students) {
    const cells = matrix.lessons.map((l) => {
      const cell = s.cells[l.id];
      if (cell?.status) return t(`letter.${cell.status}`);
      if (cell?.state === "frozen" && !l.cancelled) return t("letter.frozen");
      return "";
    });
    const row = sheet.addRow([
      s.name,
      ...cells,
      s.counts.present,
      s.counts.late,
      s.counts.absent,
      s.counts.excused,
      s.rateBp === null ? "" : s.rateBp / 10000,
    ]);
    row.getCell(head.length).numFmt = "0%";
  }
  sheet.getColumn(1).width = 28;
  for (let i = 2; i <= matrix.lessons.length + 1; i++) {
    sheet.getColumn(i).width = 8;
    sheet.getColumn(i).alignment = { horizontal: "center" };
  }
  sheet.addRow([]);
  sheet.addRow([t("matrix.rateHint")]).font = { italic: true };

  const file = Buffer.from(await book.xlsx.writeBuffer());
  const safe = group.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "group";
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${safe}-${month}.xlsx`)}`,
    },
  });
}
