# 19 · Finance & expenses 🟨

Milestone: **M11**. (The `accounts` table already exists from M3 with simple defaults.)
Tables: `accounts`, `expense_categories`, `expenses`, `account_transfers`, `cash_closings`, view `account_balances`.
Permissions: `finance` (everything), `cash_closing` (daily closing for own branch). The owner has all.

## Accounts

> PROPOSED: the balance formula and opening balance via an "Opening" system account. Canvas: cash per branch, terminal, bank, online.

Kinds: **cash** (one per branch, the kassa), **terminal** (card POS, per branch), **bank** (center-level), **online** (one per provider). Balance = payments in − refunds − expenses ± transfers (`account_balances` view). Opening balance is entered once as a transfer from "Opening" (a system account).

## Expenses & transfers

> PROPOSED: seeded categories, one level of nesting, auto-created payroll expenses, void-only, closed-day lock. Canvas: categories, attachments, transfers.

- **Expense:** branch, account, category, amount, date, description, attachment (photo of receipt). Categories are seeded (Rent, Salaries/Payroll [system], Utilities, Marketing, Supplies, Taxes, Other) and editable, with one level of nesting.
- Payroll runs marked paid create expenses automatically (category Payroll, non-editable, voided only by voiding the run payment).
- **Transfer:** from account → to account (e.g. cash → bank deposit, terminal → bank settlement). Never counts as income or expense.
- Voids only, no deletes. Voiding is blocked for days that are already kassa-closed (owner override).

## Kassa closing (daily cash count)

> PROPOSED: the expected-amount formula, note required on difference, day lock, 20:00 reminder, history. Canvas: daily cash count.

- Per cash account per business day (branch tz). `expected = opening (last closing's counted) + cash payments − cash refunds − cash expenses ± transfers`.
- The admin enters the counted amount. If the difference isn't 0, a note is required. Saving locks the day (see 02).
- Reminder (staff alert) at 20:00 if the day has cash movement and no closing.
- History shows differences over time per admin.

## P&L

> PROPOSED: accrual vs cash revenue views, shared expenses not allocated, export. Canvas: profit per branch.

- Monthly per branch and total. **Revenue:** two views, *accrual* (charges) and *cash* (payments). **Expenses** by category. **Profit** = revenue − expenses.
- Shared center-level expenses (no branch) are shown separately and not allocated (allocation rules come later).
- Export to Excel.
- Read-only for `finance` and the owner.
