# 23 · Growth ⬜

Milestones: **M15** (referrals, campaigns, public center page); **M16** (public REST API, signed webhooks); **M18** (expansion).
Tables: `referral_codes`, `referrals`, `saved_audiences`, `api_keys`, `webhook_endpoints`, `webhook_deliveries`.

## Referrals (M15)

> PROPOSED: the link formats, "qualified" = converted **and** paid first charge, reward as a balance credit, the anti-abuse rules (12-month newness, own/guardian phones, monthly cap, admin reject). Canvas: codes, auto rewards, anti-abuse; referral → new lead.

- Each student or guardian gets a code and a link (`t.me/uteach_bot?start=r_{code}` and a public-page link). They're shared from the bot or Mini App.
- A new lead with a code gets `referrals(status='pending')`, which becomes `qualified` when the lead converts **and** pays their first charge, and then the reward is applied automatically: a `balance_adjustments(kind='promo')` credit to the referrer (amount or % per center rule). `rewarded`.
- **Anti-abuse:** the referred phone must be new to the center (not an existing lead or student in the last 12 months); it can't be the referrer's own or their guardians' phones; there's a monthly cap per referrer; admins can reject with a reason.

## Campaigns & public page (M15)

> PROPOSED: campaign click tracking, re-engage as the main use, public page URL and contents. Canvas: saved audiences, trial sign-up form, public center page, re-engage lost leads later.

- **Saved audiences:** reusable filters (e.g. "lost leads, reason = price, last 90 days", "ended students IELTS"), used by broadcasts and campaigns.
- **Campaigns:** a broadcast to a saved audience with tracking (link clicks → leads with `source_detail = campaign`). "Re-engage lost leads" is the main use.
- **Public center page:** `/{locale}/c/{slug}`: about, branches with a map, courses and levels (prices optional), schedule of forming groups, a **trial sign-up form** (→ lead, `source='web_form'`), and Telegram contact. SEO basics.

## Upcoming events page (from brainstorm, unscheduled)

> PROPOSED: the feature description. It comes from your Brainstorming note, not the canvas.

A page listing center events (open days, mock exam days, competitions) on the public page and in the Mini App. *Not yet assigned to a milestone; decide when planning M15.*

## API & webhooks (M16)

> PROPOSED: endpoint list, key format `ut_live_…`, scope names, hashing, rate limits, OpenAPI from zod, the event list, signature header format, 24 h retries. Canvas: public REST API, scoped keys, signed deliveries.

- **Public REST API** `/api/v1/…`: students, groups, enrollments, lessons, attendance, payments (read), leads (read/write). Auth is `Authorization: Bearer ut_live_…`. Keys are scoped (`students:read`, `leads:write`, …), only hashes are stored, and the key is shown once. Rate-limited per key. OpenAPI spec is generated from the zod schemas.
- **Webhooks:** events `lead.created`, `student.created`, `enrollment.created|ended`, `payment.created|voided`, `attendance.marked`. Each delivery is signed: `X-Uteach-Signature: t=…, v1=HMAC-SHA256(secret, t + "." + body)`. Retries with backoff for 24 h, and the delivery log is visible in settings.

## Expansion (M18)

> PROPOSED: `kk` locale, KZT, a local KZ SMS adapter, **email in M18**, multi-bot worker with `bot_id`, "only adapters, locales and settings". Canvas: KZ (Kaspi), WhatsApp, Stripe, white-label bot; WhatsApp & email adapters for expansion.

- **Kazakhstan:** `kk`/`ru` locales, KZT, **Kaspi** payment adapter, local SMS adapter.
- **WhatsApp** (Cloud API) and email channels as `MessagingChannel` adapters.
- **Stripe** adapter for international centers.
- **White-label bot:** a center provides its own bot token. The worker runs multiple bots, and the links and outbox carry `bot_id`.
These should need **only new adapters, locales and settings**. If expansion needs core changes, that's a bug in an earlier milestone (rule 04-5).
