"use client";

import { canMoveLead, LEAD_STATUSES, type LeadStatus } from "@uteach/core";
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  CalendarPlus,
  CheckCircle2,
  Circle,
  GitMerge,
  ListTodo,
  NotebookPen,
  Pencil,
  PhoneCall,
  Sparkles,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  FormMessage,
  MobileCard,
  MobileList,
  SegmentedControl,
  SelectField,
  StatusChip,
  SubmitButton,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import {
  addLeadActivityAction,
  archiveLeadAction,
  cancelTrialAction,
  mergeLeadAction,
  moveLeadAction,
  setLeadTaskDoneAction,
} from "../actions";
import { EditLeadDialog, type LeadFormOptions, type LeadValues } from "../lead-dialog";
import { LostDialog, type ReasonOption } from "../lost-dialog";
import { ConvertDialog, type ConvertGroup, type PaymentSetup } from "./convert-dialog";
import { TrialDialog, type TrialLesson } from "./trial-dialog";

export type TrialSetup = {
  lessons: TrialLesson[];
  courses: { id: string; name: string }[];
  defaultCourseId: string | null;
};

export type ConvertSetup = {
  students: { id: string; name: string }[];
  groups: ConvertGroup[];
  defaultGroupId: string | null;
  canDiscount: boolean;
  payment: PaymentSetup | null;
};

