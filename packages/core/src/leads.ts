/** The pipeline's statuses, in board order (11). */
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "trial_scheduled",
  "trial_done",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const OPEN_LEAD_STATUSES = ["new", "contacted", "trial_scheduled", "trial_done"] as const;

export const LEAD_SOURCES = [
  "instagram",
  "telegram",
  "walk_in",
  "call",
  "referral",
  "web_form",
  "meta_ads",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LOST_REASON_KEYS = [
  "price",
  "schedule",
  "location",
  "competitor",
  "no_response",
  "other",
] as const;
export type LostReasonKey = (typeof LOST_REASON_KEYS)[number];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether `move_lead` accepts a move (M5 plan): open statuses move freely between themselves and to lost;
 * lost reopens to new or contacted; won comes only from Convert and trial_scheduled only from scheduling a
 * trial; won is final. Mirrors `private.lead_move_allowed` (parity-tested).
 */
export function canMoveLead(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return false;
  if (to === "won" || to === "trial_scheduled") return false;
  if (from === "won") return false;
  if (from === "lost") return to === "new" || to === "contacted";
  return true;
}

/** What dropping a card on a column does: a plain move, or the dialog that column needs first. */
export type LeadDrop = "move" | "lost_dialog" | "trial_picker" | "convert" | "refused";

export function leadDropAction(from: LeadStatus, to: LeadStatus): LeadDrop {
  if (from === to || from === "won") return "refused";
  if (to === "won") return from === "lost" ? "refused" : "convert";
  if (to === "trial_scheduled") return from === "lost" ? "refused" : "trial_picker";
  if (to === "lost") return "lost_dialog";
  return canMoveLead(from, to) ? "move" : "refused";
}
