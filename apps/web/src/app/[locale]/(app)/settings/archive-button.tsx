"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { archiveBranchAction, archiveRoomAction } from "./actions";

/** Archive / restore toggle for a branch or a room. Archived rows stay in history. */
export function ArchiveButton({
  kind,
  id,
  archived,
}: {
  kind: "branch" | "room";
  id: string;
  archived: boolean;
}) {
  const t = useTranslations("common");
  const [state, action] = useActionState(
    kind === "branch" ? archiveBranchAction : archiveRoomAction,
    null,
  );
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!archived && !window.confirm(t("archiveConfirm"))) e.preventDefault();
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <FormMessage state={state} />
      <div>
        <SubmitButton variant={archived ? "outline" : "ghost"} size="sm">
          {archived ? t("restore") : t("archive")}
        </SubmitButton>
      </div>
    </form>
  );
}
