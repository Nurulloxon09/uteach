import { GrammyError, HttpError, InputFile, type Api } from "grammy";

/**
 * Sending to Telegram (17): what the sender needs from the Bot API, how errors are read, and the rate limits
 * (~25 messages/s overall, 1/s per chat; a 429 waits `retry_after`).
 */
export type TelegramSender = {
  sendMessage(chatId: string, text: string): Promise<string>;
  sendDocument(chatId: string, file: Buffer, filename: string, caption: string): Promise<string>;
};

export function telegramSender(api: Api): TelegramSender {
  return {
    async sendMessage(chatId, text) {
      const message = await api.sendMessage(chatId, text);
      return String(message.message_id);
    },
    async sendDocument(chatId, file, filename, caption) {
      const message = await api.sendDocument(chatId, new InputFile(file, filename), {
        caption: caption.slice(0, 1024),
      });
      return String(message.message_id);
    },
  };
}

export type SendFailure =
  /** The user blocked the bot or the chat is gone: unlink, fall back to SMS. */
  | { kind: "blocked"; message: string }
  /** Try again later (rate limit, network, Telegram down). */
  | { kind: "retry"; message: string; afterSeconds: number }
  /** The request itself is wrong (e.g. text too long): retrying won't help. */
  | { kind: "fatal"; message: string };

export function classifyTelegramError(error: unknown): SendFailure {
  if (error instanceof GrammyError) {
    const message = `${error.error_code} ${error.description}`;
    if (error.error_code === 403) return { kind: "blocked", message };
    if (
      error.error_code === 400 &&
      /chat not found|user not found|peer_id_invalid/i.test(error.description)
    ) {
      return { kind: "blocked", message };
    }
    if (error.error_code === 429) {
      return { kind: "retry", message, afterSeconds: error.parameters.retry_after ?? 30 };
    }
    if (error.error_code >= 500) return { kind: "retry", message, afterSeconds: 0 };
    return { kind: "fatal", message };
  }
  if (error instanceof HttpError) return { kind: "retry", message: error.message, afterSeconds: 0 };
  return {
    kind: "retry",
    message: error instanceof Error ? error.message : String(error),
    afterSeconds: 0,
  };
}

type Clock = { now(): number; sleep(ms: number): Promise<void> };

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Spaces out sends: at most `perSecond` overall and one per chat every `perChatMs`. A 429 pauses everything
 * for `retry_after` (`pause`).
 */
export class RateLimiter {
  private nextGlobal = 0;
  private readonly nextPerChat = new Map<string, number>();

  constructor(
    private readonly perSecond = 25,
    private readonly perChatMs = 1000,
    private readonly clock: Clock = realClock,
  ) {}

  async take(chatId: string): Promise<void> {
    const now = this.clock.now();
    const at = Math.max(now, this.nextGlobal, this.nextPerChat.get(chatId) ?? 0);
    this.nextGlobal = at + (this.perSecond > 0 ? 1000 / this.perSecond : 0);
    this.nextPerChat.set(chatId, at + this.perChatMs);
    if (this.nextPerChat.size > 10_000) this.prune(now);
    if (at > now) await this.clock.sleep(at - now);
  }

  pause(seconds: number): void {
    this.nextGlobal = Math.max(this.nextGlobal, this.clock.now() + seconds * 1000);
  }

  private prune(now: number) {
    for (const [chat, at] of this.nextPerChat) if (at < now) this.nextPerChat.delete(chat);
  }
}
