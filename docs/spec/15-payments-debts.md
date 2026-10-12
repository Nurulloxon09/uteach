# 15 · Payments & debts 🟩 (online 🟨)

> Billing model (2026-10-10): **per lesson cycle from each student's start date** (option B) is the default and the only mode built in MVP. Calendar-month billing (option A) is in the appendix for later.

Milestones: **M3** (cycle charges, payments, receipts, balances, debtors, adjustments, voids); **M8** (Payme, Click, Uzum, pay links and codes, refunds, promo codes); **M13** (package billing).
Tables: `group_prices`, `charges`, `payments`, `balance_adjustments`, `accounts`, `receipt_sequences`, views `student_balances`, `charge_debts`, `debtors`; 🟨 `refunds`, `promo_codes`, `payment_provider_configs`, `payment_intents`, `provider_transactions`.
**Teachers never see anything in this module.**

## Cycle charges (default billing mode: `lesson_cycle`)

> ✅ CONFIRMED by owner (2026-10-10):
> - Billing is per **lesson cycle from each student's start date** (option B), not on the 1st of the month. Billing mode is a per-center setting (`centers.billing_mode`); only `lesson_cycle` is built in MVP. Calendar-month billing (option A) is kept in the appendix for later.
> - **Cycle length is set per group** (`group_prices.cycle_lessons`, default 12; e.g. 3×/week = 12, 2×/week = 8).
> - **Prepaid:** the student pays for a cycle before it starts.
> - **Freeze pauses the cycle:** lessons during a freeze don't count.
> - **Unexcused absences count** as used lessons (they are billed).
> - **One charge per enrollment** (2 groups = 2 separate charges).
> - **Leaving mid-cycle: each center decides** (`centers.leave_credit_policy`).

One charge per **enrollment** per **cycle**. A cycle is the next `cycle_lessons` **billable lessons** of that student in that group.

A lesson is **billable for a student** when: it belongs to the group, `status <> 'cancelled'` and `is_billable`, its local date is within `[enrollment.start_date, enrollment.end_date]`, and it is not inside an `enrollment_freeze`. Attendance does not matter: absent and excused lessons still count.

