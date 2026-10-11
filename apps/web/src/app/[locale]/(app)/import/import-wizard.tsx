"use client";

import { REQUIRED_FIELDS, IMPORT_FIELDS, type ImportKind } from "@uteach/core";
import { CircleCheck, Download, FileWarning } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  DataTable,
  EmptyState,
  FileDrop,
  MobileRecord,
  Section,
  SegmentedControl,
  StatusChip,
  Stepper,
} from "@/components/patterns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Mapping } from "@/lib/import/validate";
import {
  analyzeImportAction,
  checkImportAction,
  runImportAction,
  startImportAction,
  type Analysis,
  type CheckResult,
} from "./actions";

const NOT_IN_FILE = "__none__";
type Stage = "pick" | "map" | "check" | "done";

/**
 * Import flow (10): pick a kind and a file (template download per kind) → map columns (auto-guessed) →
 * check (row/column problems, nothing written) → import (all or nothing).
 */
export function ImportWizard({
  initialKind,
  kinds,
}: {
  initialKind: ImportKind;
  kinds: ImportKind[];
}) {
  const t = useTranslations("import");
  const tAll = useTranslations();
  const locale = useLocale();
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [stage, setStage] = useState<Stage>("pick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null);

  const fieldLabel = (field: string) => (field ? t(`fields.${kind}.${field}` as never) : "—");
  const reset = () => {
    setStage("pick");
    setError(null);
    setAnalysis(null);
    setCheck(null);
    setDone(null);
  };

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const started = await startImportAction(kind, file.name);
      if (!started.ok) return setError(started.error);
      const { error: uploadError } = await createBrowserSupabase()
        .storage.from("imports")
        .upload(started.path, file, { upsert: false });
      if (uploadError) return setError("import.errors.upload");
      const analyzed = await analyzeImportAction(started.jobId);
      if (!analyzed.ok) return setError(analyzed.error);
      setJobId(started.jobId);
      setAnalysis(analyzed);
      setMapping(analyzed.mapping);
      setStage("map");
    } finally {
      setBusy(false);
    }
  }

  async function runCheck() {
    setBusy(true);
    setError(null);
    try {
      const result = await checkImportAction(jobId, mapping);
      if (!result.ok) return setError(result.error);
      setCheck(result);
      setStage("check");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      const result = await runImportAction(jobId);
      if (!result.ok) return setError(result.error);
      setDone({ created: result.created, skipped: result.skipped });
      setStage("done");
    } finally {
      setBusy(false);
    }
  }

  const stages: Stage[] = ["pick", "map", "check", "done"];
  const required = new Set<string>(REQUIRED_FIELDS[kind] as readonly string[]);

  return (
    <div className="space-y-5">
      <Stepper
        label={t("stepsLabel")}
        steps={stages.map((s, i) => ({
          key: s,
          label: t(`stages.${s}`),
          state: s === stage ? "current" : i < stages.indexOf(stage) ? "done" : "todo",
        }))}
      />
      {error ? (
        <Alert variant="destructive" data-testid="import-error">
          <AlertDescription>{tAll(error as never)}</AlertDescription>
        </Alert>
      ) : null}

      {stage === "pick" ? (
        <Section
          title={t("pickTitle")}
          description={t("pickHint")}
          tools={
            <SegmentedControl
              label={t("kindLabel")}
              value={kind}
              options={kinds.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
              onChange={setKind}
            />
          }
        >
          <div className="space-y-4">
            <FileDrop
              label={t("dropLabel")}
              hint={t("dropHint")}
              accept=".xlsx,.csv"
              disabled={busy}
              onFile={upload}
              testId="import-file"
            />
            <a
              href={`/${locale}/import/template/${kind}`}
              className={buttonVariants({ variant: "outline" })}
              download
            >
              <Download />
              {t("template", { kind: t(`kinds.${kind}`) })}
            </a>
          </div>
        </Section>
      ) : null}

      {stage === "map" && analysis ? (
        <Section title={t("mapTitle")} description={t("mapHint", { count: analysis.rowCount })}>
          <div className="space-y-3" data-testid="import-mapping">
            {IMPORT_FIELDS[kind].map((field) => {
              const column = mapping[field];
              const sample =
                column !== null && column !== undefined ? analysis.sample[0]?.[column] : undefined;
              const id = `map-${field}`;
              return (
                <div key={field} className="grid items-center gap-2 sm:grid-cols-[14rem_16rem_1fr]">
                  <Label htmlFor={id}>
                    {fieldLabel(field)}
                    {required.has(field) ? (
                      <span aria-hidden className="text-destructive after:content-['_*']" />
                    ) : null}
                  </Label>
                  <Select
                    value={column === null || column === undefined ? NOT_IN_FILE : String(column)}
                    onValueChange={(v) =>
                      setMapping({ ...mapping, [field]: v === NOT_IN_FILE ? null : Number(v) })
                    }
                  >
                    <SelectTrigger id={id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_IN_FILE}>{t("notInFile")}</SelectItem>
                      {analysis.headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || t("columnN", { n: i + 1 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="truncate text-sm text-muted-foreground">{sample ?? ""}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={reset}>
              {t("another")}
            </Button>
            <Button onClick={runCheck} disabled={busy}>
              {t("check")}
            </Button>
          </div>
        </Section>
      ) : null}

      {stage === "check" && check ? (
        <Section title={t("checkTitle")}>
          <div className="flex flex-wrap gap-2" data-testid="import-summary">
            <StatusChip tone="primary">{t("rows", { count: check.rows })}</StatusChip>
            <StatusChip tone="success">{t("willCreate", { count: check.create })}</StatusChip>
            <StatusChip tone="muted">{t("willSkip", { count: check.skip })}</StatusChip>
            {check.issueCount ? (
              <StatusChip tone="destructive">
                {t("problems", { count: check.issueCount })}
              </StatusChip>
            ) : null}
          </div>
          {check.issueCount ? (
            <div className="mt-5 space-y-4">
              <p className="text-[15px] text-secondary-foreground">{t("fixHint")}</p>
              <DataTable
                testId="import-issue"
                rows={check.issues}
                rowKey={(i) => `${i.row}-${i.field}-${i.code}`}
                columns={[
                  { key: "row", header: t("row"), cell: (i) => (i.row ? i.row : "—") },
                  { key: "field", header: t("column"), cell: (i) => fieldLabel(i.field) },
                  {
                    key: "problem",
                    header: t("problem"),
                    cell: (i) => t(`errors.${i.code}` as never),
                  },
                ]}
                mobileCard={(i) => (
                  <MobileRecord
                    title={t(`errors.${i.code}` as never)}
                    subtitle={`${t("row")} ${i.row || "—"} · ${fieldLabel(i.field)}`}
                  />
                )}
              />
              <div className="flex justify-end">
                <Button variant="outline" onClick={reset}>
                  {t("uploadFixed")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setStage("map")}>
                {t("back")}
              </Button>
              <Button
                onClick={runImport}
                disabled={busy || check.create === 0}
                data-testid="import-run"
              >
                {t("run", { count: check.create })}
              </Button>
            </div>
          )}
        </Section>
      ) : null}

      {stage === "done" && done ? (
        <Section>
          <EmptyState
            icon={done.created ? CircleCheck : FileWarning}
            title={t("doneTitle", { created: done.created })}
            hint={t("doneHint", { skipped: done.skipped })}
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" onClick={reset}>
                  {t("another")}
                </Button>
                <Link
                  href={kind === "groups" ? "/groups" : "/students"}
                  className={buttonVariants()}
                >
                  {t(kind === "groups" ? "openGroups" : "openStudents")}
                </Link>
              </div>
            }
          />
        </Section>
      ) : null}
    </div>
  );
}
