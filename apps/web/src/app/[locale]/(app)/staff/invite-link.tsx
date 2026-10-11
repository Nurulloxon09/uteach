"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shows a freshly created invite link once, with a copy button. */
export function InviteLink({ url }: { url: string }) {
  const t = useTranslations("staff");
  const [copied, setCopied] = useState(false);
  return (
    <Alert>
      <AlertTitle>{t("linkReady")}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <span>{t("linkHint")}</span>
        <div className="flex gap-2">
          <Input
            readOnly
            value={url}
            data-testid="invite-url"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
