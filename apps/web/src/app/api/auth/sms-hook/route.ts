import { createHash } from "node:crypto";
import { createSmsProvider } from "@uteach/adapters";
import { defaultLocale, isLocale } from "@uteach/i18n";
import { createTranslator } from "next-intl";
import { Webhook } from "standardwebhooks";
import { messagesByLocale } from "@/i18n/messages";
import { isDemoAccount } from "@/lib/demo";
import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Supabase Auth "Send SMS" hook: Auth calls this with the OTP, we send it through the SMS adapter: the console
 * provider locally (the code appears in the server log), Eskiz in staging and production (M4). Each phone gets
 * at most 5 codes an hour (10), counted by `record_otp_send` with the secret key when it is configured. The teacher
 * demo's accounts never get a code (10), so nobody can reset their password or move them to another phone.
 */
type SendSmsEvent = {
  user: {
    phone: string;
    user_metadata?: { locale?: string };
    app_metadata?: Record<string, unknown>;
  };
  sms: { otp: string };
};

export async function POST(request: Request) {
  const env = serverEnv();
  const payload = await request.text();
  let event: SendSmsEvent;
  try {
    const webhook = new Webhook(env.SEND_SMS_HOOK_SECRET.replace("v1,whsec_", ""));
    event = webhook.verify(payload, Object.fromEntries(request.headers)) as SendSmsEvent;
  } catch {
    return Response.json(
      { error: { http_code: 401, message: "invalid signature" } },
      { status: 401 },
    );
  }

  if (isDemoAccount(event.user)) {
    return Response.json(
      { error: { http_code: 403, message: "demo accounts don't receive codes" } },
      { status: 403 },
    );
  }

  const to = `+${event.user.phone.replace(/^\+/, "")}`;
  if (env.SUPABASE_SECRET_KEY) {
    const phoneHash = createHash("sha256").update(to).digest("hex");
    const { data: allowed, error } = await createServiceClient(env.SUPABASE_SECRET_KEY).rpc(
      "record_otp_send",
      { p_phone_hash: phoneHash },
    );
    if (error) {
      return Response.json(
        { error: { http_code: 500, message: "otp limit check failed" } },
        { status: 500 },
      );
    }
    if (!allowed) {
      return Response.json(
        { error: { http_code: 429, message: "too many codes for this phone, try again later" } },
        { status: 429 },
      );
    }
  }

  const requested = event.user.user_metadata?.locale;
  const locale = isLocale(requested) ? requested : defaultLocale;
  const t = createTranslator({ locale, messages: messagesByLocale[locale], namespace: "sms" });

  try {
    await createSmsProvider(env.SMS_PROVIDER, env).send({
      to,
      text: t("otp", { code: event.sms.otp }),
    });
  } catch {
    return Response.json(
      { error: { http_code: 500, message: "sms send failed" } },
      { status: 500 },
    );
  }
  return Response.json({});
}
