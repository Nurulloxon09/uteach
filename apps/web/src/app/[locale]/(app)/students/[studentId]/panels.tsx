"use client";

import { NotebookPen, Pencil, Pin, Plus, Trash2, UserRoundPlus, UsersRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckboxField,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FieldError,
  FormDialog,
  InitialsAvatar,
  MobileCard,
  MobileList,
  MobileRecord,
  RowActions,
  SelectField,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions";
import {
  addGuardianAction,
  deleteNoteAction,
  saveNoteAction,
  unlinkGuardianAction,
  updateGuardianAction,
} from "../actions";
import {
  EnrollDialog,
  EnrollmentActionsProvider,
  EnrollmentRowActions,
  useMovedLevel,
  type EnrollmentRef,
  type GroupChoice,
} from "../enrollment-dialogs";

// --- Enrollments ---------------------------------------------------------------------

export type EnrollmentRow = EnrollmentRef & {
  status: "active" | "frozen" | "ended";
  startDate: string;
  endDate: string | null;
  endReason: string | null;
  discountBp: number;
  freezes: { from: string; to: string }[];
};

const STATUS_TONE: Record<EnrollmentRow["status"], ChipTone> = {
  active: "success",
  frozen: "primary",
  ended: "muted",
};

export function EnrollmentsPanel({
  student,
  rows,
  groups,
  editable,
  canDiscount,
  canOverridePrice,
}: {
  student: { id: string; name: string };
  rows: EnrollmentRow[];
  groups: GroupChoice[];
  editable: boolean;
  canDiscount: boolean;
  canOverridePrice: boolean;
}) {
  const t = useTranslations("enrollments");
  const format = useFormatter();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const moved = useMovedLevel(groups);
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  const periodOf = (r: EnrollmentRow) =>
    r.endDate
      ? t("period", { from: day(r.startDate), to: day(r.endDate) })
      : t("periodFrom", { from: day(r.startDate) });
  const statusOf = (r: EnrollmentRow) => (
    <span className="flex flex-wrap gap-1.5">
      <StatusChip tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</StatusChip>
      {r.endReason ? (
        <StatusChip tone="muted">{t(`reasons.${r.endReason as "completed"}`)}</StatusChip>
      ) : null}
    </span>
  );
  const notesOf = (r: EnrollmentRow) =>
    [
      r.discountBp ? t("discountValue", { percent: r.discountBp / 100 }) : null,
      ...r.freezes.map((f) => t("frozenFor", { from: day(f.from), to: day(f.to) })),
    ]
      .filter(Boolean)
      .join(" · ") || "—";
  const actionsOf = (r: EnrollmentRow) =>
    editable && r.status !== "ended" ? <EnrollmentRowActions enrollment={r} /> : null;

  return (
    <EnrollmentActionsProvider groups={groups} onMovedLevel={moved.onMovedLevel}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-muted-foreground">{t("hint")}</p>
          {editable ? (
            <Button variant="outline-primary" onClick={() => setEnrollOpen(true)}>
              <Plus strokeWidth={2.4} />
              {t("enroll")}
            </Button>
          ) : null}
        </div>
        <DataTable
          testId="enrollment-row"
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={UsersRound}
              title={t("emptyTitle")}
              hint={editable ? t("emptyHint") : undefined}
            />
          }
          columns={[
            {
              key: "group",
              header: t("group"),
              cell: (r) => (
                <Link
                  href={`/groups/${r.groupId}`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {r.groupName}
                </Link>
              ),
            },
            { key: "period", header: t("periodLabel"), cell: periodOf },
            { key: "status", header: t("statusLabel"), cell: statusOf },
            { key: "notes", header: t("notes"), cell: notesOf },
            { key: "actions", header: t("actions"), cell: actionsOf, className: "w-36" },
          ]}
          mobileCard={(r) => (
            <MobileRecord
              title={r.groupName}
              subtitle={periodOf(r)}
              status={statusOf(r)}
              fields={[{ label: t("notes"), value: notesOf(r) }]}
              actions={actionsOf(r)}
            />
          )}
        />
      </div>
      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        student={student}
        groups={groups}
        canDiscount={canDiscount}
        canOverridePrice={canOverridePrice}
      />
      <EnrollDialog
        open={moved.nextFor !== null}
        onOpenChange={(o) => {
          if (!o) moved.close();
        }}
        student={student}
        groups={moved.nextGroups}
        canDiscount={canDiscount}
        canOverridePrice={canOverridePrice}
      />
    </EnrollmentActionsProvider>
  );
}

// --- Guardians ------------------------------------------------------------------------

export type GuardianRow = {
  id: string;
  fullName: string;
  phone: string;
  relation: string;
  isPrimary: boolean;
  receivesNotifications: boolean;
  receivesBilling: boolean;
  /** Other students of this guardian ("also guardian of"). */
  others: { id: string; name: string }[];
};

const RELATIONS = ["mother", "father", "parent", "other"] as const;
const LIST_SEPARATOR = ", ";

function GuardianFields({ state, guardian }: { state: ActionState; guardian?: GuardianRow }) {
  const t = useTranslations("students");
  return (
    <>
      <Field
        name="fullName"
        label={t("guardian.name")}
        defaultValue={guardian?.fullName}
        state={state}
        required
      />
      <Field
        name="phone"
        type="tel"
        inputMode="tel"
        label={t("guardian.phone")}
        hint={guardian ? undefined : t("guardian.phoneHint")}
        defaultValue={guardian?.phone}
        state={state}
        required
      />
      <SelectField
        name="relation"
        label={t("guardian.relation")}
        state={state}
        defaultValue={guardian?.relation ?? "parent"}
        options={RELATIONS.map((r) => ({ value: r, label: t(`relations.${r}`) }))}
      />
      <CheckboxField
        name="isPrimary"
        value="on"
        label={t("guardian.primary")}
        defaultChecked={guardian?.isPrimary ?? false}
      />
      <CheckboxField
        name="notifications"
        value="on"
        label={t("guardian.notifications")}
        defaultChecked={guardian?.receivesNotifications ?? true}
      />
      <CheckboxField
        name="billing"
        value="on"
        label={t("guardian.billing")}
        defaultChecked={guardian?.receivesBilling ?? true}
      />
    </>
  );
}

export function GuardiansPanel({
  studentId,
  guardians,
  editable,
}: {
  studentId: string;
  guardians: GuardianRow[];
  editable: boolean;
}) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState<GuardianRow | null>(null);
  const [unlinking, setUnlinking] = useState<GuardianRow | null>(null);

  const add = async (prev: ActionState, form: FormData) => {
    const result = await addGuardianAction(prev, form);
    if (result?.ok)
      toast.success(
        result.data?.linkedExisting === "true" ? t("guardian.linked") : t("guardian.added"),
      );
    return result;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">{t("guardian.hint")}</p>
        {editable ? (
          <FormDialog
            trigger={
              <Button variant="outline-primary">
                <UserRoundPlus />
                {t("guardian.add")}
              </Button>
            }
            title={t("guardian.addTitle")}
            description={t("guardian.addHint")}
            action={add}
            submitLabel={t("guardian.add")}
            testId="guardian-dialog"
          >
            {(state) => (
              <>
                <input type="hidden" name="studentId" value={studentId} />
                <GuardianFields state={state} />
              </>
            )}
          </FormDialog>
        ) : null}
      </div>

      {guardians.length === 0 ? (
        <EmptyState icon={UsersRound} title={t("guardian.emptyTitle")} />
      ) : (
        <MobileList>
          {guardians.map((g) => (
            <MobileCard key={g.id} variant="inset" data-testid="guardian-card">
              <MobileRecord
                avatar={<InitialsAvatar name={g.fullName} />}
                title={g.fullName}
                subtitle={`${t(`relations.${g.relation as "parent"}`)} · ${g.phone}`}
                status={
                  g.isPrimary ? (
                    <StatusChip tone="primary">{t("guardian.primaryChip")}</StatusChip>
                  ) : undefined
                }
                actions={
                  editable ? (
                    <RowActions
                      actions={[
                        {
                          key: "edit",
                          label: tc("rowEdit", { name: g.fullName }),
                          icon: Pencil,
                          onSelect: () => setEditing(g),
                        },
                        {
                          key: "unlink",
                          label: t("guardian.unlinkRow", { name: g.fullName }),
                          icon: Trash2,
                          tone: "destructive",
                          onSelect: () => setUnlinking(g),
                        },
                      ]}
                    />
                  ) : undefined
                }
              />
              {g.others.length ? (
                <p className="mt-2 text-sm text-muted-foreground" data-testid="also-guardian-of">
                  {t("guardian.alsoOf")}
                  {g.others.map((o, i) => (
                    <span key={o.id} className="ml-1">
                      {i > 0 ? LIST_SEPARATOR : null}
                      <Link
                        href={`/students/${o.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {o.name}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
            </MobileCard>
          ))}
        </MobileList>
      )}

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={t("guardian.editTitle")}
        description={editing?.others.length ? t("guardian.editShared") : undefined}
        action={updateGuardianAction}
        submitLabel={tc("save")}
        successToast={tc("saved")}
      >
        {(state) =>
          editing ? (
            <>
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="guardianId" value={editing.id} />
              <GuardianFields state={state} guardian={editing} />
            </>
          ) : null
        }
      </FormDialog>
      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(o) => {
          if (!o) setUnlinking(null);
        }}
        title={t("guardian.unlinkTitle")}
        description={t("guardian.unlinkHint")}
        confirmLabel={t("guardian.unlink")}
        tone="destructive"
        action={unlinkGuardianAction}
        fields={{ studentId, guardianId: unlinking?.id ?? "" }}
        successToast={t("guardian.unlinked")}
      />
    </div>
  );
}

// --- Notes -------------------------------------------------------------------------------

export type NoteRow = {
  id: string;
  body: string;
  isPinned: boolean;
  visibleToTeachers: boolean;
  createdAt: string;
  mine: boolean;
};

function NoteFields({ state, note }: { state: ActionState; note?: NoteRow }) {
  const t = useTranslations("students.notes");
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="note-body">{t("body")}</Label>
        <Textarea id="note-body" name="body" rows={4} defaultValue={note?.body} required />
        <FieldError name="body" state={state} />
      </div>
      <CheckboxField
        name="isPinned"
        value="on"
        label={t("pin")}
        defaultChecked={note?.isPinned ?? false}
      />
      <CheckboxField
        name="visibleToTeachers"
        value="on"
        label={t("visible")}
        hint={t("visibleHint")}
        defaultChecked={note?.visibleToTeachers ?? false}
      />
    </>
  );
}

export function NotesPanel({
  studentId,
  notes,
  canAdd,
}: {
  studentId: string;
  notes: NoteRow[];
  canAdd: boolean;
}) {
  const t = useTranslations("students.notes");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [deleting, setDeleting] = useState<NoteRow | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">{t("hint")}</p>
        {canAdd ? (
          <FormDialog
            trigger={
              <Button variant="outline-primary">
                <NotebookPen />
                {t("add")}
              </Button>
            }
            title={t("addTitle")}
            action={saveNoteAction}
            submitLabel={tc("save")}
            successToast={t("added")}
            testId="note-dialog"
          >
            {(state) => (
              <>
                <input type="hidden" name="studentId" value={studentId} />
                <NoteFields state={state} />
              </>
            )}
          </FormDialog>
        ) : null}
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={NotebookPen} title={t("emptyTitle")} />
      ) : (
        <MobileList>
          {notes.map((n) => (
            <MobileCard key={n.id} variant="inset" data-testid="note-card">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[15px] whitespace-pre-line text-foreground">{n.body}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {format.dateTime(new Date(n.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {n.isPinned ? (
                      <StatusChip tone="primary">
                        <Pin className="mr-1 inline size-3" />
                        {t("pinned")}
                      </StatusChip>
                    ) : null}
                    {n.visibleToTeachers ? (
                      <StatusChip tone="muted">{t("visibleChip")}</StatusChip>
                    ) : null}
                  </p>
                </div>
                {n.mine ? (
                  <RowActions
                    actions={[
                      {
                        key: "edit",
                        label: t("editRow"),
                        icon: Pencil,
                        onSelect: () => setEditing(n),
                      },
                      {
                        key: "delete",
                        label: t("deleteRow"),
                        icon: Trash2,
                        tone: "destructive",
                        onSelect: () => setDeleting(n),
                      },
                    ]}
                  />
                ) : null}
              </div>
            </MobileCard>
          ))}
        </MobileList>
      )}

      <FormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={t("editTitle")}
        action={saveNoteAction}
        submitLabel={tc("save")}
        successToast={tc("saved")}
      >
        {(state) =>
          editing ? (
            <>
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="id" value={editing.id} />
              <NoteFields state={state} note={editing} />
            </>
          ) : null
        }
      </FormDialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t("deleteTitle")}
        confirmLabel={tc("remove")}
        tone="destructive"
        action={deleteNoteAction}
        fields={{ id: deleting?.id ?? "", studentId }}
        successToast={t("deleted")}
      />
    </div>
  );
}
