"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A freshly created invite link, shown once, with a copy button. */
export function InviteLink({ url, title, hint }: { url: string; title: string; hint: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-stat-green text-primary">
          <Link2 className="size-5" strokeWidth={1.9} aria-hidden />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          aria-label={title}
          data-testid="invite-url"
          onFocus={(e) => e.currentTarget.select()}
          className="text-sm"
        />
        <Button
          type="button"
          variant="outline"
          className="h-12 px-4"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}
