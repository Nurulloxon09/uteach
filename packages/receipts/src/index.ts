/**
 * Payment receipts as PDF (docs/spec/15-payments-debts.md): an 80 mm thermal layout and an A4 layout.
 * The caller formats every text (dates, money, labels) in the recipient's language, so the same renderer serves
 * the web app now and the Telegram worker in M4.
 */
export { renderReceipt, type ReceiptSize, type ReceiptView } from "./receipt";
