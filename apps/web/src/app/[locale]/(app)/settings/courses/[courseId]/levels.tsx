"use client";

import { ArrowDown, ArrowUp, Layers, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DataTable,
  EmptyState,
  Field,
  FormDialog,
  InitialsAvatar,
  MobileRecord,
  NameCell,
  SelectField,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";
import { ArchiveRowActions } from "../../archive-button";
import { createLevelAction, moveLevelAction, updateLevelAction } from "../actions";

export type Level = { id: string; name: string; nextLevelId: string | null };

const NONE = "__none__";

function LevelFields({
  state,
  level,
  levels,
}: {
  state: ActionState;
  level?: Level;
  levels: Level[];
}) {
  const t = useTranslations("courses.levels");
  const others = levels.filter((l) => l.id !== level?.id);
  return (
    <>
      <Field
        name="name"
        label={t("name")}
        defaultValue={level?.name}
        placeholder={t("namePlaceholder")}
        state={state}
        required
      />
      <SelectField
        name="nextLevelId"
        label={t("next")}
        hint={t("nextHint")}
        state={state}
        defaultValue={level?.nextLevelId ?? NONE}
        options={[
          { value: NONE, label: t("noNext") },
          ...others.map((l) => ({ value: l.id, label: l.name })),
        ]}
      />
    </>
  );
}

/** Wraps a level action so the "no next level" choice is sent as empty. */
function withNone(action: (prev: ActionState, form: FormData) => Promise<ActionState>) {
  return (prev: ActionState, form: FormData) => {
    if (form.get("nextLevelId") === NONE) form.set("nextLevelId", "");
    return action(prev, form);
  };
}

/** Ordered levels of a course: add, rename, reorder, set the next level, archive. */
export function LevelsPanel({
  courseId,
  levels,
  editable,
}: {
  courseId: string;
  levels: Level[];
  editable: boolean;
}) {
  const t = useTranslations("courses.levels");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState<Level | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = new Map(levels.map((l) => [l.id, l.name]));

  const move = (id: string, direction: "up" | "down") =>
    startTransition(async () => {
      const form = new FormData();
      form.set("id", id);
      form.set("direction", direction);
      const result = await moveLevelAction(null, form);
      if (result && !result.ok) toast.error(tc("failed"));
    });

  const actionsOf = (l: Level, i: number) =>
    editable ? (
      <ArchiveRowActions
        kind="level"
        id={l.id}
        name={l.name}
        archived={false}
        extra={[
          {
            key: "up",
            label: t("moveUp", { name: l.name }),
            icon: ArrowUp,
            onSelect: () => move(l.id, "up"),
            disabled: pending || i === 0,
          },
          {
            key: "down",
            label: t("moveDown", { name: l.name }),
            icon: ArrowDown,
            onSelect: () => move(l.id, "down"),
            disabled: pending || i === levels.length - 1,
          },
          {
            key: "edit",
            label: tc("rowEdit", { name: l.name }),
            icon: Pencil,
            onSelect: () => setEditing(l),
          },
        ]}
      />
    ) : null;
  const nextOf = (l: Level) => (l.nextLevelId ? (byId.get(l.nextLevelId) ?? "—") : "—");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">{t("hint")}</p>
        {editable ? (
          <FormDialog
            trigger={
              <Button variant="outline-primary">
                <Plus strokeWidth={2.4} />
                {t("add")}
              </Button>
            }
            title={t("addTitle")}
            action={withNone(createLevelAction)}
            submitLabel={t("add")}
            successToast={t("added")}
            testId="level-dialog"
          >
            {(state) => (
              <>
                <input type="hidden" name="courseId" value={courseId} />
                <LevelFields state={state} levels={levels} />
              </>
            )}
          </FormDialog>
        ) : null}
      </div>

      <DataTable
        testId="level-row"
        rows={levels}
        rowKey={(l) => l.id}
        empty={
          <EmptyState
            icon={Layers}
            title={t("emptyTitle")}
            hint={editable ? t("emptyHint") : undefined}
          />
        }
        columns={[
          {
            key: "name",
            header: t("name"),
            cell: (l) => (
              <NameCell avatar={<InitialsAvatar name={l.name} size="sm" />} name={l.name} />
            ),
          },
          { key: "next", header: t("next"), cell: nextOf },
          {
            key: "actions",
            header: tc("actions"),
            cell: (l) => actionsOf(l, levels.indexOf(l)),
            className: "w-48",
          },
        ]}
        mobileCard={(l) => (
          <MobileRecord
            avatar={<InitialsAvatar name={l.name} size="sm" />}
            title={l.name}
            fields={[{ label: t("next"), value: nextOf(l) }]}
            actions={actionsOf(l, levels.indexOf(l))}
          />
        )}
      />

      <FormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={t("editTitle")}
        action={withNone(updateLevelAction)}
        submitLabel={tc("save")}
        successToast={tc("saved")}
      >
        {(state) =>
          editing ? (
            <>
              <input type="hidden" name="id" value={editing.id} />
              <LevelFields state={state} level={editing} levels={levels} />
            </>
          ) : null
        }
      </FormDialog>
    </div>
  );
}
