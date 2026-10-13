# 17 · Telegram bot & notifications 🟩

Milestone: **M4** (bot linking & menu, outbox sender, Eskiz fallback, broadcasts, reminders). The outbox table and enqueue function exist from **M2**. WhatsApp and email adapters come in **M18**.
Tables: `telegram_links`, `bot_sessions`, `notification_templates`, `notification_outbox`, `broadcasts`, `system_heartbeats`.
Runs in `apps/worker`.

## Bot setup

> PROPOSED: one shared uteach bot until white-label in M18, `start=c_{slug}` deep links, single worker instance.

- **One uteach bot** at launch (e.g. `@uteach_bot`), shared by all centers. A white-label bot per center comes in M18.
- grammY, **long polling**, a single worker instance (SKIP LOCKED makes a second instance safe).
- Each center gets a deep link `t.me/uteach_bot?start=c_{center_slug}` to print and share. The start parameter sets `bot_sessions.active_center_id`.

> PROPOSED (M4 plan): two bots: a dev bot for local and staging, and `@uteach_bot` for production. The username
> comes from `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (web) and the token from `TELEGRAM_BOT_TOKEN` (worker). Bot
> texts (menus, replies, errors) live in the i18n catalogs under `bot.*` and are checked by `check:i18n`;
> outbox messages keep using `notification_templates`. The user's language is stored on their `telegram_links`
> rows and in `bot_sessions.state` before they're linked. Settings → Unlink sets `unlinked_at` on all the
> user's links. Staff who share their contact get linked through `memberships` and receive only staff alerts
> (`substitute_assigned`, `schedule_conflict`); they have no menu in M4. The Scores item says "coming soon"
> until M6.

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

> PROPOSED (M4 plan): the sender calls only `worker.*` functions (02). The pure parts live in
> `packages/core/notifications`: `renderTemplate` (ICU body + payload, money from minor units and dates in the
> center's locale and time zone), `pickChannel` (link → Telegram; approved SMS row + `sms_enabled` + under the cap
> → SMS; else `skipped`) and `backoff` (30 s, 2 min, 10 min, 1 h; `failed` after 5 attempts), with an SQL parity
> test for the backoff. Templates turned off (`is_enabled = false`, center override first) are `skipped`.
> `payment_received` is sent as a document: the receipt PDF from `packages/receipts` with the text as its
> caption. A shutdown signal stops claiming and lets in-flight sends finish (up to 10 s); anything left is
> recovered as stale.

> PROPOSED (M4a, as built): migration `m4_telegram`.
> - **Worker functions:** `worker.claim_outbox(limit)` returns each claimed row with what the sender needs (the
>   recipient's live chat id and bot language, their phone, the Telegram and SMS template in effect with
>   on/off and Eskiz id, the center's name, timezone, currency, SMS switch and SMS left this month). Before
>   claiming it skips (`skipped`, "settled") due `payment_reminder` / `payment_due_soon` rows whose debt was paid.
>   Also `mark_sent`, `mark_retry(id, error, min_delay_seconds)` (backoff in SQL, mirrored and parity-tested by
>   `outboxBackoffSeconds`), `mark_failed(id, error, telegram_blocked)`, `mark_skipped`, `recover_stale`,
>   `beat`, `link_contact`, `unlink(telegram_user_id)`, `set_locale`, `get/set/delete_session`, `bot_subjects`,
>   `bot_schedule`, `bot_attendance` (both at most 63 days), `bot_payments`.
> - **Channel choice** is `pickChannel` in `packages/core/notifications`. **Rendering** is `renderTemplate` in
>   `@uteach/i18n/notifications` (not core: formatting belongs with the locales and `formatMoney`). Payload keys
>   `amount`, `balance`, `debt` are money in minor units and `date`, `oldDate`, `dueDate`, `startDate`,
>   `oldestDueDate` are days; a broadcast's `bodies[locale]` replaces `body`. A test renders every system template
>   with its key's payload in every language.
> - **Staff alerts** are triggers: a substitution queues `substitute_assigned` to the substitute (undoing it
>   cancels the pending one); a new schedule conflict queues `schedule_conflict` to owners and branch admins with
>   `academics`, once per group per day.
> - **Broadcasts:** `status` is only `queued` or `cancelled`; delivery comes from the outbox (`broadcast_stats`).
>   `branch_ids` records the branches reached (admins see a broadcast only inside their branches). The audience
>   also takes `student_ids` (broadcast to a selection). Recipients `guardians` means guardians who receive
>   notifications, else the student.
> - Debtors' **last reminder** comes from the view `last_payment_reminders`. The per-phone OTP limit
>   (`private.otp_sends`) moves to M4b with the hook that uses it.

## SMS fallback (Eskiz)

> PROPOSED: which templates fall back to SMS, broadcasts by SMS only when chosen, a per-center monthly SMS cap. Canvas: Eskiz adapter, approved templates, OTP.

- `SmsProvider` adapter → Eskiz.uz API (token auth, refreshed automatically; credentials in Vault).
- Eskiz requires **pre-approved templates**. Only templates with `sms_provider_template_id` can go by SMS. Text must match the approved template exactly, with variables substituted.
- SMS is used for: auth OTP (through the Supabase hook, not the outbox), fallback for critical templates (`absence_alert`, `payment_reminder`, `lesson_cancelled`), and broadcasts only if explicitly chosen.
- SMS costs money. A per-center monthly SMS cap (setting) applies, and the count is shown in settings.

> PROPOSED (M4 plan): `EskizSmsProvider` in `packages/adapters/sms` logs in with `ESKIZ_EMAIL` /
> `ESKIZ_PASSWORD` (environment, see 01), keeps the token in memory and logs in again on a 401. The auth hook
> uses it when `SMS_PROVIDER=eskiz`; local and CI keep `console`, and tests use a fake Eskiz HTTP server. SMS
> rows are seeded with an empty Eskiz id, so nothing goes by SMS until the owner gets the templates approved
> and fills the ids. Free-text broadcasts can't match an approved template, so the SMS choice in the broadcast
> form is shown disabled until a center has an approved `broadcast` SMS template.

## Templates

> PROPOSED: the template key list, which are on/off by default, per-center overrides.

System defaults in uz/ru/en for: `absence_alert`, `late_alert`, `payment_received`, `payment_reminder`, `payment_due_soon`, `charge_created` (on by default with cycle billing: tells parents the next cycle is due; PROPOSED), `lesson_cancelled`, `lesson_moved`, `score_posted`, `trial_reminder`, `broadcast`. Centers can override text per locale (settings → Notifications) and enable or disable each key.

> PROPOSED (M3 plan): M3 seeds and queues `payment_received` (to guardians with `receives_billing`, else the
> student; payload: student, amount in minor units, currency, receipt number, balance after). `charge_created`,
> `payment_reminder` and `payment_due_soon` are seeded and queued in M4 with the reminder job.

> PROPOSED (M2 plan): M2 creates `notification_templates` and seeds Telegram rows in uz/ru/en for the keys it
> enqueues: `absence_alert`, `late_alert`, `lesson_cancelled`, `lesson_moved` and the new `lesson_added` (extra
> lesson). Each later milestone seeds its own keys. SMS rows (with `sms_provider_template_id`) and the
> settings → Notifications screen come in M4. `enqueue_notification()` and quiet hours are built in M2
> (`private.enqueue_notification`, callable only from other security-definer functions); the sender honours
> `is_enabled` from M4. A pgTAP test checks that every key M2 enqueues has a system template in all three locales.

## Broadcasts

> PROPOSED: recipient choice, per-locale text, SMS opt-in, scheduling, preview count, history. Canvas: by branch/group/course/debtors.

- Compose: audience (branches, groups, courses, **debtors**, recipients = guardians / students / both), text (per locale or a single text), channel (Telegram; SMS opt-in, with a cost warning), schedule now or later.
- The preview shows the recipient count and how many have no Telegram.
- Send: expands to outbox rows with `broadcast_id`; dedupe `broadcast:{id}:{recipient}`.
- History: delivered / failed counts.

> PROPOSED (M4 plan): staff create broadcasts through `create_broadcast()` and preview them with
> `preview_broadcast()` (02). "Debtors" means a negative balance today, and the preview and the queued rows use
> the same query, so the count matches. "Broadcast to selection" on Debtors and Students sends to the chosen
> students only (audience `student_ids`).

## Reminders

> PROPOSED: lesson reminders (off by default) and trial reminders. Canvas: "reminders" in M4.

- Payment reminders: see 15 (`enqueue_payment_reminders`).
- Lesson reminders (optional, off by default): 2 h before the first lesson after a change.
- Trial reminder: the day before a trial (when the lead has Telegram, M13).

## WhatsApp & email ⬜ (M18)
They're new `MessagingChannel` adapters, chosen per recipient like Telegram/SMS. No changes to enqueue callers.
