import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A fake Telegram Bot API for tests (30-milestones M4 E2E: "worker integration test with a mocked Telegram
 * API"). It records every call and answers like Telegram; a chat can be set to fail (e.g. 403 = bot blocked).
 */
export type FakeCall = {
  method: string;
  chatId: string | null;
  text: string | null;
  document: boolean;
};

export type FakeTelegram = {
  apiRoot: string;
  calls: FakeCall[];
  failChat(
    chatId: string | number,
    error: { error_code: number; description: string; retry_after?: number },
  ): void;
  clearFailures(): void;
  sentTo(chatId: string | number): FakeCall[];
  close(): Promise<void>;
};

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Reads chat_id/text/caption from JSON or multipart bodies (sendDocument uploads a file). */
function fields(raw: string, contentType: string | undefined): Record<string, string> {
  if (contentType?.includes("application/json")) {
    const json = JSON.parse(raw || "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(json).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
    );
  }
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/name="([^"]+)"\r\n(?:[^\r\n]*\r\n)*?\r\n([\s\S]*?)\r\n--/g)) {
    if (m[1] !== "document") out[m[1]!] = m[2]!;
  }
  if (raw.includes('name="document"') || /attach:\/\//.test(raw)) out.__document = "1";
  return out;
}

export async function startFakeTelegram(): Promise<FakeTelegram> {
  const calls: FakeCall[] = [];
  const failures = new Map<
    string,
    { error_code: number; description: string; retry_after?: number }
  >();
  let messageId = 1000;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const method = (req.url ?? "").split("/").pop() ?? "";
      const f = fields(await body(req), req.headers["content-type"]);
      const chatId = f.chat_id ?? null;
      const call: FakeCall = {
        method,
        chatId,
        text: f.text ?? f.caption ?? null,
        document: method === "sendDocument" || f.__document === "1",
      };
      calls.push(call);
      res.setHeader("content-type", "application/json");
      const failure = chatId ? failures.get(chatId) : undefined;
      if (failure && method.startsWith("send")) {
        res.statusCode = failure.error_code;
        res.end(
          JSON.stringify({
            ok: false,
            error_code: failure.error_code,
            description: failure.description,
            ...(failure.retry_after ? { parameters: { retry_after: failure.retry_after } } : {}),
          }),
        );
        return;
      }
      if (method === "getUpdates") {
        // Long polling with nothing new: answer after a short pause, like Telegram's timeout.
        await new Promise((resolve) => setTimeout(resolve, 200));
        res.end(JSON.stringify({ ok: true, result: [] }));
        return;
      }
      if (method === "getMe") {
        res.end(
          JSON.stringify({
            ok: true,
            result: {
              id: 1,
              is_bot: true,
              first_name: "uteach",
              username: "uteach_test_bot",
              can_join_groups: false,
              can_read_all_group_messages: false,
              supports_inline_queries: false,
            },
          }),
        );
        return;
      }
      const result = method.startsWith("send")
        ? {
            message_id: ++messageId,
            date: Math.floor(Date.now() / 1000),
            chat: { id: Number(chatId), type: "private" },
          }
        : true;
      res.end(JSON.stringify({ ok: true, result }));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    apiRoot: `http://127.0.0.1:${port}`,
    calls,
    failChat: (chatId, error) => failures.set(String(chatId), error),
    clearFailures: () => failures.clear(),
    sentTo: (chatId) =>
      calls.filter((c) => c.chatId === String(chatId) && c.method.startsWith("send")),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
