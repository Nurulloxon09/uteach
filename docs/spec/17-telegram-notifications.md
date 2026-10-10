# 17 · Telegram bot & notifications 🟩

Milestone: **M4** (bot linking & menu, outbox sender, Eskiz fallback, broadcasts, reminders). The outbox table and enqueue function exist from **M2**. WhatsApp and email adapters come in **M18**.
Tables: `telegram_links`, `bot_sessions`, `notification_templates`, `notification_outbox`, `broadcasts`, `system_heartbeats`.
Runs in `apps/worker`.

## Bot setup

> PROPOSED: one shared uteach bot until white-label in M18, `start=c_{slug}` deep links, single worker instance.

- **One uteach bot** at launch (e.g. `@uteach_bot`), shared by all centers. A white-label bot per center comes in M18.
- grammY, **long polling**, a single worker instance (SKIP LOCKED makes a second instance safe).
- Each center gets a deep link `t.me/uteach_bot?start=c_{center_slug}` to print and share. The start parameter sets `bot_sessions.active_center_id`.

## Bot linking

> PROPOSED: language picker first, rejecting forwarded contacts, matching across all centers, the no-match reply, center switcher, blocking the bot → `unlinked_at`. Canvas: share contact → linked to students/guardians/staff.

1. `/start` → language picker (uz / ru / en) → "Share your phone number" (a `request_contact` keyboard button).
2. The contact is verified: `message.contact.user_id === message.from.id`. Otherwise the bot rejects it ("please share your own number").
3. The phone is normalised to E.164 and matched against `students.phone`, `guardians.phone` and active `memberships` (via `profiles.phone`) across all centers (service role).
4. A `telegram_links` row is created for each match, and the bot replies "Linked: Ali (IELTS-2, Center X), Madina (Kids-1, Center X)".
5. No match: "We couldn't find you. Ask your center to add this number." 🟨 M13 adds an "Enquire" button that creates a lead.
6. If the user is linked to several centers, a center switcher appears in the menu.
7. Blocking the bot (`my_chat_member` → kicked) sets `unlinked_at`, and the outbox skips Telegram for that link (SMS fallback applies).

## Bot menu (students / parents)

> PROPOSED: the contents of each menu item, the Settings item, Pay and Open-app buttons. Canvas: schedule, attendance, payments, scores.

Inline keyboard. A parent with several children picks a child first.
- 📅 **Schedule**: this week's lessons (time, room, teacher), with cancellations marked.
- ✅ **Attendance**: this month's marks and %.
- 💳 **Payments**: balance, open charges, last 5 payments, receipt PDFs. 🟨 "Pay" button (pay link).
- 📊 **Scores**: latest results vs target, and a chart image.
- ⚙️ **Settings**: language, unlink.
- 🟨 "Open app" button → Mini App (M9).

## Bot for staff

> PROPOSED: the alert list and "no data-entry flows in the bot". Canvas: staff alerts.

Staff alerts only in MVP: new lead assigned (M13), substitute assigned, conflicts detected, daily "today" summary for admins (optional). There are no data-entry flows in the bot.

## Outbox pipeline

> PROPOSED: `enqueue_notification()` design, channel chosen at send time, locale order, the claim SQL (limit 50), Telegram rate limits, backoff 30 s/2 min/10 min/1 h, max 5 attempts, permanent error → SMS fallback, 2-min stale-lock recovery, 30 s heartbeat. Canvas: templates uz/ru/en, quiet hours, retries, dedupe; sender every 5 s with SKIP LOCKED.