/** The buttons next to the profile: edit, move, lost / reopen, archive (11). */
export function LeadActions({
  lead,
  status,
  archived,
  options,
  reasons,
  trial,
  convert,
  autoOpen,
}: {
  lead: LeadValues;
  status: LeadStatus;
  archived: boolean;
  options: LeadFormOptions;
  reasons: ReasonOption[];
  trial: TrialSetup;
  /** Null when the user can't convert (needs `students` too). */
  convert: ConvertSetup | null;
  /** `?do=trial|convert` from a board drop opens that dialog once. */
  autoOpen: "trial" | "convert" | null;
}) {
  const t = useTranslations("leads");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [lostOpen, setLostOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const open = status !== "won" && status !== "lost" && !archived;
  const [trialOpen, setTrialOpen] = useState(autoOpen === "trial" && open);
  const [convertOpen, setConvertOpen] = useState(
    autoOpen === "convert" && open && convert !== null,
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const targets = LEAD_STATUSES.filter((s) => s !== "lost" && canMoveLead(status, s));
  const move = (to: LeadStatus) =>
    startTransition(async () => {
      const result = await moveLeadAction(lead.id, to);
      if (result && !result.ok) toast.error(te((result.error ?? "generic") as never));
      else {
        toast.success(t("moved", { name: lead.fullName, status: t(`status.${to}`) }));
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap gap-2" data-testid="lead-actions">
      {open ? (
        <>
          <TrialDialog
            leadId={lead.id}
            leadName={lead.fullName}
            lessons={trial.lessons}
            courses={trial.courses}
            defaultCourseId={trial.defaultCourseId}
            open={trialOpen}
            onOpenChange={setTrialOpen}
            trigger={
              <Button variant="outline" data-testid="lead-schedule-trial">
                <CalendarPlus />
                {t("trial.button")}
              </Button>
            }
          />
        </>
      ) : null}
      {convert && (open || convertOpen) ? (
        <ConvertDialog
          leadId={lead.id}
          leadName={lead.fullName}
          leadPhone={lead.phone}
          branchId={lead.branchId}
          students={convert.students}
          groups={convert.groups}
          defaultCourseId={lead.courseId}
          defaultGroupId={convert.defaultGroupId}
          canDiscount={convert.canDiscount}
          payment={convert.payment}
          open={convertOpen}
          onOpenChange={setConvertOpen}
          trigger={
            <Button data-testid="lead-convert">
              <UserCheck />
              {t("convert.button")}
            </Button>
          }
        />
      ) : null}
      {archived ? null : (
        <>
          <EditLeadDialog
            lead={lead}
            options={options}
            trigger={
              <Button variant="outline">
                <Pencil />
                {tc("edit")}
              </Button>
            }
          />
          {targets.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={pending} data-testid="lead-move">
                  <ArrowRightLeft />
                  {status === "lost" ? t("reopen") : t("moveTo")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
                {targets.map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => move(s)}>
                    {t(`status.${s}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canMoveLead(status, "lost") ? (
            <LostDialog
              leadId={lead.id}
              leadName={lead.fullName}
              reasons={reasons}
              open={lostOpen}
              onOpenChange={setLostOpen}
              trigger={
                <Button variant="outline" data-testid="lead-lost">
                  {t("markLost")}
                </Button>
              }
            />
          ) : null}
        </>
      )}
      <Button variant="outline" onClick={() => setArchiveOpen(true)} data-testid="lead-archive">
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? tc("restore") : tc("archive")}
      </Button>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={
          archived
            ? t("restoreTitle", { name: lead.fullName })
            : t("archiveTitle", { name: lead.fullName })
        }
        description={archived ? undefined : t("archiveHint")}
        confirmLabel={archived ? tc("restore") : tc("archive")}
        tone={archived ? "default" : "destructive"}
        action={archiveLeadAction}
        fields={{ id: lead.id, restore: archived ? "1" : "0" }}
        successToast={archived ? t("restored") : t("archived")}
      />
    </div>
  );
}

export type TimelineEntry = {
  id: string;
  kind: "note" | "call" | "status_change" | "task" | "message" | "system";
  title: string;
  body: string | null;
  when: string;
  author: string | null;
  link: { href: string; label: string } | null;
  task: { due: string; overdue: boolean; done: boolean } | null;
};

const KIND_ICONS: Record<TimelineEntry["kind"], LucideIcon> = {
  note: NotebookPen,
  call: PhoneCall,
  status_change: ArrowRightLeft,
  task: ListTodo,
  message: NotebookPen,
  system: Sparkles,
};

function TaskToggle({ entry }: { entry: TimelineEntry }) {
  const t = useTranslations("leads.timeline");
  const te = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = entry.task?.done ?? false;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      data-testid="task-toggle"
      onClick={() =>
        startTransition(async () => {
          const result = await setLeadTaskDoneAction(entry.id, !done);
          if (result && !result.ok) toast.error(te((result.error ?? "generic") as never));
          else router.refresh();
        })
      }
    >
      {done ? <Circle /> : <CheckCircle2 />}
      {done ? t("reopenTask") : t("markDone")}
    </Button>
  );
}

type ComposerKind = "note" | "call" | "task";

/** Add a note, a call (with outcome) or a follow-up task (11). */
function Composer({
  leadId,
  assignees,
  myMembershipId,
  today,
}: {
  leadId: string;
  assignees: { id: string; name: string }[];
  myMembershipId: string;
  today: string;
}) {
  const t = useTranslations("leads.timeline");
  const [kind, setKind] = useState<ComposerKind>("note");
  const [round, setRound] = useState(0);
  return (
    <div
      className="space-y-3 rounded-2xl border border-border/70 p-4"
      data-testid="timeline-composer"
    >
      <SegmentedControl
        label={t("composerKind")}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setRound((r) => r + 1);
        }}
        options={[
          { value: "note", label: t("kind.note") },
          { value: "call", label: t("kind.call") },
          { value: "task", label: t("kind.task") },
        ]}
      />
      <ComposerForm
        key={`${kind}-${round}`}
        kind={kind}
        leadId={leadId}
        assignees={assignees}
        myMembershipId={myMembershipId}
        today={today}
        onSaved={() => setRound((r) => r + 1)}
      />
    </div>
  );
}

function ComposerForm({
  kind,
  leadId,
  assignees,
  myMembershipId,
  today,
  onSaved,
}: {
  kind: ComposerKind;
  leadId: string;
  assignees: { id: string; name: string }[];
  myMembershipId: string;
  today: string;
  onSaved: () => void;
}) {
  const t = useTranslations("leads.timeline");
  const [state, formAction] = useActionState(addLeadActivityAction, null);
  const saved = useRef(false);
  useEffect(() => {
    if (state?.ok && !saved.current) {
      saved.current = true;
      toast.success(t("saved"));
      onSaved();
    }
  }, [state, onSaved, t]);

  const bodyError = state && !state.ok ? state.fieldErrors?.body : undefined;
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "call" ? (
        <SelectField
          name="outcome"
          label={t("outcomeLabel")}
          placeholder={t("outcomePlaceholder")}
          state={state}
          options={(["reached", "no_answer", "call_back"] as const).map((o) => ({
            value: o,
            label: t(`outcome.${o}`),
          }))}
        />
      ) : null}
      <div className="space-y-2">
        <label htmlFor="timeline-body" className="text-[15px] text-secondary-foreground">
          {t(`bodyLabel.${kind}`)}
        </label>
        <Textarea
          id="timeline-body"
          name="body"
          rows={kind === "task" ? 2 : 3}
          maxLength={2000}
          aria-invalid={bodyError ? true : undefined}
          defaultValue={state && !state.ok ? (state.values?.body ?? "") : ""}
        />
        {bodyError ? <ErrorText error={bodyError} /> : null}
      </div>
      {kind === "task" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            name="dueDate"
            type="date"
            label={t("dueDate")}
            defaultValue={today}
            state={state}
          />
          <Field
            name="dueTime"
            type="time"
            label={t("dueTime")}
            defaultValue="10:00"
            state={state}
          />
          <SelectField
            name="assigneeId"
            label={t("assignee")}
            state={state}
            defaultValue={myMembershipId}
            options={assignees.map((a) => ({ value: a.id, label: a.name }))}
          />
        </div>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton>{t(`submit.${kind}`)}</SubmitButton>
      </div>
    </form>
  );
}

function ErrorText({ error }: { error: string }) {
  const te = useTranslations("errors");
  return <p className="text-sm text-destructive">{te(error as never)}</p>;
}

/** Timeline, newest first, with the composer on top (11). */
export function LeadTimeline({
  leadId,
  entries,
  canWrite,
  assignees,
  myMembershipId,
  today,
}: {
  leadId: string;
  entries: TimelineEntry[];
  canWrite: boolean;
  assignees: { id: string; name: string }[];
  myMembershipId: string;
  today: string;
}) {
  const t = useTranslations("leads.timeline");
  return (
    <div className="space-y-5">
      {canWrite ? (
        <Composer
          leadId={leadId}
          assignees={assignees}
          myMembershipId={myMembershipId}
          today={today}
        />
      ) : null}
      {entries.length === 0 ? (
        <EmptyState icon={NotebookPen} title={t("empty")} />
      ) : (
        <MobileList>
          {entries.map((e) => {
            const Icon = KIND_ICONS[e.kind];
            return (
              <MobileCard
                key={e.id}
                variant="inset"
                data-testid="timeline-entry"
                data-kind={e.kind}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p
                      className={
                        e.task?.done
                          ? "text-[15px] font-semibold text-muted-foreground line-through"
                          : "text-[15px] font-semibold text-foreground"
                      }
                    >
                      {e.title}
                    </p>
                    {e.body ? (
                      <p className="text-[15px] whitespace-pre-line text-secondary-foreground">
                        {e.body}
                      </p>
                    ) : null}
                    {e.link ? (
                      <Link
                        href={e.link.href}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {e.link.label}
                      </Link>
                    ) : null}
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {e.task ? (
                        <StatusChip
                          tone={e.task.done ? "success" : e.task.overdue ? "destructive" : "muted"}
                        >
                          {e.task.done ? t("done") : t("due", { when: e.task.due })}
                        </StatusChip>
                      ) : null}
                      <span>{e.when}</span>
                      {e.author ? <span>· {e.author}</span> : null}
                    </p>
                  </div>
                  {e.task && canWrite ? <TaskToggle entry={e} /> : null}
                </div>
              </MobileCard>
            );
          })}
        </MobileList>
      )}
    </div>
  );
}

export type MergeCandidate = { id: string; name: string; status: LeadStatus };

/** "Merge into it" for leads with the same phone: this lead's history moves there and it is archived. */
export function MergeCandidates({
  leadId,
  leadName,
  candidates,
}: {
  leadId: string;
  leadName: string;
  candidates: MergeCandidate[];
}) {
  const t = useTranslations("leads");
  const [target, setTarget] = useState<MergeCandidate | null>(null);
  const router = useRouter();
  if (candidates.length === 0) return null;
  return (
    <>
      <ul className="space-y-2">
        {candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/leads/${c.id}`}
              className="font-semibold text-foreground hover:text-primary"
            >
              {c.name}
            </Link>
            <span className="flex items-center gap-2">
              <StatusChip tone="muted">{t(`status.${c.status}`)}</StatusChip>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTarget(c)}
                data-testid="merge-into"
              >
                <GitMerge />
                {t("merge.button")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {target ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
          title={t("merge.title", { source: leadName, target: target.name })}
          description={t("merge.hint")}
          confirmLabel={t("merge.confirm")}
          action={async (prev, form) => {
            const result = await mergeLeadAction(prev, form);
            if (result?.ok) router.push(`/leads/${target.id}`);
            return result;
          }}
          fields={{ sourceId: leadId, targetId: target.id }}
          successToast={t("merge.done")}
        />
      ) : null}
    </>
  );
}

export type OpenTrial = { id: string; lesson: string; feedback: string | null };

/** The lead's booked trial with "Cancel trial" (11). */
export function OpenTrialCard({ leadId, trial }: { leadId: string; trial: OpenTrial }) {
  const t = useTranslations("leads.trial");
  const [cancelling, setCancelling] = useState(false);
  return (
    <div className="space-y-3" data-testid="open-trial">
      <p className="text-[15px] font-semibold text-foreground">{trial.lesson}</p>
      {trial.feedback ? (
        <p className="text-sm text-secondary-foreground">{trial.feedback}</p>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => setCancelling(true)}>
        {t("cancel")}
      </Button>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t("cancelTitle")}
        description={t("cancelHint")}
        confirmLabel={t("cancel")}
        tone="destructive"
        action={cancelTrialAction}
        fields={{ trialId: trial.id, leadId }}
        successToast={t("cancelled")}
      />
    </div>
  );
}
