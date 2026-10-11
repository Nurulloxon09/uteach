"use client";

import { DoorOpen, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  DataTable,
  EmptyState,
  Field,
  FormDialog,
  InitialsAvatar,
  MobileRecord,
  NameCell,
  StatusChip,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";
import { createRoomAction, updateRoomAction } from "../../actions";
import { ArchiveRowActions } from "../../archive-button";

export type Room = { id: string; name: string; capacity: number | null; archived_at: string | null };

function RoomFields({ state, room }: { state: ActionState; room?: Room }) {
  const t = useTranslations("settings.rooms.fields");
  return (
    <>
      <Field name="name" label={t("name")} defaultValue={room?.name} state={state} required />
      <Field
        name="capacity"
        type="number"
        min={1}
        inputMode="numeric"
        label={t("capacity")}
        defaultValue={room?.capacity ?? ""}
        state={state}
      />
    </>
  );
}

/** Rooms tab: list of rooms with add / edit dialogs and archive / restore. */
export function RoomsPanel({ branchId, rooms, editable }: { branchId: string; rooms: Room[]; editable: boolean }) {
  const t = useTranslations("settings.rooms");
  const tb = useTranslations("settings.branches");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState<Room | null>(null);

  const capacityOf = (r: Room) => (r.capacity ? t("capacityValue", { count: r.capacity }) : "—");
  const statusOf = (r: Room) =>
    r.archived_at ? <StatusChip tone="muted">{tc("archived")}</StatusChip> : <StatusChip tone="success">{tb("statusActive")}</StatusChip>;
  const actionsOf = (r: Room) =>
    editable ? (
      <ArchiveRowActions
        kind="room"
        id={r.id}
        name={r.name}
        archived={r.archived_at !== null}
        extra={
          r.archived_at
            ? []
            : [{ key: "edit", label: tc("rowEdit", { name: r.name }), icon: Pencil, onSelect: () => setEditing(r) }]
        }
      />
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">{editable ? t("hint") : t("readOnlyHint")}</p>
        {editable ? (
          <FormDialog
            trigger={
              <Button variant="outline-primary">
                <Plus strokeWidth={2.4} />
                {t("add")}
              </Button>
            }
            title={t("addTitle")}
            action={createRoomAction}
            submitLabel={t("add")}
            successToast={t("added")}
            testId="room-dialog"
          >
            {(state) => (
              <>
                <input type="hidden" name="branchId" value={branchId} />
                <RoomFields state={state} />
              </>
            )}
          </FormDialog>
        ) : null}
      </div>

      <DataTable
        testId="room-row"
        rows={rooms}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={DoorOpen} title={t("empty")} hint={editable ? t("emptyHint") : undefined} />}
        columns={[
          {
            key: "name",
            header: t("fields.name"),
            cell: (r) => <NameCell avatar={<InitialsAvatar name={r.name} size="sm" />} name={r.name} />,
          },
          { key: "capacity", header: t("fields.capacity"), cell: capacityOf },
          { key: "status", header: tb("filterStatus"), cell: statusOf },
          { key: "actions", header: tc("actions"), cell: actionsOf, className: "w-28" },
        ]}
        mobileCard={(r) => (
          <MobileRecord
            avatar={<InitialsAvatar name={r.name} size="sm" />}
            title={r.name}
            subtitle={capacityOf(r)}
            status={statusOf(r)}
            actions={actionsOf(r)}
          />
        )}
      />

      <FormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={t("editTitle")}
        action={updateRoomAction}
        submitLabel={tc("save")}
        successToast={tc("saved")}
      >
        {(state) =>
          editing ? (
            <>
              <input type="hidden" name="id" value={editing.id} />
              <RoomFields state={state} room={editing} />
            </>
          ) : null
        }
      </FormDialog>
    </div>
  );
}
