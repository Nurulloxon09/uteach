/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Explicit, so runners that skip this package's tsconfig (tsx from apps/worker) still use the automatic runtime.
import { fileURLToPath } from "node:url";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

export type ReceiptSize = "80mm" | "a4";

/** Everything printed on a receipt, already formatted for the reader. */
export type ReceiptView = {
  centerName: string;
  /** PNG or JPEG bytes of the center logo (other formats are left out by the caller). */
  logo?: { data: Buffer; format: "png" | "jpg" } | null;
  /** e.g. "Chilonzor · Amir Temur 12 · +998 71 200 00 00" */
  branchLine: string;
  title: string;
  receiptNo: string;
  /** Label/value rows: date, student, payer, method, account, received by … */
  rows: { label: string; value: string }[];
  amountLabel: string;
  amount: string;
  footer: string;
  /** Set when the payment was voided, e.g. "VOID · Entered twice". */
  voidNote?: string | null;
};

let fontsReady = false;

/**
 * The TTF files ship in `fonts/` and are referenced with static `new URL("…", import.meta.url)`, which Node,
 * Vitest and the Next bundler all understand (the bundler copies the files next to the server code), so nothing
 * depends on where node_modules ends up. Keep the paths literal: bundlers only follow static strings.
 */
const FONT_FILES = {
  jakarta400: new URL("../fonts/PlusJakartaSans_400Regular.ttf", import.meta.url),
  jakarta700: new URL("../fonts/PlusJakartaSans_700Bold.ttf", import.meta.url),
  jakarta800: new URL("../fonts/PlusJakartaSans_800ExtraBold.ttf", import.meta.url),
  manrope400: new URL("../fonts/Manrope_400Regular.ttf", import.meta.url),
  manrope700: new URL("../fonts/Manrope_700Bold.ttf", import.meta.url),
  manrope800: new URL("../fonts/Manrope_800ExtraBold.ttf", import.meta.url),
};
const font = (key: keyof typeof FONT_FILES) => fileURLToPath(FONT_FILES[key]);

/**
 * Plus Jakarta Sans (the app's font) with Manrope as the fallback for Cyrillic, as in the app (05-ui §3).
 * Both OFL 1.1, from Google Fonts (see fonts/README.md).
 */
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: "Jakarta",
    fonts: [
      { src: font("jakarta400"), fontWeight: 400 },
      { src: font("jakarta700"), fontWeight: 700 },
      { src: font("jakarta800"), fontWeight: 800 },
    ],
  });
  Font.register({
    family: "Manrope",
    fonts: [
      { src: font("manrope400"), fontWeight: 400 },
      { src: font("manrope700"), fontWeight: 700 },
      { src: font("manrope800"), fontWeight: 800 },
    ],
  });
  // Receipts never hyphenate names or numbers.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const MM = 72 / 25.4;
const FAMILY = ["Jakarta", "Manrope"];

/** 80 mm thermal paper: one column, the page as long as the content. */
const thermal = StyleSheet.create({
  page: { padding: 4 * MM, fontFamily: FAMILY, fontSize: 8.5, color: "#000" },
  logo: {
    width: 18 * MM,
    height: 18 * MM,
    objectFit: "contain",
    alignSelf: "center",
    marginBottom: 2 * MM,
  },
  center: { fontSize: 11, fontWeight: 800, textAlign: "center" },
  branch: { fontSize: 7.5, textAlign: "center", marginTop: 1 * MM },
  rule: {
    borderBottomWidth: 0.6,
    borderBottomColor: "#000",
    borderStyle: "dashed",
    marginVertical: 2.5 * MM,
  },
  title: { fontSize: 10, fontWeight: 700, textAlign: "center" },
  number: { fontSize: 9, textAlign: "center", marginTop: 0.8 * MM },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.2 * MM },
  label: { width: "42%" },
  value: { width: "58%", textAlign: "right", fontWeight: 700 },
  amountLabel: { fontSize: 9, textAlign: "center" },
  amount: { fontSize: 15, fontWeight: 800, textAlign: "center", marginTop: 1 * MM },
  void: {
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#000",
    padding: 1.5 * MM,
  },
  footer: { fontSize: 7.5, textAlign: "center" },
});

