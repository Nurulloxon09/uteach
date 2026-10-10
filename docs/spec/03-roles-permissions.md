# 03 · Roles & permissions

The tenant is the **center** (`center_id`). Each staff user has one `memberships` row per center they work in. A user can belong to several centers and switches between them in the UI.

## Roles

> PROPOSED: one membership per center with a center switcher; owners/admins can also teach (lessons reference a membership, not a role); the Auth column. The role descriptions themselves are from the canvas.


| Role | Who | Scope | Auth |
|---|---|---|---|
| 🛠 **Super-admin** | uteach team | Platform: centers, plans, invoices, system health. Tenant data **read-only** through the support view, and every view is audited. | Supabase Auth + `profiles.is_super_admin` |
| 👔 **Owner** | Center owner | Whole center: all branches, all modules, settings, uteach billing | Supabase Auth (phone + password) |
| 🗂 **Admin** | Receptionist / branch manager | Only the branches in `branch_ids`. Basic rights by default, plus extra rights through permission flags. | Supabase Auth |
| 👩‍🏫 **Teacher** | Teacher | **Own groups only**: attendance, scores, topics, own earnings. **Never sees center money** (prices, payments, debts, discounts). | Supabase Auth |
| 🎓 **Student** · 👪 **Parent** | Clients | Their own (or their children's) data | **No password.** Telegram bot + Mini App, identified by a shared phone contact matched to `students.phone` / `guardians.phone` |

A person can be an owner who also teaches. Lessons reference a `membership_id`, not a role, so owners and admins can be assigned as teachers.

## Admin permission flags

> ✅ CONFIRMED by owner (2026-10-10): the 10% discount cap for admins without `discounts`.

> PROPOSED: the entire flag list, the default ticks, "flags never extend branch scope" and "only the owner manages admins". Canvas only says admins get "extra rights via permission flags".


`memberships.permissions text[]`. Owners implicitly have all of them. Teachers ignore them.

| Flag | Grants | Default for new admin |
|---|---|---|
| `students` | Create/edit students, guardians, enrollments; enroll / freeze / transfer / end | ✅ |
| `leads` | Leads CRM | ✅ |
| `attendance` | Mark and edit any attendance in their branches, at any time (audited) | ✅ |
| `payments` | Record payments, print receipts, create pay links | ✅ |
| `billing` | See prices, charges, balances, debtors | ✅ |
| `broadcasts` | Send broadcasts | ✅ |
| `academics` | Courses, levels, groups, schedule rules, lessons, holidays, prices | ☐ |
| `adjustments` | Waive, write off, opening balances, corrections | ☐ |
| `discounts` | Set enrollment discounts above the 10% cap; manage promo codes | ☐ |
| `void` | Void payments and charges | ☐ |
| `refunds` 🟨 | Refunds | ☐ |
| `import` | Excel import | ☐ |
| `staff` | Invite and disable **teachers** in their branches | ☐ |
| `settings` | Center settings, templates, lost reasons | ☐ |
| `cash_closing` 🟨 | Daily kassa closing for their branch | ☐ |
| `finance` 🟨 | Accounts, expenses, transfers, P&L | ☐ |
| `payroll` 🟨 | Pay rules, payroll runs | ☐ |
| `analytics` 🟨 | Analytics beyond the admin dashboard | ☐ |

Rules:
- An admin without `discounts` can give a discount of at most 10% (`discount_bp ≤ 1000`), and must give a reason.
- Flags never extend branch scope. An admin with `billing` still sees only their branches.
- Only the owner can manage admins, change roles, or grant flags.

## Permission matrix

> PROPOSED: every cell except: owner = everything; admin = branch-scoped; teacher = own groups, attendance, scores, topics, own earnings, never money; student/parent = own data via bot + Mini App; admins edit attendance any time (audited); teacher 48 h window.


✅ full · 👁 read · 🔸 limited (see note) · — none. "Admin" means within their branches, with default flags; † means it needs the named flag.

| Area | Owner | Admin | Teacher | Student / Parent (bot, Mini App) |
|---|---|---|---|---|
| Center settings, branches | ✅ | 👁 · ✅† settings (not branches) | — | — |
| uteach plan & invoices | ✅ | — | — | — |
| Staff | ✅ | 👁 · teachers† staff | 👁 names only | — |
| Courses, levels, groups, rules | ✅ | 👁 · ✅† academics | 👁 own groups | 👁 own groups |
| Group prices | ✅ | 👁 billing · ✅† academics | — | 👁 own amount due only |
| Lessons / timetable | ✅ | ✅† academics, 👁 otherwise | 👁 own; 🔸 set topic | 👁 own schedule |
| Students & guardians | ✅ | ✅ | 🔸 roster of own groups: name, no contacts | 👁 self / own children |
| Enroll / freeze / transfer / end | ✅ | ✅ | — | — |
| Attendance | ✅ | ✅ any time (audited) | ✅ own lessons, within 48 h | 👁 own |
| Leads | ✅ | ✅ | 🔸 trial guests on own lessons: name + set result | — |
| Charges, balances, debtors | ✅ | ✅ (billing) | — | 👁 own balance |
| Record payment / receipt | ✅ | ✅ | — | 🔸 pay online 🟨 |
| Void / adjust / refund | ✅ | † void / adjustments / refunds | — | — |
| Exam scores & targets | ✅ | ✅ | ✅ own groups | 👁 own |
| Broadcasts | ✅ | ✅ | — | receive |
| Payroll 🟨 | ✅ | † payroll | 👁 own earnings (approved runs) | — |
| Finance 🟨 | ✅ | † finance / cash_closing | — | — |
| Analytics | ✅ | dashboard; † analytics | own dashboard (today, groups, scores) | — |
| Audit log | ✅ | — | — | — |
| Import | ✅ | † import | — | — |

## How it's enforced

> PROPOSED: points 1–6 (negative RLS tests, `group_prices`/views for column secrecy, security-definer RPCs, read-only via RLS, service-role scoping, "no log in as user"). Canvas: RLS on every table; support view read-only and audited.


1. **RLS is the security boundary.** UI hiding is only convenience. Every table has policies built from the `private.*` helpers in `02-data-model.md`. Tests in `supabase/tests/` assert, for each role, what it **can't** see and do. Those negative tests matter most.
2. **Column-level secrecy** (teachers vs money/contacts) is solved by **table design** (`group_prices` separate from `groups`), and by **views** that omit columns (`group_roster`, `attendance_sheet`), not by hoping the UI doesn't select them.
3. **Mutations with side effects** (enroll, freeze, transfer, record payment, void, recalc) are `security definer` RPCs. They check permissions themselves with the same helpers, run in one transaction, and write `audit_log`.
4. **Read-only centers** (`past_due` past grace → `read_only`): every write policy includes `private.center_writable(center_id)`. Reads keep working, so a center can always see and export its data.
5. **Service role** is used only in the worker, `/tg/api`, `/api/pay/*` and `/admin`. Every query there filters by an explicit `center_id` / subject derived from a verified identity (Telegram `initData`, provider signature, super-admin session).
6. **Super-admin support view:** opening a center writes `audit_log(action='support_view')`. The support UI is read-only; there is no "log in as user".

## Student / parent identity

> PROPOSED: everything except "share contact → linked to students/guardians/staff": rejecting forwarded contacts, matching across all centers, guardian sees all linked children, no-match message, unlink behaviour.


- The user taps **Share contact** in the bot. Telegram gives a phone number that is verified to belong to the account (`contact.user_id == from.id`; contacts forwarded from someone else are rejected).
- That phone is matched against `students.phone` and `guardians.phone` in **all** centers. A `telegram_links` row is created for each match.
- A guardian sees all students linked through `student_guardians`. A student sees only themself.
- If nothing matches, the bot says so and offers to send an enquiry, which becomes a lead (M13).
- Changing a phone number in the staff app does not unlink existing links. Admins can unlink manually.