**Enqueue:** `enqueue_notification(center_id, template_key, recipient subject, payload, dedupe_key, send_after)` (SQL, security definer):
- Resolves recipients: a student, plus guardians with `receives_notifications` (or `receives_billing` for payment templates).
- Creates one row per recipient **subject** (student / guardian / membership). The channel is **not** chosen at enqueue time, so rows enqueued in M2 (before any Telegram links exist) are still valid when M4 starts sending.
- Locale: guardian locale → center default (the sender refines it with the link locale).
- **Quiet hours:** if `send_after` falls within the center's quiet hours (center tz), it's pushed to the end of quiet hours. Exception: OTP (it isn't in the outbox anyway).
- **Dedupe:** `on conflict (center_id, dedupe_key) do nothing`.

**Send (worker, every 5 s):**
```sql
update notification_outbox set status='sending', locked_at=now(), attempts=attempts+1
where id in (select id from notification_outbox
             where status='pending' and send_after <= now()
             order by send_after limit 50
             for update skip locked)
returning *;
```
- **Pick the channel** (if `channel` is null): **Telegram** if the subject has an active `telegram_links` row (fills `telegram_chat_id`), otherwise **SMS** if the template has an approved SMS version and SMS is enabled for the center (fills `phone`), otherwise `skipped`.
- Render: template body (ICU) + payload, formatted with the center locale's money and date formats.
- Telegram: `sendMessage` (or `sendDocument` for receipts). Telegram rate limits are respected (~25 msg/s global, 1 msg/s per chat), and a 429 means waiting `retry_after`.
- Success: `sent`, `sent_at`, `provider_message_id`.
- Failure: if retryable, back to `pending` with `send_after = now() + backoff(attempts)` (30 s, 2 min, 10 min, 1 h); after 5 attempts, `failed`. On a permanent Telegram error (bot blocked, chat not found), mark the link `unlinked_at`, set the row to `failed`, and **enqueue an SMS fallback** (`fallback_of_id`) if an SMS template exists.
- Stale `sending` rows (locked over 2 min ago) return to `pending` (worker crash recovery).
- Heartbeat: `system_heartbeats('worker')` every 30 s.

## SMS fallback (Eskiz)

> PROPOSED: which templates fall back to SMS, broadcasts by SMS only when chosen, a per-center monthly SMS cap. Canvas: Eskiz adapter, approved templates, OTP.

- `SmsProvider` adapter → Eskiz.uz API (token auth, refreshed automatically; credentials in Vault).
- Eskiz requires **pre-approved templates**. Only templates with `sms_provider_template_id` can go by SMS. Text must match the approved template exactly, with variables substituted.
- SMS is used for: auth OTP (through the Supabase hook, not the outbox), fallback for critical templates (`absence_alert`, `payment_reminder`, `lesson_cancelled`), and broadcasts only if explicitly chosen.
- SMS costs money. A per-center monthly SMS cap (setting) applies, and the count is shown in settings.

## Templates

> PROPOSED: the template key list, which are on/off by default, per-center overrides.

System defaults in uz/ru/en for: `absence_alert`, `late_alert`, `payment_received`, `payment_reminder`, `payment_due_soon`, `charge_created` (on by default with cycle billing: tells parents the next cycle is due; PROPOSED), `lesson_cancelled`, `lesson_moved`, `score_posted`, `trial_reminder`, `broadcast`. Centers can override text per locale (settings → Notifications) and enable or disable each key.

## Broadcasts

> PROPOSED: recipient choice, per-locale text, SMS opt-in, scheduling, preview count, history. Canvas: by branch/group/course/debtors.

- Compose: audience (branches, groups, courses, **debtors**, recipients = guardians / students / both), text (per locale or a single text), channel (Telegram; SMS opt-in, with a cost warning), schedule now or later.
- The preview shows the recipient count and how many have no Telegram.
- Send: expands to outbox rows with `broadcast_id`; dedupe `broadcast:{id}:{recipient}`.
- History: delivered / failed counts.

## Reminders

> PROPOSED: lesson reminders (off by default) and trial reminders. Canvas: "reminders" in M4.

- Payment reminders: see 15 (`enqueue_payment_reminders`).
- Lesson reminders (optional, off by default): 2 h before the first lesson after a change.
- Trial reminder: the day before a trial (when the lead has Telegram, M13).

## WhatsApp & email ⬜ (M18)
They're new `MessagingChannel` adapters, chosen per recipient like Telegram/SMS. No changes to enqueue callers.
