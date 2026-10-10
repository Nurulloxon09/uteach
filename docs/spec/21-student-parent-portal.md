# 21 · Student & parent portal 🟨

Milestone: **M9** (Telegram Mini App). Pay in app needs M8. A native app only comes if Telegram isn't enough (not planned).

## Telegram Mini App

> PROPOSED: the `/[locale]/tg` path, HMAC check with 24 h `auth_date` limit, service-role queries filtered by `student_id` + `center_id` as the only data path, Telegram theme. Canvas: initData-verified, per-student scope.

- Served by `apps/web` at `/[locale]/tg`, opened from the bot's "Open app" button (WebApp).
- **Auth:** on every API call the client sends `Telegram.WebApp.initData`. `/tg/api` verifies the HMAC with the bot token (per Telegram's spec), checks `auth_date` is under 24 h old, and resolves `telegram_user_id` → active `telegram_links`.
- **Per-student scope:** every request names a `student_id`. The server checks it is reachable from that Telegram user's links (the student themself, or a guardian of it). Then it queries with the service role **filtered by that student_id and center_id**. This is the only data path; there's no generic query endpoint.
- Uses the Telegram theme params (light/dark) and locale from the link.

## Screens

> PROPOSED: the whole screen list, including notification preferences.

- **Child switcher** (parents with several students, possibly across centers).
- **Home:** next lesson, balance (debt highlighted), last attendance, latest score vs target.
- **Schedule:** week view, cancellations and moves marked.
- **Attendance:** month calendar with P/L/A/E and %.
- **Payments:** balance, charges by cycle (lessons used / left in the current cycle), payments, receipts (PDF).
- **Scores:** chart vs target and exam date, results list.
- **Settings:** language, notification preferences (per template group: attendance, payments, scores), unlink.

## Pay in app

> PROPOSED: amount choice, provider choice including Uzum, `payment_intent`, receipt via the bot. Canvas: opens Payme/Click link.

"Pay" → choose an amount (debt prefilled, or any) → choose provider (enabled ones) → creates a `payment_intent` → opens the Payme/Click/Uzum pay link (`Telegram.WebApp.openLink`). After the provider callback, the bot sends the receipt and the Mini App refreshes the balance.

## Native app

> PROPOSED: reasons that would trigger it and re-using `/tg/api` with phone OTP. Canvas: only if Telegram isn't enough.

Only if Telegram isn't enough (e.g. push reliability, app-store presence demanded by centers). It would reuse `/tg/api`, just with a different auth (phone OTP).
