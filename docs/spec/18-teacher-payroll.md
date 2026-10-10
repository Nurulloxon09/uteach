# 18 · Teacher payroll 🟨

Milestone: **M10**.
Tables: `teacher_pay_rules`, `payroll_runs`, `payroll_items`, `payroll_adjustments`. Paid runs create `expenses` (M11). If M11 isn't built yet, `paid` only records `paid_at`, and expenses are backfilled when M11 lands.
Permission: `payroll` flag. Teachers see only their own approved and paid items.

## Pay rules

> PROPOSED: several rules per teacher with scopes and validity, "per student" read as **per student-lesson attended**, fixed pay prorated by days, substitutes counted for the substitute, % of payments allocated by FIFO, cancelled lessons excluded. Canvas: fixed, per lesson, per student, % of payments/charges; payroll based on held lessons.

One teacher can have several rules at once (e.g. fixed + per lesson), scoped to all groups, a course, or a single group. Each rule has `valid_from` / `valid_to`.

| Kind | Basis for the month | Amount |
|---|---|---|
| `fixed_monthly` | — | `amount` (prorated by days if `valid_from/to` cut the month) |
| `per_lesson` | count of `held` lessons where the teacher was `teacher_membership_id` (substitutes count for the substitute) | `amount × lessons` |
| `per_student_lesson` | Σ over held lessons of students marked present or late | `amount × student_lessons` |
| `percent_of_payments` | payments (non-voided) in the month from students in the teacher's groups, allocated by FIFO to charges of those groups | `rate_bp × basis / 10000` |
| `percent_of_charges` | charges (open) of the teacher's groups whose `cycle_start_date` falls in the month | `rate_bp × basis / 10000` |

- Cancelled lessons don't count. Makeup lessons count if held.
- Group scope: the rule applies only to lessons, charges and payments of that group or course.
- Pure function `computePayroll(rules, facts)` lives in `packages/core/payroll`, with unit tests per kind.

## Monthly runs

> PROPOSED: items + adjustments, recompute in draft, approve freezes and makes it visible to teachers, one run per center/branch/month, "Payroll" expense category, the paid ✓/✗ view (from your Brainstorming note, not the canvas). Canvas: draft → approved → paid (creates expenses).

`draft → approved → paid`
1. **Create run** for a month (and optionally a branch). It computes `payroll_items` (one per teacher per rule, with `basis` jsonb for explainability).
2. **Draft:** the owner or payroll admin reviews and adds `payroll_adjustments` (bonus +, penalty / advance −, with a reason). "Recompute" refreshes items (adjustments are kept).
3. **Approve:** the run is frozen, and teachers can now see their breakdown.
4. **Mark paid:** choose an account → creates `expenses` (category "Payroll", one per teacher, linked to `payroll_run_id`). This answers the brainstorm question *"oylik berildimi yo'qmi"* (was salary paid or not): each teacher shows paid ✓ / not yet.
- Only one non-draft run per (center, branch, month).

## My earnings (teacher)

> PROPOSED: live "estimate" for the current month, only approved/paid months shown, what teachers see of `percent_of_*` bases. Canvas: teacher sees own breakdown.

A mobile page with the current month's **estimate** (computed live from the rules, labeled "estimate") and past months from approved and paid runs: breakdown per rule (e.g. "24 lessons × 80 000"), adjustments, total, paid status. Teachers never see other teachers' pay or center revenue. The `percent_of_*` bases are shown as the basis amount only for their own groups.
