import { describe, expect, it } from "vitest";
import { ConsoleSmsProvider, createSmsProvider, EskizError, EskizSmsProvider } from "./index";

describe("ConsoleSmsProvider", () => {
  it("logs instead of sending", async () => {
    const lines: string[] = [];
    const sms = new ConsoleSmsProvider((line) => lines.push(line));
    const result = await sms.send({ to: "+998901234567", text: "uteach: 123456" });
    expect(result.providerMessageId).toMatch(/^console-/);
    expect(lines).toEqual(['[sms:console] to=+998901234567 text="uteach: 123456"']);
  });
});

describe("createSmsProvider", () => {
  it("defaults to the console provider", () => {
    expect(createSmsProvider(undefined).name).toBe("console");
  });

  it("builds Eskiz from the environment and refuses unknown providers", () => {
    expect(createSmsProvider("eskiz", { ESKIZ_EMAIL: "a@b.uz", ESKIZ_PASSWORD: "x" }).name).toBe(
      "eskiz",
    );
    expect(() => createSmsProvider("eskiz")).toThrow(/ESKIZ_EMAIL/);
    expect(() => createSmsProvider("twilio")).toThrow(/unknown/);
  });
});

/** A fake Eskiz API: records requests and answers from a script. */
function fakeEskiz(script: (path: string, form: URLSearchParams, auth: string | null) => Response) {
  const calls: { path: string; form: URLSearchParams; auth: string | null }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace("https://eskiz.test/api", "");
    const form = new URLSearchParams(String(init?.body ?? ""));
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ path, form, auth });
    return script(path, form, auth);
  }) as typeof fetch;
  return { calls, impl };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("EskizSmsProvider", () => {
  it("logs in once, then sends with the token (number without +)", async () => {
    const api = fakeEskiz((path) =>
      path === "/auth/login"
        ? json(200, { data: { token: "t1" } })
        : json(200, { id: "e-1", status: "waiting" }),
    );
    const sms = new EskizSmsProvider({
      email: "a@b.uz",
      password: "x",
      baseUrl: "https://eskiz.test/api",
      fetch: api.impl,
    });
    expect(await sms.send({ to: "+998901234567", text: "Kod: 1" })).toEqual({
      providerMessageId: "e-1",
    });
    await sms.send({ to: "+998901234567", text: "Kod: 2" });
    expect(api.calls.map((c) => c.path)).toEqual([
      "/auth/login",
      "/message/sms/send",
      "/message/sms/send",
    ]);
    expect(api.calls[1]!.auth).toBe("Bearer t1");
    expect(api.calls[1]!.form.get("mobile_phone")).toBe("998901234567");
    expect(api.calls[1]!.form.get("from")).toBe("4546");
  });

  it("renews an expired token once", async () => {
    let logins = 0;
    const api = fakeEskiz((path, _form, auth) => {
      if (path === "/auth/login") return json(200, { data: { token: `t${++logins}` } });
      return auth === "Bearer t2" ? json(200, { id: 7 }) : json(401, { message: "Expired" });
    });
    const sms = new EskizSmsProvider({
      email: "a@b.uz",
      password: "x",
      baseUrl: "https://eskiz.test/api",
      fetch: api.impl,
    });
    expect((await sms.send({ to: "+998901234567", text: "x" })).providerMessageId).toBe("7");
    expect(logins).toBe(2);
  });

  it("tells permanent errors from temporary ones", async () => {
    const send = async (status: number) => {
      const api = fakeEskiz((path) =>
        path === "/auth/login"
          ? json(200, { data: { token: "t" } })
          : json(status, { message: "no" }),
      );
      const sms = new EskizSmsProvider({
        email: "a@b.uz",
        password: "x",
        baseUrl: "https://eskiz.test/api",
        fetch: api.impl,
      });
      return sms.send({ to: "+998901234567", text: "x" }).catch((e: unknown) => e);
    };
    const bad = await send(400);
    expect(bad).toBeInstanceOf(EskizError);
    expect((bad as EskizError).permanent).toBe(true);
    expect(((await send(503)) as EskizError).permanent).toBe(false);
    expect(((await send(429)) as EskizError).permanent).toBe(false);
  });
});
