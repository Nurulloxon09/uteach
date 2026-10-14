# Dry run with a friendly center

The last M7 "done when" item: a real center uses uteach for a week with its real data (import → a week of
attendance → month-start charges → payments → reminders) and nothing blocks them. This page is the plan for that
week and the list to tick off. It is written for the uteach owner, who runs the dry run with the center.

Do the dry run on production (M7d), not on the Vercel preview. If production isn't ready yet, the hosted
Supabase project plus the preview can do it, but then the Telegram worker has to run on a computer that stays on.

## 1. Before the first day

Ask the center for:

- [ ] the owner's phone number (they sign up themselves at `/signup`);
- [ ] the list of students: name, phone, parent's name and phone, group;
- [ ] the list of groups: course, teacher, room, days and times, price per cycle;
- [ ] each student's balance today (who owes how much, who has paid ahead);
- [ ] the admins' and teachers' phone numbers.

Then:

- [ ] The center owner signs up and creates the center (name, language, time zone, the first branch).
- [ ] In `/admin` → Centers, extend the center's trial so it doesn't run out during the dry run (for example
      30 days). Write down that you did it.
- [ ] Fill in the import templates (Import page → "Download template") from the center's lists. Check the
      phones: `+998` and 9 digits.
- [ ] In `/admin` → Health, the worker shows a recent heartbeat (green).
- [ ] The center's Telegram: Settings → Telegram shows the bot link and QR code. Print the QR code for the
      reception desk.

## 2. Day 1: setting up (with the owner, about 2 hours)

- [ ] Onboarding: rooms, courses, then **Import** students, then groups and enrollments. Every row is either
      imported or reported with its row and column; nothing is half-imported.
- [ ] Import the opening balances (Import → Opening balances).
- [ ] Check 5 students at random against the center's paper: group, parent, balance.
- [ ] Schedule: the week looks like the center's real week. No unexpected conflicts in the inbox.
- [ ] Invite the admins and teachers (Staff → Invite). Each one signs up from their link and sees their Home or
      Today.
- [ ] Ask 3–5 parents to open the bot from the QR code and link their child.

## 3. Days 2–6: a normal week

Every day:

- [ ] Teachers mark attendance from their phones during or right after the lesson.
- [ ] The admin records every payment in uteach (cash and card), and prints or sends the receipt.
- [ ] Parents who linked Telegram get the absence messages and the payment receipts.
- [ ] Look at `/admin` → Health once a day: heartbeats green, no growing outbox backlog, few failures.

At least once during the week:

- [ ] A new enquiry goes into Leads, gets a trial lesson, and is enrolled.
- [ ] A student is frozen or moved to another group.
- [ ] A payment reminder goes out to a parent who owes.
- [ ] The owner opens Home (the dashboard) and the Debtors page and says the numbers look right.

## 4. Month start (if the week includes it; otherwise force it once)

- [ ] New cycle charges appear for the students whose cycle ended, and not for frozen ones.
- [ ] The debtors list matches what the center expects.

## 5. Reporting a problem

Ask the center to send a screenshot and one sentence (what they tried, what happened) to the uteach Telegram.
For each report, write down:

| Date | Who | What happened | Blocking? | Fixed in |
| ---- | --- | ------------- | --------- | -------- |
|      |     |               |           |          |

"Blocking" means the center had to go back to paper or Excel to get the job done.

## 6. Pass or fail

The dry run passes when all of these are true:

- [ ] Import, a week of attendance, the charges, the payments and the reminders were all done in uteach.
- [ ] No blocking problem is still open.
- [ ] Every non-blocking problem has an issue on GitHub.
- [ ] The owner of the center would keep using it.

When it passes, tick the dry-run item in `docs/spec/30-milestones.md` (M7) and write a line in
`docs/spec/progress.md`.

## 7. After the dry run

- [ ] Decide with the center: stay on a paid plan (issue the first invoice in `/admin` → Invoices) or stop
      (the owner exports their data first).
- [ ] Remove the trial extension note if they pay.
