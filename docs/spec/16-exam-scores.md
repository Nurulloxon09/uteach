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
| **CEFR** (multilevel test, UZ) | Listening, Reading, Writing, Speaking (0–75, 1) | `sum` + level mapping (A1…C1) shown |
| **Milliy sertifikat** | Single score (0–100, 0.1) | `none` (score = total) + grade mapping (A+, A, B+, B, C+, C) |
| **Custom** | any sections | `sum` / `average` / `none` |

Level and grade mapping tables live in `exam_types.sections` metadata or in code constants per preset code, and are verified against official sources before M6.

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
