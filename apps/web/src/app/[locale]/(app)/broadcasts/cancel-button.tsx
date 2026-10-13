"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { cancelBroadcastAction } from "./actions";

/** Stops a broadcast's messages that haven't gone out yet (those already sent stay sent). */
export function CancelBroadcastButton({ id }: { id: string }) {
  const t = useTranslations("broadcasts");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("cancel")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("cancelTitle")}
        description={t("cancelHint")}
        confirmLabel={t("cancel")}
        tone="destructive"
        action={cancelBroadcastAction}
        fields={{ id }}
        successToast={t("cancelled")}
      />
    </>
  );
}
