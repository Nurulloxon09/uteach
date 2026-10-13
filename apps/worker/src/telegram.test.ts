import { GrammyError, HttpError } from "grammy";
import { describe, expect, it } from "vitest";
import { classifyTelegramError, RateLimiter } from "./telegram";

const grammyError = (code: number, description: string, retryAfter?: number) =>
  new GrammyError(
    "call failed",
    {
      ok: false,
      error_code: code,
      description,
      ...(retryAfter ? { parameters: { retry_after: retryAfter } } : {}),
    },
    "sendMessage",
    {},
  );

describe("classifyTelegramError", () => {
  it("a blocked bot or a missing chat is permanent: unlink and fall back to SMS", () => {
    expect(
      classifyTelegramError(grammyError(403, "Forbidden: bot was blocked by the user")).kind,
    ).toBe("blocked");
    expect(classifyTelegramError(grammyError(400, "Bad Request: chat not found")).kind).toBe(
      "blocked",
    );
  });

  it("429 waits retry_after; 5xx and network errors retry", () => {
    expect(classifyTelegramError(grammyError(429, "Too Many Requests", 17))).toMatchObject({
      kind: "retry",
      afterSeconds: 17,
    });
    expect(classifyTelegramError(grammyError(502, "Bad Gateway")).kind).toBe("retry");
    expect(classifyTelegramError(new HttpError("socket hang up", new Error("x"))).kind).toBe(
      "retry",
    );
  });

  it("other bad requests are not retried", () => {
    expect(classifyTelegramError(grammyError(400, "Bad Request: message is too long")).kind).toBe(
      "fatal",
    );
  });
});

describe("RateLimiter", () => {
  function fakeClock() {
    let now = 0;
    const waits: number[] = [];
    return {
      waits,
      clock: {
        now: () => now,
        sleep: async (ms: number) => {
          waits.push(ms);
          now += ms;
        },
      },
    };
  }

  it("spaces messages to one chat a second apart and all messages 40 ms apart", async () => {
    const { clock, waits } = fakeClock();
    const limiter = new RateLimiter(25, 1000, clock);
    await limiter.take("a");
    await limiter.take("b");
    await limiter.take("a");
    expect(waits).toEqual([40, 960]);
  });

  it("a 429 pauses everyone", async () => {
    const { clock, waits } = fakeClock();
    const limiter = new RateLimiter(25, 1000, clock);
    limiter.pause(3);
    await limiter.take("a");
    expect(waits).toEqual([3000]);
  });
});
