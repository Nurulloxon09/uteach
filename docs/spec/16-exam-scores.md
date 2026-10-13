# 16 · Exam prep & scores 🟩 (mock engine + AI ⬜)

Milestones: **M6** (exam types, group entry, progress charts, targets); **M17** (online mock engine, AI writing/speaking feedback).
Tables: `exam_types`, `exam_results`, `student_targets`.

## Exam types

> PROPOSED: section ranges, steps and total rules for SAT, CEFR and Milliy sertifikat (need checking against official sources), grade/level mappings, presets read-only for centers. Canvas: IELTS, SAT, CEFR, Milliy sertifikat presets + custom.

Global presets (`center_id is null`, read-only), and centers can add custom types.

| Preset | Sections (min–max, step) | Total rule |
|---|---|---|
| **IELTS** (Academic/General) | Listening, Reading, Writing, Speaking (0–9, 0.5) | `ielts_band` |
| **SAT** | Reading & Writing (200–800, 10), Math (200–800, 10) | `sum` (400–1600) |
| **CEFR** (multilevel test, UZ) | Listening, Reading, Writing, Speaking (0–75, 1) | `average` (0–75) + level mapping (B1 dan quyi, B1, B2, C1) shown |
| **Milliy sertifikat** | Single score (0–75, 0.1) | `none` (score = total) + grade mapping (A+, A, B+, B, C+, C) |
| **Custom** | any sections | `sum` / `average` / `none` |

Level and grade mapping tables live in `exam_types.sections` metadata or in code constants per preset code, and are verified against official sources before M6.

> PROPOSED (M6 plan, 2026-10-13): ranges and mappings checked against official sources (done-when item 6):
> - **IELTS:** overall = mean of the four bands; a mean ending in .25 rounds up to the next half band, .75 up to
>   the next whole band, anything else to the nearest half band (ielts.org, "How IELTS is scored").
> - **SAT:** sections 200–800, total = sum, 400–1600 (College Board, "What do my SAT Suite scores mean?").
>   Steps of 10 are not stated on that page; every published score report and third-party guide uses them, so
>   the step stays 10.
> - **CEFR multilevel:** UzBMB "Ko'p darajali test formati uchun baholash mezonlari" (Multilevel-bm.pdf, in force
>   from March 2023): each of the four sections is scored 0–75 (75 is the cap); the level comes from the
>   **average of the four sections**: C1 65–75, B2 51–64, B1 38–50, "B1 dan quyi" 0–37. So the total rule is
>   `average`, not `sum` (the old row said sum). Sections are whole numbers on certificates; the total keeps
>   one decimal and the level uses ≥ 65 / ≥ 51 / ≥ 38.
> - **Milliy sertifikat:** UzBMB news of 17-01-2024 (Cabinet resolution amending No. 646): results by the Rasch
>   model; A+ ≥ 70, A 65–69.9, B+ 60–64.9, B 55–59.9, C+ 50–54.9, C 46–49.9; below 46 no certificate (shown as
>   "No certificate"). UzBMB's page gives only the thresholds; the 75-point maximum comes from press reports
>   (uzreport.news, "maksimal natija 75 ball") and matches UzBMB's multilevel scale, so the range is 0–75 with
>   step 0.1. Re-check if a certificate above 75 ever turns up. Certificates issued before 1 March 2024 used a 100-point scale: a center
>   that needs them adds a custom type.
> - The mappings live in `packages/core/exams` constants keyed by preset `code` (`ielts`, `sat`, `cefr`,
>   `milliy`) and in `exam_types.sections`/`meta` for display; the SQL trigger only needs ranges, steps and the
>   total rule.

### IELTS band rounding (`ielts_band`)
Overall = mean of the 4 bands, rounded to the nearest 0.5. **x.25 rounds up to x.5, and x.75 rounds up to (x+1).0.** Example: 6.5, 6.5, 5.0, 7.0 → 6.25 → **6.5**. 6.5, 6.5, 5.5, 6.0 → 6.125 → **6.0**.
This is implemented once in `packages/core/exams` and mirrored by a DB trigger computing `total_score`. Both are tested with the same fixtures.

## Group score entry

> PROPOSED: kinds (diagnostic / mock), re-entry edits instead of duplicating, `score_posted` notification on by default.

- From the group page → "Enter scores": choose exam type (defaults to the course's), kind (diagnostic / mock), and date.
- A **keyboard-friendly grid**: rows = active students, columns = sections. Tab/Enter moves across and down. Values are validated (range, step) inline. Total is computed live.
- Save upserts `exam_results`. Re-entering the same date edits rather than duplicates.
- Teachers can do this for their groups; admins for any group.
- After save: `score_posted` notification enqueued to guardians and students (center setting, default on).

## Official results

> PROPOSED: certificate upload and the badge. Canvas: official result recorded.

Entered on the student profile: kind `official`, date, sections, optional certificate upload. Shown with a badge, and they count for "score uplift".

## Progress & targets

> PROPOSED: targets set from the lead goal, baseline = first diagnostic, group gap table, chart image in the bot. Canvas: chart vs target & exam date, score uplift; parents see progress.

- **Targets:** per student per exam type: target total (and optional sections), planned exam date. Set during lead conversion (from lead goal) or on the profile.
- **Student chart:** total score over time (mock + official), a target line, an exam-date marker, and per-section lines (toggle).
- **Group view:** table of latest score, target, gap, number of mocks, and trend arrow.
- **Score uplift:** latest − baseline (first diagnostic, or `student_targets.baseline_total`). Used in teacher analytics (M12).
- Parents see the chart in the bot (image) and the Mini App (M9).

## Online mock engine ⬜ (M17)

> PROPOSED: per-center question banks, timed, auto-saving into `exam_results`. Canvas: auto-graded L/R.

Auto-graded Listening and Reading mocks (question banks per center, timed, audio for listening). Results land in `exam_results(kind='mock')` automatically.

## AI writing/speaking feedback ⬜ (M17)
The student submits an essay or audio, and an AI drafts band scores and feedback. **The teacher reviews and approves first.** Nothing AI-generated reaches students or parents without teacher approval.
