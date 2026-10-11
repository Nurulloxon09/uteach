"use client";

import { isAttendanceStatus, type AttendanceStatus } from "@uteach/core";
import { CheckCheck, CloudOff, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  AttendanceRow,
  MobileList,
  StatusChip,
  type AttendanceRowValue,
} from "@/components/patterns";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attendanceOptions } from "@/lib/attendance";
import { saveAttendanceAction } from "../actions";

export type SheetRow = {
  studentId: string;
  name: string;
  isExpected: boolean;
  status: AttendanceStatus | null;
  lateMinutes: number | null;
  note: string | null;
};

type Marks = Record<string, AttendanceRowValue>;
type Draft = { version: string; marks: Marks; topic: string };
type Phase =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "retrying"; attempt: number }
  | { kind: "offline" };

const ATTEMPTS = 3;
const draftKey = (lessonId: string) => `uteach:attendance:${lessonId}`;

function readDraftRaw(lessonId: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(lessonId));
  } catch {
    return null;
  }
}

function parseDraft(raw: string | null, version: string): Draft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Draft;
    return draft.version === version ? draft : null;
  } catch {
    return null;
  }
}

const noSubscription = () => () => {};

function writeDraft(lessonId: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(lessonId), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(lessonId));
  } catch {
    // Private mode or storage full: the sheet still works, only without a draft.
  }
}

const toValue = (r: SheetRow): AttendanceRowValue => ({
  status: r.status,
  lateMinutes: r.lateMinutes === null ? "" : String(r.lateMinutes),
  note: r.note ?? "",
});

const sameMarks = (a: Marks, b: Marks) =>
  Object.keys(a).every(
    (id) =>
      a[id]?.status === b[id]?.status &&
      a[id]?.note === b[id]?.note &&
      (a[id]?.status !== "late" || a[id]?.lateMinutes === b[id]?.lateMinutes),
  );

function lateMinutes(value: string): number | null {
  const n = Number(value);
  return value !== "" && Number.isInteger(n) && n >= 1 && n <= 240 ? n : null;
}

/**
 * The teacher's attendance sheet (14): one-tap marks, "All present", then Save sends every mark in one
 * request. Marks live in the browser until saved (a draft survives a reload), and a save that fails on the
 * network is retried. The page remounts the sheet (`key`) when the saved state changes.
 */
