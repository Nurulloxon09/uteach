/**
 * Outbox sending rules (docs/spec/17-telegram-notifications.md): the retry schedule and how a claimed row picks
 * its channel. The database claims and records; the worker (M4b) asks these functions what to do.
 */

/** Attempts before a row is given up (`failed`). */
export const OUTBOX_MAX_ATTEMPTS = 5;

/**
 * Seconds to wait before retrying after attempt number `attempts` failed (attempts are counted when a row is
 * claimed, so the first failure has attempts = 1): 30 s, 2 min, 10 min, 1 h. Null = give up.
 * Mirrors `private.outbox_backoff` (parity-tested).
 */
export function outboxBackoffSeconds(attempts: number): number | null {
  if (attempts >= OUTBOX_MAX_ATTEMPTS) return null;
  if (attempts <= 1) return 30;
  if (attempts === 2) return 120;
  if (attempts === 3) return 600;
  return 3600;
}

export type OutboxChannel = "telegram" | "sms";

/** What `worker.claim_outbox` tells the sender about a row (the parts the channel choice needs). */
export type ChannelInput = {
  /** Set for SMS fallback rows and explicit-channel broadcasts; null = choose. */
  channel: OutboxChannel | "whatsapp" | "email" | null;
  telegramChatId: string | number | bigint | null;
  telegramBody: string | null;
  telegramEnabled: boolean;
  phone: string | null;
  smsBody: string | null;
  /** Eskiz template id: only approved templates can go by SMS. */
  smsTemplateId: string | null;
  smsEnabled: boolean;
  centerSmsEnabled: boolean;
  /** SMS left under the center's monthly cap. */
  smsLeft: number;
};

export type SkipReason =
  | "template_disabled"
  | "no_channel"
  | "sms_not_approved"
  | "sms_off"
  | "sms_cap"
  | "no_phone"
  | "unsupported_channel";

export type ChannelChoice =
  { send: true; channel: OutboxChannel } | { send: false; reason: SkipReason };

function smsChoice(row: ChannelInput): ChannelChoice {
  if (!row.smsBody || !row.smsEnabled) return { send: false, reason: "template_disabled" };
  if (!row.smsTemplateId) return { send: false, reason: "sms_not_approved" };
  if (!row.centerSmsEnabled) return { send: false, reason: "sms_off" };
  if (row.smsLeft <= 0) return { send: false, reason: "sms_cap" };
  if (!row.phone) return { send: false, reason: "no_phone" };
  return { send: true, channel: "sms" };
}

/**
 * The channel for a claimed row (17): Telegram when the recipient has a live link and the Telegram template is
 * on; otherwise SMS when the template is approved and on, the center sends SMS, is under its cap and the
 * recipient has a phone; otherwise the row is skipped with the reason. An explicit channel is never swapped.
 */
export function pickChannel(row: ChannelInput): ChannelChoice {
  if (row.channel === "sms") return smsChoice(row);
  if (row.channel === "whatsapp" || row.channel === "email") {
    return { send: false, reason: "unsupported_channel" };
  }
  const telegramReady = row.telegramChatId !== null && !!row.telegramBody;
  if (telegramReady && row.telegramEnabled) return { send: true, channel: "telegram" };
  if (row.channel === "telegram") {
    return { send: false, reason: telegramReady ? "template_disabled" : "no_channel" };
  }
  // A center that switched the key off for Telegram doesn't want it at all.
  if (row.telegramBody && !row.telegramEnabled) return { send: false, reason: "template_disabled" };
  const sms = smsChoice(row);
  if (!sms.send && !row.smsBody) return { send: false, reason: "no_channel" };
  return sms;
}
