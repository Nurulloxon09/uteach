import { EskizError, type SmsProvider } from "@uteach/adapters";
import { pickChannel } from "@uteach/core";
import { renderTemplate } from "@uteach/i18n/notifications";
import type { OutboxJob, WorkerDb } from "./db";
import { todayIn, toLocale } from "./i18n";
import { receiptPdf } from "./receipt";
import { classifyTelegramError, type RateLimiter, type TelegramSender } from "./telegram";

/**
 * The outbox sender (17): claim due rows, choose the channel, render the text, send, record the result.
 * Retryable failures come back after the backoff; a blocked bot unlinks the chat and falls back to SMS.
 */
export type SenderDeps = {
  db: WorkerDb;
  telegram: TelegramSender;
  sms: SmsProvider;
  limiter: RateLimiter;
  log?: (line: string) => void;
  batchSize?: number;
};

export type TickResult = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
};

export function createSender(deps: SenderDeps) {
  const log = deps.log ?? ((line) => console.info(line));

  async function sendTelegram(job: OutboxJob, chatId: string, text: string): Promise<string> {
    await deps.limiter.take(chatId);
    const paymentId = job.payload.paymentId;
    if (job.template_key === "payment_received" && typeof paymentId === "string") {
      let pdf: Buffer | null = null;
      try {
        pdf = await receiptPdf(await deps.db.receiptData(paymentId), toLocale(job.locale));
      } catch (e) {
        log(`[sender] receipt for ${paymentId} failed, sending text only: ${String(e)}`);
      }
      if (pdf) {
        const data = job.payload.receiptNo;
        const name = `${typeof data === "string" ? data : "receipt"}.pdf`;
        return deps.telegram.sendDocument(chatId, pdf, name, text);
      }
    }
    return deps.telegram.sendMessage(chatId, text);
  }

  async function process(job: OutboxJob, result: TickResult): Promise<void> {
    const choice = pickChannel({
      channel: job.channel,
      telegramChatId: job.telegram_chat_id,
      telegramBody: job.telegram_body,
      telegramEnabled: job.telegram_enabled,
      phone: job.phone,
      smsBody: job.sms_body,
      smsTemplateId: job.sms_template_id,
      smsEnabled: job.sms_enabled,
      centerSmsEnabled: job.center_sms_enabled,
      smsLeft: job.sms_left,
    });
    if (!choice.send) {
      await deps.db.markSkipped(job.id, choice.reason);
      result.skipped++;
      return;
    }

    const locale = toLocale(job.locale);
    const body = choice.channel === "telegram" ? job.telegram_body! : job.sms_body!;
    let text: string;
    try {
      text = renderTemplate(body, job.payload, {
        locale,
        currency: job.center_currency,
        today: todayIn(job.center_timezone),
      });
    } catch (e) {
      await deps.db.markFailed(job.id, `render: ${String(e)}`, false);
      result.failed++;
      return;
    }

    if (choice.channel === "telegram") {
      const chatId = job.telegram_chat_id!;
      try {
        const messageId = await sendTelegram(job, chatId, text);
        await deps.db.markSent(job.id, "telegram", chatId, null, messageId);
        result.sent++;
      } catch (e) {
        const failure = classifyTelegramError(e);
        if (failure.kind === "blocked") {
          const fallback = await deps.db.markFailed(job.id, failure.message, true);
          log(
            `[sender] chat ${chatId} blocked the bot; unlinked${fallback ? ", SMS fallback queued" : ""}`,
          );
          result.failed++;
        } else if (failure.kind === "retry") {
          if (failure.afterSeconds > 0) deps.limiter.pause(failure.afterSeconds);
          const status = await deps.db.markRetry(job.id, failure.message, failure.afterSeconds);
          if (status === "failed") result.failed++;
          else result.retried++;
        } else {
          await deps.db.markFailed(job.id, failure.message, false);
          result.failed++;
        }
      }
      return;
    }

    const phone = job.phone!;
    try {
      const sent = await deps.sms.send({ to: phone, text });
      await deps.db.markSent(job.id, "sms", null, phone, sent.providerMessageId);
      result.sent++;
    } catch (e) {
      if (e instanceof EskizError && e.permanent) {
        await deps.db.markFailed(job.id, e.message, false);
        result.failed++;
      } else {
        const status = await deps.db.markRetry(job.id, e instanceof Error ? e.message : String(e));
        if (status === "failed") result.failed++;
        else result.retried++;
      }
    }
  }

  return {
    /** One round: claim a batch and send it. */
    async tick(): Promise<TickResult> {
      const jobs = await deps.db.claim(deps.batchSize ?? 50);
      const result: TickResult = {
        claimed: jobs.length,
        sent: 0,
        retried: 0,
        failed: 0,
        skipped: 0,
      };
      for (const job of jobs) {
        try {
          await process(job, result);
        } catch (e) {
          // A database hiccup while recording: the row stays `sending` and is recovered as stale.
          log(`[sender] job ${job.id} not recorded: ${String(e)}`);
        }
      }
      return result;
    },
  };
}