> PROPOSED: everything below this line in this section (formula and order, when the next charge is created, the due date rule, how cancellations/holidays/price changes behave, the leave policies' mechanics, transfer always crediting, credit rounding, the `calc` text).

### Formula (pure function `computeCycleCharge` in `packages/core/billing`)

```
price        = enrollment.price_override_amount ?? group_prices(effective at cycle start).price_amount   -- price of one full cycle
after_pct    = price − prorate(price, discount_bp, 10000)          -- round half up to tiyin
after_fixed  = max(0, after_pct − discount_amount)                 -- discount_amount is per cycle
amount       = roundToUnit(after_fixed, center.rounding_unit_amount) -- half up
```
No proration is needed at enrollment: the first cycle simply starts at the student's first billable lesson.

**Worked example 1:** price 600 000 UZS per 12-lesson cycle, 10% discount. In tiyin: 60 000 000 − 6 000 000 = 54 000 000 → already a multiple of 100 000 → **54 000 000 tiyin = 540 000 UZS**.
**Worked example 2:** price 550 000 UZS, 15% discount. 55 000 000 − 8 250 000 = 46 750 000 → rounded half up to 100 000 → **46 800 000 tiyin = 468 000 UZS**.

The `calc` jsonb stores every input and step so the UI can show "12 lessons · 600 000 → −10% → 540 000".

### Cycle boundaries (view `charge_cycles`)
- Billable lessons of an enrollment are numbered in time order. Cycle 1 takes the first N₁ lessons, cycle 2 the next N₂, and so on (N = `cycle_lessons` stored on each charge).
- The view shows per charge: `lessons_used` (billable lessons up to today), `lessons_left`, first lesson date and the **expected** last lesson date (from already generated lessons).
- Cycle end dates are **computed, never stored**. A cancelled-by-center lesson, a holiday or a freeze simply pushes the end of the cycle one lesson later. **The charge amount never changes because of schedule changes.**

### When charges are created
- **Enroll** (also lead conversion): the RPC creates cycle 1's charge immediately. `cycle_start_date` = the student's first billable lesson date.
- **Next cycle:** daily job `generate_cycle_charges` (center tz, early morning). For each active, non-frozen enrollment whose current cycle has its **last lesson today or earlier** and that has a next billable lesson, it creates the next cycle's charge. So parents get the new charge before the next cycle's first lesson. Idempotent via unique `(enrollment_id, cycle_no)`.
- `due_date = cycle_start_date + payment_due_days` (default 10).
- **Price or discount change** applies from the **next** cycle. The current cycle's charge keeps its stored price and discount.
- A wrong charge is **voided and reissued** (reason required, audited). Charges are never edited in place. `is_manual` charges (one-off fees) are outside the cycle logic.

> PROPOSED (M3 plan): if the student has no billable lesson yet (e.g. the group has no generated lessons),
> `enroll` creates no charge; `generate_cycle_charges` creates cycle 1 as soon as a billable lesson exists. The
> job runs hourly and acts per center at 00:30 local time (01); it is also called right after `enroll`,
> `save_schedule_rules` and a freeze ends, so staff see the charge without waiting. A reissue after a void takes
> the next free `cycle_no` slot of the voided one (the unique key covers open charges only).

### Leaving or moving mid-cycle
`unused_lessons = cycle_lessons − lessons_used` (counted up to the end date). Their value is `credit = prorate(charge.amount, unused_lessons, cycle_lessons)`, rounded half up to the tiyin (not to the rounding unit).
- **End** (completed / dropped / moved_level) follows `centers.leave_credit_policy`:
  - `credit`: a `balance_adjustments(kind='unused_lessons', +credit)` is created automatically.
  - `no_credit`: nothing is credited; the started cycle is fully paid.
  - `ask` (default): the End dialog shows "7 unused lessons = 315 000 so'm" and staff choose credit or no credit, with a reason. Audited.
  - Charges for cycles that haven't started yet are voided automatically.
- **Transfer** to another group always credits the unused lessons of the old group, then starts cycle 1 in the new group.
- Refunding credit as cash is a separate action (`refund`, 🟨 M8 for online; cash refunds are just recorded).

> PROPOSED (M3 plan): `end_enrollment(…, p_credit boolean default null)`: with policy `ask` the End dialog must
> send true or false (the RPC refuses null with `credit_choice_required`); with `credit` / `no_credit` the
> parameter is ignored. The dialog shows "N unused lessons = X" from the same SQL the RPC uses
> (`unused_lessons_preview`).

**Worked example 3 (leave):** cycle of 12 lessons charged 540 000 UZS (54 000 000 tiyin); the student leaves after 5 lessons → 7 unused → credit = 54 000 000 × 7/12 = **31 500 000 tiyin = 315 000 UZS**.

### Discounts

> ✅ CONFIRMED by owner (2026-10-10): 10% admin cap.

> PROPOSED: percent + fixed with required reason, sibling discount = manual discount.

Percent (`discount_bp`) and/or a fixed amount per cycle, with a required reason. Admins without `discounts` are capped at 10%. Sibling discount is just a discount with reason "sibling" (no automation in MVP).

## Record payment + receipt

> PROPOSED: dialog flow, default accounts per method, 7-day backdating, receipt number format `{BRANCH}-{YYYY}-{000123}`, 80 mm + A4 layouts, `payment_received` notification, payments go to the student balance (not a specific charge). Canvas: cash/card/transfer, receipt numbers, PDF.

- Dialog from the student profile, debtors list, or global "+ Payment": student → amount (prefilled with the current debt) → method (**cash / card / transfer**) → account (defaults: cash → branch cash; card → branch terminal; transfer → bank) → date (default now; backdating allowed up to 7 days without `void` flag) → payer name → note.
- It shows the **resulting balance** before confirming.
- On save: `record_payment` RPC → receipt number `next_receipt_no(branch)` → `{BRANCH_CODE}-{YYYY}-{000123}` → PDF receipt generated (server, localized, center logo) → stored in `receipts/` → `payment_received` notification enqueued to guardians and the student.
- Receipt: print (80 mm thermal and A4 layouts), download, or send to Telegram.
- Payments go to the student's overall balance, not to a specific charge. They're allocated **FIFO** (oldest due date first) for display and aging.

> PROPOSED (M3 plan): receipts are rendered **on demand** by `/[locale]/receipts/[paymentId]?size=80mm|a4`
> (staff session, RLS) from the payment row, so a voided payment's receipt says VOID and nothing goes stale;
> `receipt_path` stays null until M4 decides whether the bot needs stored copies. The PDF code lives in
> `packages/receipts` so the worker can reuse it. Payer name defaults to the primary guardian. Backdating beyond
> 7 days needs `void`.

## Balances & debtors

> PROPOSED: balance formula, aging buckets 0–30/31–60/61–90/90+, debtors list columns and actions, "due soon" reminder 2 days before. Canvas: FIFO oldest due date, aging, reminders every N days → debtors list → call.

- `balance = payments + adjustments − charges` (open, non-voided). Negative = debt, positive = prepaid credit.
- **FIFO:** credits cover the oldest-due charges first. `charge_debts` gives the outstanding amount per charge and its days overdue.
- **Debtors list:** students with balance < 0, showing debt, oldest unpaid due date, days overdue, aging bucket (0–30, 31–60, 61–90, 90+), guardian phone, last payment, last reminder. Filters: branch, group, course, bucket. Actions: call (tel: link), send reminder, record payment, broadcast to selection. Export.
- **Reminders:** `enqueue_payment_reminders` daily. Students with outstanding debt past due_date get a reminder every `reminder_every_days` (dedupe key `reminder:{student}:{date}`). There's also a "due soon" reminder 2 days before due_date (setting, default on). Templates include the amount and (🟨) a pay link.

## Adjustments & voids

> PROPOSED: who can do each action, the void rules (reason required, closed-kassa days owner-only), "nothing financial is ever deleted", correction adjustments. Canvas: waive month (now: waive cycle), opening balances, write-offs.

| Action | Who | Effect |
|---|---|---|
| **Waive cycle** | `adjustments` | adjustment `waive` = +outstanding of that charge (or void the charge if nothing paid; audited) |
| **Opening balance** | import / `adjustments` | adjustment `opening_balance` (± amount) |
| **Write-off** | `adjustments` | adjustment `write_off` = +debt; student usually archived |
| **Correction** | `adjustments` | any signed amount, with a reason |
| **Void payment** | `void` | `voided_at`, reason required; the receipt is marked VOID; the balance recomputes. A payment in a closed kassa day can only be voided by the owner. |
| **Void charge** | `void` | `status='void'`, reason required |

Nothing financial is ever deleted.

## Online payments 🟨 (M8)

> PROPOSED: endpoint paths, idempotency key, `pay_code`, fixed vs open amounts, refund mechanics, promo `applies_months`. Canvas: center's own merchant; Payme JSON-RPC, Click Prepare/Complete, Uzum; pay links & codes; refunds, promo codes.

Each center connects **its own merchant** (uteach doesn't hold client money).
- **Payme** (Merchant API, JSON-RPC): `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction`, `GetStatement`. Basic-auth with merchant key. Account field = `pay_code`.
- **Click** (SHOP API): `Prepare` and `Complete` with MD5 `sign_string` verification. `merchant_trans_id` = `pay_code`.
- **Uzum** (Merchant API): check / create / confirm / reverse / status.
- Endpoints: `/api/pay/payme`, `/api/pay/click/prepare`, `/api/pay/click/complete`, `/api/pay/uzum/*`. Each verifies the signature, resolves the center by merchant config, and is **idempotent** by `(provider, provider_txn_id)`.
- On perform/complete: create `payments(method='online', account = provider account)` + receipt + notification, in one transaction with the provider transaction update.
- **Pay links & codes:** `payment_intents` with a short numeric `pay_code`. Parents pay by link (from bot/Mini App) or by entering the code in the Payme/Click app ("uteach / <center>" service). The amount can be fixed (the intent amount) or open (any amount for the student). Configurable per provider.
- **Refunds:** `refunds` row → provider refund call where supported (Payme `CancelTransaction` after perform) → `balance_adjustments(kind='refund', amount=−x)`. Cash refunds are just recorded.
- **Promo codes:** applied at enrollment (or lead conversion) → sets the enrollment discount for `applies_months` months; `used_count` increments atomically; `max_uses` enforced.

## Package billing 🟨 (M13): to reconsider

> PROPOSED: with cycle billing as the default, a "package" is just **a cycle that does not renew automatically** (e.g. a 24-lesson intensive). Decide in M13 planning whether this is still needed.

---

## Appendix: `calendar_month` mode (option A, not in MVP)

Kept from the first draft for centers that bill on the 1st of each month. Build only when a center needs it.

### Monthly charges
One charge per **enrollment** per **month** (`period_month` = 1st of month).

#### Formula (pure function `computeCharge` in `packages/core/billing`)

> PROPOSED: the exact formula and order (prorate → % discount → prorated fixed discount → round to unit), zero-lesson months still get a 0 charge, unexcused absences billed, the `calc` explanation. Canvas: prorated by lessons, discounts, rounding.

```
price            = enrollment.price_override_amount ?? group_prices(effective for month).price_amount
lessons_total    = count(lessons of group in month where is_billable and status <> 'cancelled')
lessons_billable = count(those lessons where local_date within [enrollment.start_date, coalesce(end_date, ∞)]
                   and not inside an enrollment_freeze)
gross            = prorate(price, lessons_billable, lessons_total)     -- round half up to tiyin
after_pct        = gross − prorate(gross, discount_bp, 10000)
after_fixed      = max(0, after_pct − prorate(discount_amount, lessons_billable, lessons_total))
amount           = roundToUnit(after_fixed, center.rounding_unit_amount)   -- half up
discount_amount  = gross − after_fixed      -- stored column; rounding difference is visible in calc
```
The fixed monthly discount is prorated like the price, so half a month gets half the fixed discount.
- If `lessons_total = 0` (whole month holidays), the charge is 0 and still exists (status open, amount 0) for transparency.
- A full month with no changes gives `amount = price − discounts`, exactly; proration never shaves a full month.
- Unexcused absences don't reduce the charge (open question in 02).
- The `calc` jsonb stores every input and step so the UI can show "12 of 13 lessons × 600 000 = 553 846 → −10% → 498 462 → rounded 498 000".

**Worked example:** price 600 000 UZS, 13 lessons in the month, enrolled from lesson 2 → 12 billable. In tiyin: price 60 000 000 × 12/13 = 55 384 615.38 → gross **55 384 615**. 10% discount: 55 384 615 × 1000/10000 = 5 538 461.5 → 5 538 462 (half up), so 55 384 615 − 5 538 462 = **49 846 153**. Rounded to the unit 100 000 (1 000 UZS) → **49 800 000 tiyin = 498 000 UZS**.

#### When charges are created or recalculated

> PROPOSED: recalculation also on price/discount change, center-cancelled lessons and holidays; manual charges; month lock with auto-lock 10 days after month end and corrections instead; due-date rule. Canvas: charge on the 1st; enroll/freeze/transfer/end recalculate.

- **pg_cron `generate_monthly_charges`** on the 1st (center tz): for each enrollment active at any point in the month → upsert the charge. It's idempotent via unique (enrollment_id, period_month).
- **Enroll / freeze / transfer / end / price override / discount change / lesson cancelled-by-center / holiday added** → `recalculate_charge(enrollment_id, month)` for each affected month.
- Charges with `is_manual` are never recalculated. Charges whose `locked_at` is set (month closed) aren't changed; the difference goes into a `balance_adjustments(kind='correction')` with the reason.
- Month lock: the owner closes a month (or auto-lock 10 days after month end, configurable later). In MVP, auto-lock only.
- `due_date = period_month + payment_due_days`. For a mid-month enrollment, `due_date = max(start_date, period due date)`.

