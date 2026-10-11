# Design reference (read-only)

Copies of the UI files from the reference app at `C:\Users\user\Desktop\visual-fidelity-toolkit`
(TanStack Start + Vite, built with Lovable). uteach's look must match this app. See `docs/spec/05-ui.md`.

- **Never import these files.** They use TanStack Router, hard-coded English, demo data and "Spik" branding.
- Use them to read exact class names, sizes, spacing, shadows and colors, then rebuild the look with uteach's
  tokens, shadcn primitives and next-intl.

| File | Shows |
|---|---|
| `styles.css` | all design tokens (colors, radius, shadows, font) |
| `DashboardShell.tsx`, `Sidebar.tsx`, `Topbar.tsx` | app shell: sidebar with groups, mobile drawer, top bar |
| `PageHeader.tsx` | page title, breadcrumb, main action |
| `teachers.index.tsx`, `TableChrome.tsx`, `RowActions.tsx` | list page: table, search, filters, pagination, row actions |
| `teachers.details.tsx` | profile cards (detail page header) |
| `AddTeacherDialog.tsx` | form dialog and searchable select |
| `dashboard.index.tsx`, `StatCards.tsx`, `ExamResultsChart.tsx`, `StudentsDonut.tsx`, `StarStudents.tsx`, `ActivityList.tsx` | dashboard layout, stat tiles, charts, lists |
