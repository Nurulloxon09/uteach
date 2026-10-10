import { describe, expect, it } from "vitest";
import { ConsoleSmsProvider, createSmsProvider } from "./index";

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

  it("refuses providers that don't exist yet", () => {
    expect(() => createSmsProvider("eskiz")).toThrow(/M4/);
  });
});
