# 04 · Cross-cutting rules

These are non-negotiable. A PR that breaks one of these is wrong even if it works.

## Non-negotiable rules
• RLS on every table; tenant = `center_id` (`03-roles-permissions.md`)
• Money = `bigint` minor units, never floats
• Schedule logic in branch timezone
• All UI text via i18n (uz/ru/en)
• Payments & SMS behind adapters
• Schema changes start in `02-data-model.md`

## 1. Tenancy & RLS

> PROPOSED: the CI check for tables without RLS, the service-role ban in staff code, and per-table RLS tests including the other-center case.

- **RLS on every table.** A migration that creates a table without `enable row level security` and its policies fails review. A CI check scans for tables where RLS is off.
- The tenant key is `center_id`. It goes on every tenant row, including child tables.
- Never use the service role in staff-facing code paths. Allowed places are listed in `01` and `03`.
- Each new table ships with RLS tests: owner/admin/teacher of the center see what they should, **and a member of another center sees nothing**.

## 2. Money

> PROPOSED: the branded `Money` type, `formatMoney`, the single `prorate()` helper with round-half-up, rounding once at the end, "financial rows never deleted or updated in place", balances always computed.

- Money is `bigint` **minor units** (tiyin). Never floats, never `numeric` for stored money, never JS `number` maths on fractional values.
- In TypeScript, money is a branded `Money` (`bigint`) type from `packages/core/money`. Formatting happens only in `packages/i18n` (`formatMoney(amount, currency, locale)`), e.g. `1 250 000 so'm`.
- Division (proration, percentages) uses one helper, `prorate(amount, numerator, denominator)`, with **round-half-up** on minor units, then rounding to `centers.rounding_unit_amount` where the spec says so. Rounding happens once, at the end.
- Financial rows are **never deleted or updated in place** after creation (except charge recalculation, which goes through the RPC and is audited). Mistakes are voided or corrected with an adjustment.
- A balance is always **computed** (views), never stored as a column that can drift.

> PROPOSED (M3a): the lint rule `uteach/no-float-money` (apps/web) bans `parseFloat`, and `Number()` /
> `parseInt` / unary `+` on money-named values. Amounts reach RPC arguments only through `toDbAmount()`
> (`src/lib/money.ts`): the generated types declare `bigint` arguments as `number`, so it checks for a safe
> integer.

## 3. Time

> PROPOSED: `timestamptz` vs `date` storage rule, "today / this month / 48 h" computed in branch tz, no hardcoded `Asia/Tashkent`.

- Schedule logic runs in the **branch timezone** (`branches.timezone`), never server time and never UTC "days".
- Store instants as `timestamptz`. Store days as `date`. Convert at the edges using the branch timezone.
- "Today", "this month" and "within 48 h" are computed in the branch timezone (or the center timezone for center-wide jobs).
- Never hardcode `Asia/Tashkent` or `+05:00` outside defaults.

## 4. i18n

> PROPOSED: `uz` = Uzbek Latin, `en` as source catalog, CI completeness check, recipient → center locale order, user text not translated.

- **All UI text goes through next-intl** (`uz`, `ru`, `en`). No string literals in components, including error messages, toasts, PDF receipts and bot messages.
- `uz` means Uzbek Latin. Missing keys fail the build (`en` is the source catalog; CI checks `uz`/`ru` completeness).
- Notification templates are per-locale rows in `notification_templates`. The recipient's locale wins, then the center default.
- Names and free text that users enter are stored as typed and are not translated.

## 5. Adapters

> PROPOSED: the interface names and methods (`PaymentProvider`, `SmsProvider`, `MessagingChannel`) and the "no `if (country === 'UZ')`" rule.

- **Payments and SMS sit behind adapters** in `packages/adapters`. Core code never imports a provider SDK or URL.
  - `PaymentProvider`: `createPayLink`, `handleCallback`, `refund`, `verifySignature`
  - `SmsProvider`: `send(phone, templateId, text)`, `status(id)`
  - `MessagingChannel`: `telegram` now; `whatsapp` and `email` later (M18)
- Country-specific values (currency, phone format, providers, tax ids) come from center settings or adapters, never `if (country === 'UZ')` in business logic.

## 6. Schema changes

> PROPOSED: migrations forward-only, never edit applied migrations, two-step destructive changes, regenerate types.

- **Start in `02-data-model.md`**, then write the migration, then regenerate types (`supabase gen types`).
- Migrations only go forward. Never edit a migration that has been applied in staging or prod.
- Destructive changes (drop or rename a column) take two steps: add new → backfill → switch code → drop later.

## 7. Idempotency

> PROPOSED: unique constraints instead of select-then-insert; callbacks keyed by `(provider, provider_txn_id)`. Canvas says jobs are idempotent and the outbox dedupes.

- Every scheduled job and every external callback is idempotent, guaranteed by **unique constraints** (`on conflict do nothing/update`), not by "select then insert".
- Provider callbacks are keyed by `(provider, provider_txn_id)`.
- Notifications are deduped by `dedupe_key`.

## 8. Audit

> PROPOSED: the list of audited changes and append-only `audit_log`. Canvas: admin attendance edits audited, support view audited, "audit" in M7.

- Changes to money, attendance after the edit window, enrollments, memberships, prices, and super-admin support views write `audit_log`.
- `audit_log` is append-only.

## 9. Validation & errors

> PROPOSED: the `{ ok, data | error }` Server Action result shape and error codes mapped to i18n keys; "DB constraints are the final word".

- Every Server Action and API input is parsed with a **zod** schema shared with the form.
- Server Actions return `{ ok: true, data } | { ok: false, error: { code, fieldErrors? } }`. Error codes map to i18n keys.
- DB constraints are the final word. App validation is for nice messages, not correctness.

## 10. Data hygiene

> PROPOSED: phone normaliser in `packages/core`, archived rows hidden by default, no PII in logs. (E.164 and `archived_at` are canvas conventions.)

- Phones are normalised to E.164 on input (`packages/core/phone`, default country from center).
- Soft-delete master data with `archived_at`. Archived rows are hidden by default but still resolve in history.
- PII (phones, names) is never written to logs. Log ids instead.

## 11. Testing

> PROPOSED: the whole section. Canvas only names Vitest and Playwright.

- Pure logic in `packages/core` is unit tested: proration, FIFO, rounding, IELTS bands, pay rules, schedule expansion, and DST-safe time conversion.
- RLS and constraints are tested in SQL.
- One Playwright happy path per milestone (listed in `30-milestones.md`).

## 12. UX baselines

> PROPOSED: slow-3G target, 2 000-student lists, confirm dialogs, showing the resulting balance. Canvas: teacher pages mobile, owner/admin desktop.

- Teacher pages are mobile-first (one-handed, big tap targets, work on slow 3G).
- Owner and admin pages are desktop-first but must not break on a phone.
- Every list paginates or virtualises. Lists of 2 000 students must stay fast.
- Destructive actions confirm. Financial actions show the resulting balance before you confirm.

## 13. Scope discipline

> PROPOSED: "ideas go to 30 or Open questions, not into code". "Build strictly in this sequence" is on the canvas.

- Build **only the current milestone**. Ideas for later go to `30-milestones.md` or an "Open questions" section, not into code.
