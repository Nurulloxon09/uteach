"use client";

import { formatScore, type ExamSection, type ExamTotalRule } from "@uteach/core";
import { Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import {
  ConfirmDialog,
  Field,
  FileDrop,
  FormDialog,
  PageAction,
  ScoreChart,
  SelectField,
  type ScorePoint,
  type ScoreSeries,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { deleteExamResultAction, saveOfficialResultAction, setTargetAction } from "./actions";

export type ExamTypeInfo = {
  id: string;
  name: string;
  sections: ExamSection[];
  totalRule: ExamTotalRule;
  totalMin: number;
  totalMax: number;
};

const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;

/** Picks the exam type shown on a page (`?exam=`), keeping the other search params. */
export function ExamSwitch({
  types,
  value,
  extra,
  allLabel,
}: {
  types: { id: string; name: string }[];
  value: string;
  /** Params kept in the URL, e.g. { tab: "scores" }. */
  extra?: Record<string, string>;
  /** Adds an "all" choice (value "") that drops `exam` from the URL. */
  allLabel?: string;
}) {
  const t = useTranslations("exams");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select
      value={value || "all"}
      onValueChange={(exam) =>
        router.replace(
          `${pathname}?${new URLSearchParams({ ...extra, ...(exam === "all" ? {} : { exam }) }).toString()}`,
        )
      }
    >
      <SelectTrigger
        aria-label={t("group.examLabel")}
        className="min-w-44"
        data-testid="exam-switch"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value="all">{allLabel}</SelectItem> : null}
        {types.map((x) => (
          <SelectItem key={x.id} value={x.id}>
            {x.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Target score, planned exam day and optional baseline for one student and exam type. */
export function TargetDialog({
  studentId,
  type,
  current,
  trigger,
  showBaseline = true,
}: {
  studentId: string;
  type: ExamTypeInfo;
  current?: { targetTotal: number | null; examDate: string | null; baselineTotal: number | null };
  trigger: ReactNode;
  /** Without the field the saved baseline is kept. */
  showBaseline?: boolean;
}) {
  const t = useTranslations("exams");
  const fmt = (v: number) => formatScore(v, type.totalRule);
  return (
    <FormDialog
      trigger={trigger}
      title={t("target.title", { exam: type.name })}
      description={t("target.clearHint")}
      action={setTargetAction}
      submitLabel={t("target.save")}
      successToast={t("target.saved")}
      testId="target-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="examTypeId" value={type.id} />
          <Field
            name="targetTotal"
            inputMode="decimal"
            label={t("target.total")}
            hint={t("target.totalHint", { min: fmt(type.totalMin), max: fmt(type.totalMax) })}
            defaultValue={current?.targetTotal ?? ""}
            state={state}
          />
          <Field
            name="examDate"
            type="date"
            label={t("target.examDate")}
            defaultValue={current?.examDate ?? ""}
            state={state}
          />
          {showBaseline ? (
            <Field
              name="baselineTotal"
              inputMode="decimal"
              label={t("target.baseline")}
              hint={t("target.baselineHint")}
              defaultValue={current?.baselineTotal ?? ""}
              state={state}
            />
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

/** An official result with its sections and an optional certificate (uploaded straight to storage). */
export function OfficialResultDialog({
  studentId,
  centerId,
  types,
  today,
}: {
  studentId: string;
  centerId: string;
  types: ExamTypeInfo[];
  today: string;
}) {
  const t = useTranslations("exams");
  const locale = useLocale() as "uz" | "ru" | "en";
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; path: string } | null>(null);
  const [upload, setUpload] = useState<"idle" | "busy" | "failed" | "tooBig">("idle");
  const type = types.find((x) => x.id === typeId) ?? types[0];

  async function attach(chosen: File) {
    if (chosen.size > MAX_CERTIFICATE_BYTES) {
      setUpload("tooBig");
      return;
    }
    setUpload("busy");
    const ext = (chosen.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${centerId}/certificates/${crypto.randomUUID()}.${ext || "pdf"}`;
    const { error } = await createBrowserSupabase()
      .storage.from("attachments")
      .upload(path, chosen, { upsert: false, contentType: chosen.type || undefined });
    if (error) {
      setUpload("failed");
      return;
    }
    setFile({ name: chosen.name, path });
    setUpload("idle");
  }

  if (!type) return null;
  return (
    <FormDialog
      trigger={<PageAction>{t("student.addOfficial")}</PageAction>}
      title={t("official.title")}
      action={saveOfficialResultAction}
      submitLabel={t("official.save")}
      successToast={t("official.saved")}
      testId="official-dialog"
    >
      {(state) => (
        <>
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="certificatePath" value={file?.path ?? ""} />
          <SelectField
            name="examTypeId"
            label={t("official.exam")}
            state={state}
            value={type.id}
            onValueChange={setTypeId}
            options={types.map((x) => ({ value: x.id, label: x.name }))}
          />
          <Field
            name="takenOn"
            type="date"
            max={today}
            label={t("official.date")}
            defaultValue={today}
            state={state}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            {type.sections.map((s) => (
              <Field
                key={`${type.id}-${s.key}`}
                name={`score.${s.key}`}
                inputMode="decimal"
                label={s.label[locale] ?? s.label.en}
                placeholder={`${s.min}–${s.max}`}
                state={state}
              />
            ))}
          </div>
          <div className="space-y-2">
            <FileDrop
              label={
                file
                  ? t("official.certificateChosen", { name: file.name })
                  : t("official.certificate")
              }
              hint={
                upload === "failed"
                  ? t("official.uploadFailed")
                  : upload === "tooBig"
                    ? t("official.tooBig")
                    : t("official.certificateHint")
              }
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={upload === "busy"}
              onFile={attach}
              testId="certificate-drop"
            />
          </div>
          <Field name="note" label={t("official.note")} state={state} />
        </>
      )}
    </FormDialog>
  );
}

/** Deletes one result after a confirmation. */
export function DeleteResultButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations("exams");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("student.delete")}
        onClick={() => setOpen(true)}
        data-testid="delete-result"
      >
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={t("student.deleteHint")}
        confirmLabel={tc("remove")}
        tone="destructive"
        action={deleteExamResultAction}
        fields={{ id }}
        successToast={t("student.deleted")}
      />
    </>
  );
}

/** ScoreChart with the formatting done here, so server pages pass plain data. */
export function ExamProgressChart({
  points,
  sections,
  totalRule,
  min,
  max,
  target,
  examDate,
  title,
}: {
  points: ScorePoint[];
  sections: ScoreSeries[];
  totalRule: ExamTotalRule;
  min: number;
  max: number;
  target: number | null;
  examDate: string | null;
  title: string;
}) {
  const t = useTranslations("exams.chart");
  const format = useFormatter();
  return (
    <ScoreChart
      points={points}
      sections={sections}
      min={min}
      max={max}
      target={target}
      examDate={examDate}
      format={(v) => formatScore(v, totalRule)}
      formatDate={(d) =>
        format.dateTime(new Date(`${d}T00:00:00Z`), {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        })
      }
      labels={{
        title,
        target: t("target"),
        examDate: t("examDate"),
        total: t("total"),
        sections: t("sections"),
      }}
    />
  );
}
