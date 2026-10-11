import { IMPORT_FIELDS, type ImportKind } from "@uteach/core";
import { isLocale } from "@uteach/i18n";
import { getTranslations } from "next-intl/server";
import { templateHeaders } from "@/lib/import/labels";
import { templateWorkbook } from "@/lib/import/read";

const KINDS: ImportKind[] = ["students", "groups", "enrollments"];

/** The template file of an import kind: headers in the user's language, plus a sheet of filling hints. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/[locale]/import/template/[kind]">,
) {
  const { locale, kind } = await params;
  if (!isLocale(locale) || !KINDS.includes(kind as ImportKind))
    return new Response(null, { status: 404 });
  const k = kind as ImportKind;
  const t = await getTranslations({ locale, namespace: "import" });

  const headers = templateHeaders(k, locale);
  const hints = IMPORT_FIELDS[k].map(
    (field, i) => `${headers[i]}: ${t(`hints.${k}.${field}` as never)}`,
  );
  const file = await templateWorkbook(headers, {
    title: t("templateHelp"),
    lines: [t("templateIntro"), "", ...hints],
  });

  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="uteach-${k}-${locale}.xlsx"`,
    },
  });
}
