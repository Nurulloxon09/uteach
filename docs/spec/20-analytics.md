# 20 · Analytics 🟩 dashboards / 🟨 analytics

Milestones: **M7** (role dashboards: today, money, students, follow-ups); **M12** (money, churn, funnel, teachers, at-risk).
Data: live queries for dashboards; **materialised views** refreshed nightly by `refresh_analytics` for heavier analytics (M12). All of them respect RLS (security_invoker views over base tables, or MV + RLS-checked wrapper functions).

## Role dashboards (M7)

> PROPOSED: exactly what each dashboard shows. Canvas: role dashboards — today, money, students, follow-ups.

**Owner:** today (lessons, attendance % so far, payments today), month to date (charged, collected, collection rate, debt total + aging), active students (Δ vs last month), new leads / conversions this month, per-branch cards.
**Admin (their branches):** today's lessons (marked ✓ / not yet), debtors to call (top 10), follow-ups due today, trials today, unlinked Telegram count, conflicts inbox.
**Teacher:** today's lessons with a "mark attendance" button, unmarked lessons within the edit window, groups list, latest scores to enter. No money.

## Analytics (M12) 🟨

> PROPOSED: materialised views with RLS wrappers, the metric definitions (collection rate, churn, cohort retention, 3-month teacher retention), date/branch filters, export. Canvas: collection rate, churn, funnel by source, teacher retention, score uplift, heatmap, at-risk.

| Area | Metrics |
|---|---|
| **Money** | Charged vs collected per month, **collection rate** (collected for month's charges / charged), debt aging trend, revenue per branch/course/group, average revenue per student |
| **Students & churn** | Active students over time, new / ended per month, **churn rate** (ended dropped ÷ active at month start), retention by cohort (enrollment month), freezes |
| **Sales funnel** | Leads by source → contacted → trial → won, **conversion by source**, time to first contact, lost reasons breakdown |
| **Teachers** | Students retained (3-month retention of their groups), attendance rate of their groups, **score uplift** (avg latest − baseline), lessons held, substitutions |
| **Attendance** | Heatmap weekday × hour of attendance %, by group / teacher |
| **At-risk** | Open `risk_flags` list with actions (see 14) |

All screens have date-range and branch filters, plus Excel export. Definitions are written into the UI (an info tooltip) and match this note.
