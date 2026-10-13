"use client";

import { leadDropAction, OPEN_LEAD_STATUSES, type LeadSource, type LeadStatus } from "@uteach/core";
import { BellRing, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  InitialsAvatar,
  KanbanBoard,
  MobileCard,
  MobileList,
  SegmentedControl,
  StatusChip,
  type KanbanColumn,
} from "@/components/patterns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useRouter } from "@/i18n/navigation";
import { moveLeadAction } from "./actions";
import { SOURCE_ICONS } from "./lead-meta";
import { LostDialog, type ReasonOption } from "./lost-dialog";

export type LeadCardData = {
  id: string;
  column: LeadStatus;
  title: string;
  phone: string | null;
  source: LeadSource;
  goal: string | null;
  assigneeName: string | null;
  followUp: { label: string; overdue: boolean } | null;
};

function LeadCardBody({ lead }: { lead: LeadCardData }) {
  const t = useTranslations("leads");
  const SourceIcon = SOURCE_ICONS[lead.source];
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          className="min-w-0 truncate text-[15px] font-semibold text-foreground outline-none hover:text-primary focus-visible:underline"
        >
          {lead.title}
        </Link>
        <span title={t(`source.${lead.source}`)} className="shrink-0 text-primary">
          <SourceIcon className="size-4" strokeWidth={1.8} aria-hidden />
          <span className="sr-only">{t(`source.${lead.source}`)}</span>
        </span>
      </div>
      {lead.phone ? <p className="text-sm text-muted-foreground">{lead.phone}</p> : null}
      {lead.goal ? (
        <p className="flex items-center gap-1.5 truncate text-sm text-secondary-foreground">
          <Target className="size-3.5 shrink-0 text-primary" aria-hidden />
          {lead.goal}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {lead.followUp ? (
          <StatusChip tone={lead.followUp.overdue ? "destructive" : "muted"}>
            <BellRing className="size-3.5" aria-hidden />
            {lead.followUp.label}
          </StatusChip>
        ) : (
          <span />
        )}
        {lead.assigneeName ? (
          <span title={lead.assigneeName}>
            <InitialsAvatar name={lead.assigneeName} size="sm" />
            <span className="sr-only">
              {t("fields.assignee")}: {lead.assigneeName}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The pipeline (11): a board with drag on wider screens; on phones a status switch over a list with
 * "Move to". Moves that need a dialog open it (lost) or go to the lead (trial, convert).
 */
export function LeadBoard({
  cards,
  columns,
  reasons,
}: {
  cards: LeadCardData[];
  columns: KanbanColumn[];
  reasons: ReasonOption[];
}) {
  const t = useTranslations("leads");
  const te = useTranslations("errors");
  const router = useRouter();
  const [items, setItems] = useState(cards);
  const [seen, setSeen] = useState(cards);
  if (seen !== cards) {
    setSeen(cards);
    setItems(cards);
  }
  const [, startTransition] = useTransition();
  const [lost, setLost] = useState<LeadCardData | null>(null);
  const [mobileStatus, setMobileStatus] = useState<LeadStatus>("new");

  function move(lead: LeadCardData, to: LeadStatus) {
    const action = leadDropAction(lead.column, to);
    if (action === "refused") {
      toast.error(te("db.invalid_lead_move"));
      return;
    }
    if (action === "lost_dialog") {
      setLost(lead);
      return;
    }
    if (action === "trial_picker" || action === "convert") {
      router.push(`/leads/${lead.id}?do=${action === "convert" ? "convert" : "trial"}`);
      return;
    }
    const before = items;
    setItems(items.map((i) => (i.id === lead.id ? { ...i, column: to } : i)));
    startTransition(async () => {
      const result = await moveLeadAction(lead.id, to);
      if (result && !result.ok) {
        setItems(before);
        toast.error(te((result.error ?? "generic") as never));
      } else {
        toast.success(t("moved", { name: lead.title, status: t(`status.${to}`) }));
        router.refresh();
      }
    });
  }

  const moveMenu = (lead: LeadCardData) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="lead-move-menu">
          {t("moveTo")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
        {columns
          .filter((c) => c.key !== lead.column)
          .map((c) => (
            <DropdownMenuItem key={c.key} onSelect={() => move(lead, c.key as LeadStatus)}>
              {c.title}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="hidden md:block">
        <KanbanBoard
          testId="lead-board"
          columns={columns.map((c) => ({
            ...c,
            count: c.compact ? c.count : items.filter((i) => i.column === c.key).length,
          }))}
          items={items}
          onMove={(item, to) => move(item, to as LeadStatus)}
          renderCard={(lead) => <LeadCardBody lead={lead} />}
          empty={t("board.empty")}
        />
      </div>
      <div className="space-y-4 md:hidden">
        <SegmentedControl
          label={t("board.statusPicker")}
          value={mobileStatus}
          onChange={setMobileStatus}
          options={OPEN_LEAD_STATUSES.map((s) => ({
            value: s,
            label: `${t(`status.${s}`)} · ${items.filter((i) => i.column === s).length}`,
          }))}
        />
        <MobileList>
          {items
            .filter((i) => i.column === mobileStatus)
            .map((lead) => (
              <MobileCard key={lead.id} data-testid="lead-mobile-card">
                <LeadCardBody lead={lead} />
                <div className="mt-3 flex justify-end">{moveMenu(lead)}</div>
              </MobileCard>
            ))}
        </MobileList>
        {items.every((i) => i.column !== mobileStatus) ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("board.empty")}</p>
        ) : null}
      </div>
      {lost ? (
        <LostDialog
          leadId={lost.id}
          leadName={lost.title}
          reasons={reasons}
          open
          onOpenChange={(open) => (open ? null : setLost(null))}
        />
      ) : null}
    </>
  );
}
