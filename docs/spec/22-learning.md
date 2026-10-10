# 22 · Learning ⬜

Milestone: **M14**.
Tables: `homework`, `homework_submissions`, `materials`, `progress_reports`, `report_comments`.

## Homework

> PROPOSED: notifications, submitting in the bot, feedback, missing homework feeding at-risk. Canvas: assign, submit (incl. audio), score.

- The teacher assigns it per group (optionally linked to a lesson): title, text, attachments, due date, max score.
- Students get a bot notification and submit in the Mini App or bot: text, files, photos, **audio** (voice messages, for speaking practice).
- The teacher grades: score and feedback. The student and parent are notified.
- Group view: submitted / late / missing per student. Missing-homework counts feed the at-risk signals (optional).

## Materials

> PROPOSED: kinds (file/link/video), Mini App visibility, storage path. Canvas: per course/level/group.

Files, links and videos attached to a course, level or group. Students see the materials of their current groups in the Mini App. Storage: `attachments/{center_id}/materials/…`.

## Monthly PDF reports

> PROPOSED: generated on the 1st, the report contents, 3-day teacher comment window, sent as a Telegram document, center branding. Canvas: monthly PDF reports sent to parents.

- On the 1st (after charges), generate a PDF per active student for the previous month: attendance %, lessons and topics, homework completion, scores vs target with a chart, teacher comment, balance.
- Teachers add a short comment per student during a review window (first 3 days of the month, `report_comments`). Then the reports are sent to parents through Telegram (document).
- Localized and branded with the center logo.
