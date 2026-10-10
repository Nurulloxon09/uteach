import { createSmsProvider } from "@uteach/adapters";
import { defaultLocale, isLocale } from "@uteach/i18n";
import { createTranslator } from "next-intl";
import { Webhook } from "standardwebhooks";
import { messagesByLocale } from "@/i18n/messages";
import { serverEnv } from "@/lib/env";

/**
 * Supabase Auth "Send SMS" hook: Auth calls this with the OTP, we send it through the SMS adapter.
 * M0 uses the console provider (the code appears in the server log); Eskiz plugs in at M4.
 */
type SendSmsEvent = {
  user: { phone: string; user_metadata?: { locale?: string } };
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

  const requested = event.user.user_metadata?.locale;
  const locale = isLocale(requested) ? requested : defaultLocale;
  const t = createTranslator({ locale, messages: messagesByLocale[locale], namespace: "sms" });

  try {
    await createSmsProvider(env.SMS_PROVIDER).send({
      to: `+${event.user.phone.replace(/^\+/, "")}`,
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
