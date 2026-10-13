"use client";

import { examSectionsError, type ExamTotalRule } from "@uteach/core";
import { Archive, ArchiveRestore, Pencil, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  ConfirmDialog,
  Field,
  FormDialog,
  PageAction,
  RowActions,
  SelectField,
} from "@/components/patterns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions";
import {
  archiveExamTypeAction,
  createExamTypeAction,
  updateExamTypeAction,
} from "../../exams/actions";

type SectionDraft = { name: string; min: string; max: string; step: string };
export type ExamTypeFormValues = {
  id: string;
  name: string;
  totalRule: ExamTotalRule;
  sections: { name: string; min: number; max: number; step: number }[];
  inUse: boolean;
};

const RULES = ["sum", "average", "none"] as const;
const blank: SectionDraft = { name: "", min: "0", max: "100", step: "1" };

/** Sections as typed → what the action expects (numbers), or null while something isn't a number. */
function toSections(drafts: SectionDraft[]) {
  const out = drafts.map((d) => ({
    name: d.name.trim(),
    min: Number(d.min.replace(",", ".")),
    max: Number(d.max.replace(",", ".")),
    step: Number(d.step.replace(",", ".")),
  }));
  return out.every((s) => s.name && [s.min, s.max, s.step].every((n) => Number.isFinite(n)))
    ? out
    : null;
}

function ExamTypeFields({ state, type }: { state: ActionState; type?: ExamTypeFormValues }) {
  const t = useTranslations("exams.types");
  const te = useTranslations("errors");
  const locked = type?.inUse ?? false;
  const [rule, setRule] = useState<string>(type?.totalRule ?? "sum");
  const [drafts, setDrafts] = useState<SectionDraft[]>(
    type?.sections.map((s) => ({
      name: s.name,
      min: String(s.min),
      max: String(s.max),
      step: String(s.step),
    })) ?? [{ ...blank }],
  );
  const sections = toSections(drafts);
  const problem =
    sections === null
      ? "section_decimals"
      : examSectionsError(
          sections.map((s, i) => ({
            key: `s${i + 1}`,
            label: { uz: s.name, ru: s.name, en: s.name },
            min: s.min,
            max: s.max,
            step: s.step,
          })),
          rule as ExamTotalRule,
        );
  const set = (i: number, patch: Partial<SectionDraft>) =>
    setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <>
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      {locked ? null : (
        <input type="hidden" name="sections" value={JSON.stringify(sections ?? [])} />
      )}
      <Field name="name" label={t("name")} defaultValue={type?.name} state={state} required />
      {locked ? (
        <>
          <input type="hidden" name="totalRule" value={rule} />
          <Alert>
            <AlertDescription>{t("inUse")}</AlertDescription>
          </Alert>
        </>
      ) : (
        <SelectField
          name="totalRule"
          label={t("rule")}
          state={state}
          value={rule}
          onValueChange={setRule}
          options={RULES.map((r) => ({ value: r, label: t(`rules.${r}`) }))}
        />
      )}
      <fieldset className="space-y-2" disabled={locked}>
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem_2.5rem] gap-2 text-sm font-medium text-foreground">
          <span>{t("sectionName")}</span>
          <span>{t("min")}</span>
          <span>{t("max")}</span>
          <span>{t("step")}</span>
          <span />
        </div>
        {drafts.map((d, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem_2.5rem] gap-2"
            data-testid="section-row"
          >
            <Input
              aria-label={`${t("sectionName")} ${i + 1}`}
              value={d.name}
              maxLength={40}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <Input
              aria-label={`${t("min")} ${i + 1}`}
              inputMode="decimal"
              value={d.min}
              onChange={(e) => set(i, { min: e.target.value })}
            />
            <Input
              aria-label={`${t("max")} ${i + 1}`}
              inputMode="decimal"
              value={d.max}
              onChange={(e) => set(i, { max: e.target.value })}
            />
            <Input
              aria-label={`${t("step")} ${i + 1}`}
              inputMode="decimal"
              value={d.step}
              onChange={(e) => set(i, { step: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("removeSection", { name: d.name || String(i + 1) })}
              disabled={drafts.length === 1}
              onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        {locked || drafts.length >= 8 ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDrafts((all) => [...all, { ...blank }])}
          >
            <Plus />
            {t("addSection")}
          </Button>
        )}
      </fieldset>
      {!locked && problem && drafts.some((d) => d.name.trim()) ? (
        <p className="text-sm text-destructive">{te("db.invalid_exam_type")}</p>
      ) : null}
    </>
  );
}

export function AddExamTypeDialog() {
  const t = useTranslations("exams.types");
  return (
    <FormDialog
      trigger={<PageAction>{t("addButton")}</PageAction>}
      title={t("addTitle")}
      action={createExamTypeAction}
      submitLabel={t("addButton")}
      successToast={t("added")}
      testId="exam-type-dialog"
    >
      {(state) => <ExamTypeFields state={state} />}
    </FormDialog>
  );
}

/** Edit, archive or restore a center's own type. */
export function ExamTypeRowActions({
  type,
  archived,
}: {
  type: ExamTypeFormValues;
  archived: boolean;
}) {
  const t = useTranslations("exams.types");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  return (
    <>
      <RowActions
        actions={[
          { key: "edit", label: tc("edit"), icon: Pencil, onSelect: () => setEditing(true) },
          {
            key: "archive",
            label: archived ? tc("restore") : tc("archive"),
            icon: archived ? ArchiveRestore : Archive,
            tone: archived ? "default" : "destructive",
            onSelect: () => setArchiving(true),
          },
        ]}
      />
      <FormDialog
        open={editing}
        onOpenChange={setEditing}
        title={t("editTitle")}
        action={updateExamTypeAction}
        submitLabel={tc("save")}
        successToast={tc("saved")}
      >
        {(state) => <ExamTypeFields state={state} type={type} />}
      </FormDialog>
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={
          archived ? t("restoreTitle", { name: type.name }) : t("archiveTitle", { name: type.name })
        }
        description={archived ? undefined : t("archiveHint")}
        confirmLabel={archived ? tc("restore") : tc("archive")}
        tone={archived ? "default" : "destructive"}
        action={archiveExamTypeAction}
        fields={{ id: type.id, restore: archived ? "1" : "0" }}
        successToast={archived ? tc("restored") : tc("archivedToast")}
      />
    </>
  );
}
