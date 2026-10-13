import type { SmsMessage, SmsProvider, SmsResult } from "./index";

/**
 * Eskiz.uz (docs/spec/17-telegram-notifications.md): token login with email + password, the token kept in memory
 * and renewed once on a 401. Eskiz only delivers texts that match a template it has approved, so callers send
 * the approved wording with the values filled in.
 */
export type EskizConfig = {
  email: string;
  password: string;
  /** Sender name approved by Eskiz; "4546" is Eskiz's shared default. */
  from?: string;
  /** For tests; defaults to https://notify.eskiz.uz/api. */
  baseUrl?: string;
  fetch?: typeof fetch;
};

/** An Eskiz failure. `permanent` = retrying the same message won't help (bad number, text not approved …). */
export class EskizError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "EskizError";
  }
}

type EskizResponse = {
  id?: string | number;
  message?: string;
  status?: string;
  data?: { token?: string };
};

export class EskizSmsProvider implements SmsProvider {
  readonly name = "eskiz";
  private token: string | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: EskizConfig) {
    if (!config.email || !config.password)
      throw new Error("Eskiz needs ESKIZ_EMAIL and ESKIZ_PASSWORD");
    this.baseUrl = (config.baseUrl ?? "https://notify.eskiz.uz/api").replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? fetch;
  }

  private async post(path: string, form: Record<string, string>, auth: boolean) {
    const headers: Record<string, string> = {};
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(form),
    });
    const text = await response.text();
    let json: EskizResponse = {};
    try {
      json = text ? (JSON.parse(text) as EskizResponse) : {};
    } catch {
      json = { message: text.slice(0, 200) };
    }
    return { status: response.status, json };
  }

  private async login(): Promise<void> {
    const { status, json } = await this.post(
      "/auth/login",
      { email: this.config.email, password: this.config.password },
      false,
    );
    const token = json.data?.token;
    if (status !== 200 || !token) {
      throw new EskizError(`eskiz login failed (${status}): ${json.message ?? ""}`, status, false);
    }
    this.token = token;
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    if (!this.token) await this.login();
    const form = {
      mobile_phone: message.to.replace(/^\+/, ""),
      message: message.text,
      from: this.config.from ?? "4546",
    };
    let result = await this.post("/message/sms/send", form, true);
    if (result.status === 401) {
      await this.login();
      result = await this.post("/message/sms/send", form, true);
    }
    const { status, json } = result;
    if (status >= 200 && status < 300 && json.id !== undefined) {
      return { providerMessageId: String(json.id) };
    }
    // 4xx other than auth/rate limits: the request itself is wrong (number, unapproved text); 5xx/429: try later.
    const permanent = status >= 400 && status < 500 && status !== 401 && status !== 429;
    throw new EskizError(`eskiz send failed (${status}): ${json.message ?? ""}`, status, permanent);
  }
}
