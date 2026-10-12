import "server-only";
import { intlLocale, isLocale } from "@uteach/i18n";
import { renderReceipt, type ReceiptSize, type ReceiptView } from "@uteach/receipts";
import { getTranslations } from "next-intl/server";
import { loadAccounts, loadStaffNames } from "@/lib/billing";
import { getCenterContext } from "@/lib/center";
import { formatMinor } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { uuidField } from "@/lib/validation";

/**
 * A payment's receipt as PDF (15, M3 plan): rendered on demand from the payment row, so a voided payment
 * prints "VOID". `?size=80mm` (thermal, default) or `a4`. The user's session reads the row, so only staff with
 * `billing` or `payments` in the student's branch get it (RLS); everyone else gets 404.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/[locale]/receipts/[paymentId]">,
) {
  const { locale, paymentId } = await params;
  if (!isLocale(locale) || !uuidField.safeParse(paymentId).success) {
    return new Response(null, { status: 404 });
  }
  const size: ReceiptSize = new URL(request.url).searchParams.get("size") === "a4" ? "a4" : "80mm";
  const ctx = await getCenterContext();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select(
      "id, amount, method, paid_at, receipt_no, payer_name, note, received_by, account_id, voided_at, void_reason, students ( full_name ), branches ( name, address, phone, timezone )",
    )
    .eq("id", paymentId)
    .eq("center_id", ctx.center.id)
    .maybeSingle();
  if (!payment) return new Response(null, { status: 404 });

  const [t, tm, accounts, staff, { data: center }] = await Promise.all([
    getTranslations({ locale, namespace: "billing.receipt" }),
    getTranslations({ locale, namespace: "billing.methods" }),
    loadAccounts(ctx),
    loadStaffNames(ctx),
    supabase.from("centers").select("name, logo_path").eq("id", ctx.center.id).single(),
  ]);

  const branch = payment.branches;
  const tz = branch?.timezone ?? ctx.center.timezone;
  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  }).format(new Date(payment.paid_at));
  const receivedBy = payment.received_by ? staff.get(payment.received_by) : undefined;

  const view: ReceiptView = {
    centerName: center?.name ?? ctx.center.name,
    logo: center?.logo_path ? await loadLogo(supabase, center.logo_path) : null,
    branchLine: [branch?.name, branch?.address, branch?.phone].filter(Boolean).join(" · "),
    title: t("title"),
    receiptNo: payment.receipt_no,
    rows: [
      { label: t("date"), value: when },
      { label: t("student"), value: payment.students?.full_name ?? "—" },
      ...(payment.payer_name ? [{ label: t("payer"), value: payment.payer_name }] : []),
      { label: t("method"), value: tm(payment.method) },
      {
        label: t("account"),
        value: accounts.find((a) => a.id === payment.account_id)?.label ?? "—",
      },
      ...(receivedBy ? [{ label: t("receivedBy"), value: receivedBy }] : []),
      ...(payment.note ? [{ label: t("note"), value: payment.note }] : []),
    ],
    amountLabel: t("amount"),
    amount: formatMinor(payment.amount, ctx.center.currency, locale),
    footer: t("footer"),
    voidNote: payment.voided_at ? t("void", { reason: payment.void_reason ?? "" }) : null,
  };

  const pdf = await renderReceipt(view, size);
  const name = `${payment.receipt_no}${size === "a4" ? "-a4" : ""}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** The center logo from `center-assets` as PNG/JPEG bytes; other formats (SVG, WebP) are left out. */
async function loadLogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<ReceiptView["logo"]> {
  const ext = path.split(".").pop()?.toLowerCase();
  const format = ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpg" : null;
  if (!format) return null;
  const { data } = await supabase.storage.from("center-assets").download(path);
  if (!data) return null;
  return { data: Buffer.from(await data.arrayBuffer()), format };
}
