"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form-bits";
import { Badge } from "@/components/ui/badge";
import { createRoomAction, updateRoomAction } from "../../actions";
import { ArchiveButton } from "../../archive-button";

type Room = { id: string; name: string; capacity: number | null; archived_at: string | null };

export function RoomRow({ room, editable }: { room: Room; editable: boolean }) {
  const t = useTranslations("settings.rooms");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateRoomAction, null);
  const archived = room.archived_at !== null;

  return (
    <div className="grid gap-2 rounded-md border p-3" data-testid="room-row">
      <form
        action={action}
        className="grid gap-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end"
        noValidate
      >
        <input type="hidden" name="id" value={room.id} />
        <Field
          name="name"
          id={`room-${room.id}-name`}
          label={t("fields.name")}
          defaultValue={room.name}
          disabled={!editable || archived}
          state={state}
        />
        <Field
          name="capacity"
          id={`room-${room.id}-capacity`}
          type="number"
          min={1}
          inputMode="numeric"
          label={t("fields.capacity")}
          defaultValue={room.capacity ?? ""}
          disabled={!editable || archived}
          state={state}
        />
        {editable && !archived ? <SubmitButton variant="outline">{tc("save")}</SubmitButton> : null}
      </form>
      <FormMessage state={state} success={tc("saved")} />
      <div className="flex items-center gap-2">
        {archived ? <Badge variant="secondary">{tc("archived")}</Badge> : null}
        {editable || archived ? (
          <ArchiveButton kind="room" id={room.id} archived={archived} />
        ) : null}
      </div>
    </div>
  );
}

export function RoomForm({ branchId }: { branchId: string }) {
  const t = useTranslations("settings.rooms");
  const [state, action] = useActionState(createRoomAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end"
      noValidate
    >
      <input type="hidden" name="branchId" value={branchId} />
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
      <Field name="name" id="new-room-name" label={t("fields.name")} state={state} required />
      <Field
        name="capacity"
        id="new-room-capacity"
        type="number"
        min={1}
        inputMode="numeric"
        label={t("fields.capacity")}
        state={state}
      />
      <SubmitButton>{t("add")}</SubmitButton>
    </form>
  );
}