export function AttendanceSheet({
  lessonId,
  rows,
  topic: savedTopic,
  editable,
  version,
}: {
  lessonId: string;
  rows: SheetRow[];
  topic: string;
  editable: boolean;
  /** Changes whenever the saved marks or topic change (drafts based on another version are dropped). */
  version: string;
}) {
  const t = useTranslations("attendance");
  const te = useTranslations("errors");
  const saved = useMemo<Marks>(
    () => Object.fromEntries(rows.map((r) => [r.studentId, toValue(r)])),
    [rows],
  );
  // A draft of this same version survives a reload (e.g. the phone lost the page before Save). Read from
  // browser storage after hydration; the server renders without it.
  const rawDraft = useSyncExternalStore(
    noSubscription,
    () => (editable ? readDraftRaw(lessonId) : null),
    () => null,
  );
  const draft = useMemo(() => parseDraft(rawDraft, version), [rawDraft, version]);
  const [edited, setEdited] = useState<{ marks: Marks; topic: string } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = useRef(false);

  const { marks, topic } =
    edited ??
    (draft
      ? { marks: { ...saved, ...draft.marks }, topic: draft.topic }
      : { marks: saved, topic: savedTopic });
  const setMarks = (next: Marks) => setEdited({ marks: next, topic });
  const setTopic = (next: string) => setEdited({ marks, topic: next });
  const restored = draft !== null;

  const dirty = !sameMarks(marks, saved) || topic.trim() !== savedTopic.trim();
  useEffect(() => {
    if (!editable) return;
    if (rawDraft && !draft)
      writeDraft(lessonId, null); // a draft of an older version
    else writeDraft(lessonId, dirty ? { version, marks, topic } : null);
  }, [editable, dirty, draft, rawDraft, lessonId, marks, topic, version]);

  const total = rows.length;
  const marked = Object.values(marks).filter((m) => m.status).length;
  const unmarked = total - marked;
  const options = attendanceOptions(
    (s) => t(`statusShort.${s}`),
    (s) => t(`status.${s}`),
  );

  const markRest = () =>
    setMarks(
      Object.fromEntries(
        Object.entries(marks).map(([id, v]) => [id, v.status ? v : { ...v, status: "present" }]),
      ),
    );

  async function save() {
    if (busy.current) return;
    busy.current = true;
    const payload = {
      lessonId,
      rows: Object.entries(marks).flatMap(([studentId, v]) =>
        isAttendanceStatus(v.status)
          ? [
              {
                studentId,
                status: v.status,
                lateMinutes: v.status === "late" ? lateMinutes(v.lateMinutes) : null,
                note: v.note,
              },
            ]
          : [],
      ),
      topic: topic.trim() !== savedTopic.trim() ? topic.trim() : null,
    };
    setPhase({ kind: "saving" });
    try {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          const result = await saveAttendanceAction(payload);
          if (result.ok) {
            writeDraft(lessonId, null);
            setPhase({ kind: "idle" });
            toast.success(t("savedToast", { alerts: result.alerts }));
          } else {
            setPhase({ kind: "idle" });
            toast.error(te(result.error as never));
          }
          return;
        } catch {
          // The request never got an answer (poor connection): wait a little and send it again.
          if (attempt === ATTEMPTS) break;
          setPhase({ kind: "retrying", attempt: attempt + 1 });
          await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        }
      }
      setPhase({ kind: "offline" });
    } finally {
      busy.current = false;
    }
  }

  const saving = phase.kind === "saving" || phase.kind === "retrying";

  return (
    <div className="space-y-4" data-testid="attendance-sheet">
      {restored ? <Alert>{t("draftRestored")}</Alert> : null}

      <div className="space-y-2 rounded-2xl bg-card p-4 shadow-card">
        <Label htmlFor="attendance-topic" className="text-[15px] text-secondary-foreground">
          {t("topic")}
        </Label>
        <Input
          id="attendance-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t("topicPlaceholder")}
          maxLength={500}
          disabled={!editable}
        />
      </div>

      {editable && unmarked > 0 ? (
        <Button
          type="button"
          variant="outline-primary"
          className="h-12 w-full text-[15px]"
          onClick={markRest}
          data-testid="all-present"
        >
          <CheckCheck />
          {marked === 0 ? t("allPresent") : t("restPresent")}
        </Button>
      ) : null}

      <MobileList>
        {rows.map((r) => (
          <AttendanceRow
            key={r.studentId}
            testId="attendance-row"
            name={r.name}
            value={marks[r.studentId] ?? toValue(r)}
            onChange={(v) => setMarks({ ...marks, [r.studentId]: v })}
            options={options}
            legend={t("legend", { name: r.name })}
            labels={{
              lateMinutes: t("lateMinutes"),
              minutesShort: t("minutesShort"),
              note: t("note"),
              addNote: t("addNote", { name: r.name }),
              notePlaceholder: t("notePlaceholder"),
            }}
            badge={
              r.isExpected ? undefined : <StatusChip tone="muted">{t("notExpected")}</StatusChip>
            }
            disabled={!editable}
          />
        ))}
      </MobileList>

      {editable ? (
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl bg-card p-3 pl-4 shadow-shell">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {phase.kind === "retrying" ? (
              <p className="text-warning">
                {t("retrying", { attempt: phase.attempt, total: ATTEMPTS })}
              </p>
            ) : phase.kind === "offline" ? (
              <p className="flex items-center gap-2 text-destructive">
                <CloudOff className="size-4 shrink-0" />
                {t("offline")}
              </p>
            ) : (
              <>
                <p className="font-semibold text-foreground" data-testid="attendance-counter">
                  {t("counter", { marked, total })}
                </p>
                {dirty && !saving ? <p className="text-muted-foreground">{t("unsaved")}</p> : null}
              </>
            )}
          </div>
          <Button
            type="button"
            className="h-12 px-7"
            onClick={save}
            disabled={saving || (!dirty && phase.kind !== "offline") || marked === 0}
            data-testid="attendance-save"
          >
            {saving ? <LoaderCircle className="animate-spin" /> : null}
            {saving ? t("saving") : phase.kind === "offline" ? t("retry") : t("save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
