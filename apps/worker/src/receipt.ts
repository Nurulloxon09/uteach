import { formatMoney, intlLocale, type Locale } from "@uteach/i18n";
import { renderReceipt, type ReceiptView } from "@uteach/receipts";
import type { ReceiptData } from "./db";
import { translator } from "./i18n";

/**
 * A payment's receipt PDF for Telegram (15, 17): the same renderer and labels as the web app's receipt route.
 * Telegram receipts leave out the logo, the account and who received the money.
 */
export function receiptView(data: ReceiptData, locale: Locale): ReceiptView {
  const t = translator(locale);
  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: data.timezone,
  }).format(new Date(data.paidAt));
  return {
    centerName: data.centerName,
    logo: null,
    branchLine: [data.branchName, data.branchAddress, data.branchPhone].filter(Boolean).join(" · "),
    title: t("billing.receipt.title"),
    receiptNo: data.receiptNo,
    rows: [
      { label: t("billing.receipt.date"), value: when },
      { label: t("billing.receipt.student"), value: data.student },
      ...(data.payerName ? [{ label: t("billing.receipt.payer"), value: data.payerName }] : []),
      { label: t("billing.receipt.method"), value: t(`billing.methods.${data.method}`) },
    ],
    amountLabel: t("billing.receipt.amount"),
    amount: formatMoney(BigInt(data.amount), data.currency, locale),
    footer: t("billing.receipt.footer"),
    voidNote: data.voided ? t("billing.receipt.void", { reason: data.voidReason ?? "" }) : null,
  };
}

export async function receiptPdf(data: ReceiptData, locale: Locale): Promise<Buffer> {
  return renderReceipt(receiptView(data, locale), "80mm");
}