/** A4: the same receipt in a framed block at the top of the page. */
const sheet = StyleSheet.create({
  page: { padding: 18 * MM, fontFamily: FAMILY, fontSize: 11, color: "#1f1d2b" },
  frame: { borderWidth: 1, borderColor: "#d9d6e8", borderRadius: 6, padding: 10 * MM },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 6 * MM },
  logo: { width: 18 * MM, height: 18 * MM, objectFit: "contain", marginRight: 5 * MM },
  center: { fontSize: 18, fontWeight: 800 },
  branch: { fontSize: 10, color: "#5b5870", marginTop: 1 * MM },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  title: { fontSize: 15, fontWeight: 700 },
  number: { fontSize: 12, fontWeight: 700 },
  rule: { borderBottomWidth: 0.8, borderBottomColor: "#d9d6e8", marginVertical: 5 * MM },
  row: { flexDirection: "row", marginBottom: 2.5 * MM },
  label: { width: "35%", color: "#5b5870" },
  value: { width: "65%", fontWeight: 700 },
  amountBox: { marginTop: 4 * MM, padding: 5 * MM, backgroundColor: "#f3f0fb", borderRadius: 4 },
  amountLabel: { fontSize: 11, color: "#5b5870" },
  amount: { fontSize: 22, fontWeight: 800, marginTop: 1 * MM },
  void: {
    marginTop: 5 * MM,
    fontSize: 16,
    fontWeight: 800,
    color: "#b42318",
    borderWidth: 2,
    borderColor: "#b42318",
    padding: 3 * MM,
    textAlign: "center",
  },
  footer: { marginTop: 6 * MM, fontSize: 9, color: "#5b5870" },
});

function ThermalReceipt({ view }: { view: ReceiptView }) {
  const s = thermal;
  return (
    <>
      {view.logo ? (
        <Image src={{ data: view.logo.data, format: view.logo.format }} style={s.logo} />
      ) : null}
      <Text style={s.center}>{view.centerName}</Text>
      <Text style={s.branch}>{view.branchLine}</Text>
      <View style={s.rule} />
      <Text style={s.title}>{view.title}</Text>
      <Text style={s.number}>{view.receiptNo}</Text>
      <View style={s.rule} />
      {view.rows.map((r) => (
        <View key={r.label} style={s.row}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.value}>{r.value}</Text>
        </View>
      ))}
      <View style={s.rule} />
      <Text style={s.amountLabel}>{view.amountLabel}</Text>
      <Text style={s.amount}>{view.amount}</Text>
      {view.voidNote ? (
        <>
          <View style={s.rule} />
          <Text style={s.void}>{view.voidNote}</Text>
        </>
      ) : null}
      <View style={s.rule} />
      <Text style={s.footer}>{view.footer}</Text>
    </>
  );
}

function SheetReceipt({ view }: { view: ReceiptView }) {
  const s = sheet;
  return (
    <View style={s.frame}>
      <View style={s.head}>
        {view.logo ? (
          <Image src={{ data: view.logo.data, format: view.logo.format }} style={s.logo} />
        ) : null}
        <View>
          <Text style={s.center}>{view.centerName}</Text>
          <Text style={s.branch}>{view.branchLine}</Text>
        </View>
      </View>
      <View style={s.titleRow}>
        <Text style={s.title}>{view.title}</Text>
        <Text style={s.number}>{view.receiptNo}</Text>
      </View>
      <View style={s.rule} />
      {view.rows.map((r) => (
        <View key={r.label} style={s.row}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.value}>{r.value}</Text>
        </View>
      ))}
      <View style={s.amountBox}>
        <Text style={s.amountLabel}>{view.amountLabel}</Text>
        <Text style={s.amount}>{view.amount}</Text>
      </View>
      {view.voidNote ? <Text style={s.void}>{view.voidNote}</Text> : null}
      <Text style={s.footer}>{view.footer}</Text>
    </View>
  );
}

/** Height of the 80 mm page in points: fixed parts plus a line per row (thermal printers cut at the end). */
function thermalHeight(view: ReceiptView): number {
  return (
    (view.logo ? 22 * MM : 0) +
    62 * MM +
    view.rows.length * 5.2 * MM +
    (view.voidNote ? 14 * MM : 0)
  );
}

/**
 * Uzbek writes oʻ/gʻ with U+02BB and the apostrophe with U+02BC (the i18n catalogs do). Plus Jakarta Sans draws
 * U+02BB as a zero-width mark in PDFs, so on paper they become the look-alike ‘ and ’.
 */
function printable(text: string): string {
  return text.replace(/ʻ/g, "‘").replace(/ʼ/g, "’");
}

function printableView(view: ReceiptView): ReceiptView {
  return {
    ...view,
    centerName: printable(view.centerName),
    branchLine: printable(view.branchLine),
    title: printable(view.title),
    rows: view.rows.map((r) => ({ label: printable(r.label), value: printable(r.value) })),
    amountLabel: printable(view.amountLabel),
    amount: printable(view.amount),
    footer: printable(view.footer),
    voidNote: view.voidNote ? printable(view.voidNote) : view.voidNote,
  };
}

/** Renders a receipt to PDF bytes. */
export async function renderReceipt(input: ReceiptView, size: ReceiptSize): Promise<Buffer> {
  registerFonts();
  const view = printableView(input);
  const doc = (
    <Document title={`${view.title} ${view.receiptNo}`} author={view.centerName} creator="uteach">
      {size === "80mm" ? (
        <Page size={[80 * MM, thermalHeight(view)]} style={thermal.page}>
          <ThermalReceipt view={view} />
        </Page>
      ) : (
        <Page size="A4" style={sheet.page}>
          <SheetReceipt view={view} />
        </Page>
      )}
    </Document>
  );
  return renderToBuffer(doc);
}
