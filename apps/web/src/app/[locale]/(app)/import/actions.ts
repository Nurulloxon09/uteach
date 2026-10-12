"use server";

import { IMPORT_FIELDS, cellText, guessMapping, type ImportKind } from "@uteach/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorKey } from "@/lib/actions";
import { getCenterContext } from "@/lib/center";
import { loadImportContext } from "@/lib/import/context";
import { allHeaderLabels } from "@/lib/import/labels";
import { MAX_IMPORT_ROWS, readSheet, type Sheet } from "@/lib/import/read";
import { validateImport, type ImportIssue, type Mapping } from "@/lib/import/validate";
import { createClient } from "@/lib/supabase/server";

/**
 * Excel import (10-platform-onboarding): start a job → the browser uploads the file to Storage → analyze
 * (headers, guessed mapping) → check (validation, nothing written) → import (one all-or-nothing RPC).
 * Results carry i18n keys under `import.errors` / `errors`.
 */

type Fail = { ok: false; error: string };
const KINDS = ["students", "groups", "enrollments", "opening_balances"] as const;
const kindField = z.enum(KINDS);

export async function startImportAction(
  kind: ImportKind,
  fileName: string,
): Promise<{ ok: true; jobId: string; path: string } | Fail> {
  const ctx = await getCenterContext();
  if (!kindField.safeParse(kind).success) return { ok: false, error: "import.errors.invalid" };
  if (kind === "opening_balances" && !(ctx.can.billing && ctx.can.adjustments))
    return { ok: false, error: "errors.db.forbidden" };
  const ext = /\.(xlsx|csv)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (!ext) return { ok: false, error: "import.errors.fileType" };

  const path = `${ctx.center.id}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({ center_id: ctx.center.id, kind, file_path: path })
    .select("id")
    .single();
  if (error) return { ok: false, error: `errors.${dbErrorKey(error)}` };
  return { ok: true, jobId: data.id, path };
}

async function loadJob(jobId: string) {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, kind, file_path, status, column_mapping")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;
  const { data: file } = await supabase.storage.from("imports").download(job.file_path);
  if (!file) return { job, sheet: null };
  try {
    return { job, sheet: await readSheet(await file.arrayBuffer(), job.file_path) };
  } catch {
    return { job, sheet: null };
  }
}

export type Analysis = {
  ok: true;
  kind: ImportKind;
  headers: string[];
  sample: string[][];
  mapping: Mapping;
  rowCount: number;
};

/** Reads the uploaded file's header row and guesses which column is which field. */
export async function analyzeImportAction(jobId: string): Promise<Analysis | Fail> {
  const loaded = await loadJob(jobId);
  if (!loaded) return { ok: false, error: "errors.db.not_found" };
  if (!loaded.sheet) return { ok: false, error: "import.errors.unreadable" };
  const { job, sheet } = loaded;
  if (sheet.rows.length > MAX_IMPORT_ROWS) return { ok: false, error: "import.errors.tooMany" };
  const kind = job.kind as ImportKind;

  const mapping = guessMapping(sheet.headers, allHeaderLabels(kind), IMPORT_FIELDS[kind]);
  const supabase = await createClient();
  await supabase
    .from("import_jobs")
    .update({ column_mapping: mapping, row_count: sheet.rows.length })
    .eq("id", jobId);

  return {
    ok: true,
    kind,
    headers: sheet.headers,
    sample: sheet.rows.slice(0, 3).map((r) => sheet.headers.map((_, i) => cellText(r.cells[i]))),
    mapping,
    rowCount: sheet.rows.length,
  };
}

export type CheckResult = {
  ok: true;
  rows: number;
  create: number;
  skip: number;
  issueCount: number;
  /** The first issues, for the preview. */
  issues: ImportIssue[];
};

const mappingSchema = z.record(z.string(), z.number().int().min(0).max(500).nullable());

async function validateJob(jobId: string, mapping: Mapping) {
  const ctx = await getCenterContext();
  const loaded = await loadJob(jobId);
  if (!loaded) return { error: "errors.db.not_found" } as const;
  if (!loaded.sheet) return { error: "import.errors.unreadable" } as const;
  const kind = loaded.job.kind as ImportKind;
  const result = validateImport(
    kind,
    loaded.sheet as Sheet,
    mapping,
    await loadImportContext(ctx, kind),
  );
  return { kind, result } as const;
}

/** Validates every row with the chosen mapping. Writes nothing but the job's status and errors. */
export async function checkImportAction(
  jobId: string,
  mapping: Mapping,
): Promise<CheckResult | Fail> {
  const parsed = mappingSchema.safeParse(mapping);
  if (!parsed.success) return { ok: false, error: "import.errors.invalid" };
  const validated = await validateJob(jobId, parsed.data);
  if ("error" in validated) return { ok: false, error: validated.error ?? "import.errors.invalid" };
  const { result } = validated;

  const supabase = await createClient();
  await supabase
    .from("import_jobs")
    .update({
      column_mapping: parsed.data,
      status: result.issues.length ? "failed" : "validated",
      row_count: result.rows,
      error_count: result.issues.length,
      errors: result.issues.slice(0, 500),
    })
    .eq("id", jobId);

  return {
    ok: true,
    rows: result.rows,
    create: result.create,
    skip: result.skip,
    issueCount: result.issues.length,
    issues: result.issues.slice(0, 100),
  };
}

/** Re-validates and imports in one transaction; any problem imports nothing. */
export async function runImportAction(
  jobId: string,
): Promise<{ ok: true; created: number; skipped: number } | Fail> {
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .select("column_mapping")
    .eq("id", jobId)
    .maybeSingle();
  const parsed = mappingSchema.safeParse(job?.column_mapping ?? {});
  if (!parsed.success) return { ok: false, error: "import.errors.invalid" };
  const validated = await validateJob(jobId, parsed.data);
  if ("error" in validated) return { ok: false, error: validated.error ?? "import.errors.invalid" };
  if (validated.result.issues.length) return { ok: false, error: "import.errors.hasIssues" };

  const rpc = (
    {
      students: "import_students",
      groups: "import_groups",
      enrollments: "import_enrollments",
      opening_balances: "import_opening_balances",
    } as const
  )[validated.kind];
  const { data, error } = await supabase.rpc(rpc, {
    p_job_id: jobId,
    p_rows: validated.result.payload as never,
  });
  if (error) {
    await supabase
      .from("import_jobs")
      .update({ status: "failed", errors: [{ row: 0, field: "", code: dbErrorKey(error) }] })
      .eq("id", jobId);
    return { ok: false, error: `errors.${dbErrorKey(error)}` };
  }

  revalidatePath("/[locale]/students", "page");
  revalidatePath("/[locale]/groups", "layout");
  if (validated.kind === "opening_balances") revalidatePath("/[locale]/debtors", "page");
  const counts = (data ?? {}) as { created?: number; skipped?: number };
  return { ok: true, created: counts.created ?? 0, skipped: counts.skipped ?? 0 };
}
