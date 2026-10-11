import "server-only";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { cellText } from "@uteach/core";

export type Sheet = {
  headers: string[];
  /** Data rows (cells as exceljs gives them), with their 1-based row number in the file. */
  rows: { number: number; cells: unknown[] }[];
};

/** Files bigger than this are refused (a center's whole student list fits easily). */
export const MAX_IMPORT_ROWS = 5000;

/**
 * Reads the first worksheet of an .xlsx or .csv file. The first non-empty row is the header row; empty rows
 * are skipped.
 */
export async function readSheet(bytes: ArrayBuffer, fileName: string): Promise<Sheet> {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    await workbook.csv.read(Readable.from(Buffer.from(bytes)));
  } else {
    await workbook.xlsx.load(bytes);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  let headers: string[] | null = null;
  const rows: Sheet["rows"] = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    // row.values is 1-based (index 0 is empty).
    const cells = (Array.isArray(row.values) ? row.values.slice(1) : []) as unknown[];
    if (cells.every((c) => cellText(c) === "")) return;
    if (!headers) {
      headers = cells.map((c) => cellText(c));
      return;
    }
    rows.push({ number, cells });
  });
  return { headers: headers ?? [], rows };
}

/** A new workbook with one header row (the template file of an import kind). */
export async function templateWorkbook(
  headers: string[],
  notes: { title: string; lines: string[] },
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = headers.map((h) => ({ width: Math.max(14, h.length + 4) }));
  const help = workbook.addWorksheet(notes.title);
  for (const line of notes.lines) help.addRow([line]);
  help.getColumn(1).width = 100;
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
