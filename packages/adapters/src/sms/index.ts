/**
 * SMS adapter (04-rules §5). Business code depends on `SmsProvider` only.
 * The console provider is for local development and tests; Eskiz (M4) for staging and production.
 */
export interface SmsMessage {
  /** E.164 phone number. */
  to: string;
  text: string;
}

export interface SmsResult {
  providerMessageId: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsResult>;
}

/** Prints messages to the server log instead of sending them. Never use in production. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";

  constructor(private readonly log: (line: string) => void = console.info) {}

  async send(message: SmsMessage): Promise<SmsResult> {
    const id = `console-${Date.now()}`;
    this.log(`[sms:console] to=${message.to} text=${JSON.stringify(message.text)}`);
    return { providerMessageId: id };
  }
}

export type SmsProviderName = "console" | "eskiz";

import { EskizSmsProvider } from "./eskiz";

export { EskizError, EskizSmsProvider, type EskizConfig } from "./eskiz";

/** Provider settings read from the environment (only the chosen provider's are needed). */
export type SmsEnv = {
  ESKIZ_EMAIL?: string | undefined;
  ESKIZ_PASSWORD?: string | undefined;
  ESKIZ_FROM?: string | undefined;
  ESKIZ_BASE_URL?: string | undefined;
};

export function createSmsProvider(name: string | undefined, env: SmsEnv = {}): SmsProvider {
  switch (name ?? "console") {
    case "console":
      return new ConsoleSmsProvider();
    case "eskiz":
      return new EskizSmsProvider({
        email: env.ESKIZ_EMAIL ?? "",
        password: env.ESKIZ_PASSWORD ?? "",
        ...(env.ESKIZ_FROM ? { from: env.ESKIZ_FROM } : {}),
        ...(env.ESKIZ_BASE_URL ? { baseUrl: env.ESKIZ_BASE_URL } : {}),
      });
    default:
      throw new Error(`unknown SMS provider "${name}"`);
  }
}
