/**
 * SMS adapter (04-rules §5). Business code depends on `SmsProvider` only.
 * M0 ships the console provider for local development; Eskiz arrives in M4.
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

export type SmsProviderName = "console";

export function createSmsProvider(name: string | undefined): SmsProvider {
  switch (name ?? "console") {
    case "console":
      return new ConsoleSmsProvider();
    default:
      throw new Error(`SMS provider "${name}" is not available yet (Eskiz arrives in M4)`);
  }
}
