"use client";

import { formatScore, parseScore, type ExamSection, type ExamTotalRule } from "@uteach/core";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  ScoreGrid,
  scoreCellError,
  Section,
  SegmentedControl,
  type ScoreGridValues,
} from "@/components/patterns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { saveGroupScoresAction } from "../../../exams/actions";

type TypeOption = {
  id: string;
  name: string;
  sections: ExamSection[];
  totalRule: ExamTotalRule;
};

const asText = (scores: Record<string, number> | undefined, sections: ExamSection[]) =>
  Object.fromEntries(
    sections.map((s) => [s.key, scores?.[s.key] === undefined ? "" : String(scores[s.key])]),
  );

/** The toolbar (exam, kind, day → URL) and the grid with one Save for the whole group. */
export function ScoreEntry({
  groupId,
  types,
  examTypeId,
  kind,
  date,
  today,
  rows,
  saved,
  hasSaved,
}: {
  groupId: string;
  types: TypeOption[];
  examTypeId: string;
  kind: "diagnostic" | "mock";
  date: string;
  today: string;
  rows: { id: string; name: string }[];
  saved: Record<string, Record<string, number>>;
  hasSaved: boolean;
}) {
  const t = useTranslations("exams");
  const te = useTranslations("errors");
  const locale = useLocale() as "uz" | "ru" | "en";
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const type = types.find((x) => x.id === examTypeId)!;

  const initial: ScoreGridValues = Object.fromEntries(
    rows.map((r) => [r.id, asText(saved[r.id], type.sections)]),
  );
  const [values, setValues] = useState<ScoreGridValues>(initial);

  const go = (next: { exam?: string; kind?: string; date?: string }) => {
    const params = new URLSearchParams({
      exam: next.exam ?? examTypeId,
      kind: next.kind ?? kind,
      date: next.date ?? date,
    });
    router.replace(`${pathname}?${params.toString()}`);
  };

  const hasErrors = rows.some((r) =>
    type.sections.some((s) => scoreCellError(s, values[r.id]?.[s.key] ?? "")),
  );

  const save = () => {
    if (hasErrors) {
      toast.error(t("enter.fixErrors"));
      return;
    }
    // Every row that has a value now or had one before (an emptied row deletes its result).
    const payload = rows.flatMap((r) => {
      const scores = Object.fromEntries(
        type.sections.map((s) => [s.key, parseScore(values[r.id]?.[s.key] ?? "")]),
      );
      const any = Object.values(scores).some((v) => v !== null);
      return any || saved[r.id] ? [{ studentId: r.id, scores }] : [];
    });
    startTransition(async () => {
      const result = await saveGroupScoresAction({
        groupId,
        examTypeId,
        kind,
        takenOn: date,
        rows: payload,
      });
      if (!result.ok) {
        toast.error(te(result.error as never));
        return;
      }
      toast.success(
        result.saved + result.deleted === 0
          ? t("enter.nothing")
          : t("enter.saved", { saved: result.saved, deleted: result.deleted }),
      );
      router.refresh();
    });
  };

  const fmt = (v: number) => formatScore(v, type.totalRule);
  const fmtNumber = (v: number) => formatScore(v, "sum");

  return (
    <Section
      title={type.name}
      description={t("enter.hint")}
      tools={
        <div className="flex w-full flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="score-exam">{t("enter.exam")}</Label>
            <Select value={examTypeId} onValueChange={(v) => go({ exam: v })}>
              <SelectTrigger id="score-exam" className="min-w-44" data-testid="score-exam">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-foreground">
              {t("enter.kindLabel")}
            </span>
            <SegmentedControl
              label={t("enter.kindLabel")}
              value={kind}
              onChange={(v) => go({ kind: v })}
              options={[
                { value: "mock", label: t("kind.mock") },
                { value: "diagnostic", label: t("kind.diagnostic") },
              ]}
              testId="score-kind"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="score-date">{t("enter.date")}</Label>
            <Input
              id="score-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && go({ date: e.target.value })}
              className="w-44"
              data-testid="score-date"
            />
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {hasSaved ? (
          <Alert>
            <AlertDescription>{t("enter.existing")}</AlertDescription>
          </Alert>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState title={t("enter.noStudents")} />
        ) : (
          <ScoreGrid
            sections={type.sections}
            totalRule={type.totalRule}
            rows={rows}
            values={values}
            onChange={(rowId, key, text) =>
              setValues((all) => ({ ...all, [rowId]: { ...all[rowId], [key]: text } }))
            }
            sectionLabel={(s) => s.label[locale] ?? s.label.en}
            formatTotal={fmt}
            disabled={pending}
            labels={{
              student: t("enter.student"),
              total: t("enter.total"),
              cell: (row, s) =>
                t("enter.cell", { student: row.name, section: s.label[locale] ?? s.label.en }),
              error: (s, error) =>
                error === "out_of_range"
                  ? t("errors.out_of_range", { min: fmtNumber(s.min), max: fmtNumber(s.max) })
                  : error === "off_step"
                    ? t("errors.off_step", { step: fmtNumber(s.step) })
                    : t(`errors.${error}`),
            }}
          />
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" size="lg" asChild>
            <Link href={`/groups/${groupId}?tab=scores&exam=${examTypeId}`}>{t("enter.back")}</Link>
          </Button>
          <Button
            size="lg"
            onClick={save}
            disabled={pending || rows.length === 0}
            data-testid="score-save"
          >
            {pending ? t("enter.saving") : t("enter.save")}
          </Button>
        </div>
      </div>
    </Section>
  );
}
