"use client";

import { UserRoundPlus, UsersRound } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  DataTable,
  EmptyState,
  InitialsAvatar,
  MobileRecord,
  NameCell,
  StatusChip,
  type ChipTone,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  EnrollDialog,
  EnrollmentActionsProvider,
  EnrollmentRowActions,
  useMovedLevel,
  type EnrollmentRef,
  type GroupChoice,
  type StudentChoice,
} from "../../students/enrollment-dialogs";

export type RosterRow = EnrollmentRef & {
  status: "active" | "frozen" | "ended";
  startDate: string;
  endDate: string | null;
};

const TONE: Record<RosterRow["status"], ChipTone> = {
  active: "success",
  frozen: "primary",
  ended: "muted",
};

/**
 * Roster tab (12): the group's current students. Staff open profiles and freeze / transfer / end;
 * teachers see names and dates only (from `group_roster()`, no contacts or money).
 */
export function RosterPanel({
  group,
  rows,
  isStaff,
  editable,
  capacity,
  students,
  groups,
  canDiscount,
  canOverridePrice,
}: {
  group: { id: string; name: string };
  rows: RosterRow[];
  isStaff: boolean;
  editable: boolean;
  capacity: number | null;
  students: StudentChoice[];
  groups: GroupChoice[];
  canDiscount: boolean;
  canOverridePrice: boolean;
}) {
  const t = useTranslations("enrollments");
  const format = useFormatter();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const moved = useMovedLevel(groups);
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const inGroup = new Set(rows.map((r) => r.studentId));

  const nameOf = (r: RosterRow) =>
    isStaff ? (
      <Link href={`/students/${r.studentId}`} className="hover:text-primary">
        {r.studentName}
      </Link>
    ) : (
      r.studentName
    );
  const statusOf = (r: RosterRow) => (
    <StatusChip tone={TONE[r.status]}>{t(`status.${r.status}`)}</StatusChip>
  );
  const sinceOf = (r: RosterRow) =>
    r.endDate
      ? t("period", { from: day(r.startDate), to: day(r.endDate) })
      : t("periodFrom", { from: day(r.startDate) });
  const actionsOf = (r: RosterRow) => (editable ? <EnrollmentRowActions enrollment={r} /> : null);

  return (
    <EnrollmentActionsProvider groups={groups} onMovedLevel={moved.onMovedLevel}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-muted-foreground">
            {capacity
              ? t("rosterCountOf", { count: rows.length, capacity })
              : t("rosterCount", { count: rows.length })}
          </p>
          {editable ? (
            <Button variant="outline-primary" onClick={() => setEnrollOpen(true)}>
              <UserRoundPlus />
              {t("addStudent")}
            </Button>
          ) : null}
        </div>
        <DataTable
          testId="roster-row"
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              icon={UsersRound}
              title={t("rosterEmpty")}
              hint={editable ? t("rosterEmptyHint") : undefined}
            />
          }
          columns={[
            {
              key: "name",
              header: t("student"),
              cell: (r) => (
                <NameCell
                  avatar={<InitialsAvatar name={r.studentName} size="sm" />}
                  name={nameOf(r)}
                />
              ),
            },
            { key: "since", header: t("periodLabel"), cell: sinceOf },
            { key: "status", header: t("statusLabel"), cell: statusOf },
            ...(editable
              ? [{ key: "actions", header: t("actions"), cell: actionsOf, className: "w-36" }]
              : []),
          ]}
          mobileCard={(r) => (
            <MobileRecord
              avatar={<InitialsAvatar name={r.studentName} size="sm" />}
              title={r.studentName}
              subtitle={sinceOf(r)}
              status={statusOf(r)}
              actions={actionsOf(r) ?? undefined}
            />
          )}
        />
      </div>
      {editable ? (
        <>
          <EnrollDialog
            open={enrollOpen}
            onOpenChange={setEnrollOpen}
            group={group}
            students={students.filter((s) => !inGroup.has(s.id))}
            canDiscount={canDiscount}
            canOverridePrice={canOverridePrice}
          />
          <EnrollDialog
            open={moved.nextFor !== null}
            onOpenChange={(o) => {
              if (!o) moved.close();
            }}
            student={
              moved.nextFor
                ? { id: moved.nextFor.studentId, name: moved.nextFor.studentName }
                : undefined
            }
            groups={moved.nextGroups}
            canDiscount={canDiscount}
            canOverridePrice={canOverridePrice}
          />
        </>
      ) : null}
    </EnrollmentActionsProvider>
  );
}
