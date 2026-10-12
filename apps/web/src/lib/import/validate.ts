import {
  REQUIRED_FIELDS,
  cellText,
  normalizeName,
  normalizePhone,
  parseDateCell,
  parseGenderCell,
  parseIntCell,
  parseMajorUnits,
  parseRelationCell,
  parseTimeCell,
  parseWeekdays,
  type ImportKind,
} from "@uteach/core";
import type { Sheet } from "./read";

/**
 * Row validation for Excel import (10-platform-onboarding). Pure: the caller passes what already exists in
 * the center. Problems come back as (row, field, code); codes are i18n keys under `import.errors`. Rows that
 * match existing data count as "skipped" (the database skips them too), never as errors.
 */

export type ImportContext = {
  country: string;
  billing: boolean;
  today: string;
  branches: { id: string; name: string }[];
  courses: {
    id: string;
    name: string;
    defaultLessonMinutes: number | null;
    levels: { id: string; name: string }[];
  }[];
  teachers: { id: string; name: string; role: string; branchIds: string[] }[];
  rooms: { id: string; name: string; branchId: string }[];
  students: { id: string; fullName: string; phone: string | null; externalRef: string | null }[];
  groups: { id: string; name: string; branchId: string }[];
  /** `${studentId}:${groupId}` of enrollments that haven't ended. */
  openEnrollments: Set<string>;
  /** Students who already have an opening balance (only loaded for that import). */
  openingBalances: Set<string>;
};

export type ImportIssue = { row: number; field: string; code: string };
export type Mapping = Record<string, number | null>;
export type ValidationResult = {
  rows: number;
  create: number;
  skip: number;
  issues: ImportIssue[];
  /** What the import RPC receives (valid rows only; empty when there are issues). */
  payload: Record<string, unknown>[];
};

const key = (s: string) => normalizeName(s);

function byName<T extends { name: string }>(list: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item.name);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

export function validateImport(
  kind: ImportKind,
  sheet: Sheet,
  mapping: Mapping,
  ctx: ImportContext,
): ValidationResult {
  const issues: ImportIssue[] = [];
  for (const field of REQUIRED_FIELDS[kind] as readonly string[]) {
    if (mapping[field] === null || mapping[field] === undefined)
      issues.push({ row: 0, field, code: "columnMissing" });
  }
  if (sheet.rows.length === 0) issues.push({ row: 0, field: "", code: "empty" });
  if (issues.length) return { rows: sheet.rows.length, create: 0, skip: 0, issues, payload: [] };

  const result =
    kind === "students"
      ? validateStudents(sheet, mapping, ctx)
      : kind === "groups"
        ? validateGroups(sheet, mapping, ctx)
        : kind === "enrollments"
          ? validateEnrollments(sheet, mapping, ctx)
          : validateOpeningBalances(sheet, mapping, ctx);
  return {
    ...result,
    rows: sheet.rows.length,
    payload: result.issues.length ? [] : result.payload,
  };
}

type RowsResult = Omit<ValidationResult, "rows">;

function reader(mapping: Mapping) {
  return (cells: unknown[], field: string): unknown => {
    const index = mapping[field];
    return index === null || index === undefined ? undefined : cells[index];
  };
}

function branchFor(ctx: ImportContext, text: string, issue: () => void): string | null {
  if (!text) return ctx.branches[0]?.id ?? null;
  const found = ctx.branches.find((b) => key(b.name) === key(text));
  if (!found) issue();
  return found?.id ?? null;
}

// --- Students ------------------------------------------------------------------------

function validateStudents(sheet: Sheet, mapping: Mapping, ctx: ImportContext): RowsResult {
  const get = reader(mapping);
  const issues: ImportIssue[] = [];
  const payload: Record<string, unknown>[] = [];
  const byRef = new Map(ctx.students.filter((s) => s.externalRef).map((s) => [s.externalRef!, s]));
  const byPhoneName = new Set(
    ctx.students.filter((s) => s.phone).map((s) => `${s.phone}|${key(s.fullName)}`),
  );
  const seenRefs = new Set<string>();
  const seenPhoneName = new Set<string>();
  let skip = 0;

  for (const { number, cells } of sheet.rows) {
    const issue = (field: string, code: string) => issues.push({ row: number, field, code });
    const fullName = cellText(get(cells, "fullName"));
    if (!fullName) issue("fullName", "required");
    else if (fullName.length > 160) issue("fullName", "tooLong");

    const phoneText = cellText(get(cells, "phone"));
    const phone = phoneText ? normalizePhone(phoneText, ctx.country) : null;
    if (phoneText && !phone) issue("phone", "phone");

    const birthRaw = get(cells, "birthDate");
    const birthDate = cellText(birthRaw) ? parseDateCell(birthRaw) : null;
    if (cellText(birthRaw) && !birthDate) issue("birthDate", "date");

    const gender = parseGenderCell(get(cells, "gender"));
    if (gender === null) issue("gender", "gender");

    const branchId = branchFor(ctx, cellText(get(cells, "branch")), () =>
      issue("branch", "branchUnknown"),
    );
    const externalRef = cellText(get(cells, "externalRef"));
    if (externalRef.length > 80) issue("externalRef", "tooLong");

    const guardianName = cellText(get(cells, "guardianName"));
    const guardianText = cellText(get(cells, "guardianPhone"));
    const guardianPhone = guardianText ? normalizePhone(guardianText, ctx.country) : null;
    if (guardianText && !guardianPhone) issue("guardianPhone", "phone");
    if (guardianName && !guardianText) issue("guardianPhone", "guardianPhoneRequired");
    const relation = parseRelationCell(get(cells, "relation"));
    if (relation === null) issue("relation", "relation");

    // Same student twice in the file.
    if (externalRef) {
      if (seenRefs.has(externalRef)) issue("externalRef", "duplicateInFile");
      seenRefs.add(externalRef);
    } else if (phone && fullName) {
      const k = `${phone}|${key(fullName)}`;
      if (seenPhoneName.has(k)) issue("fullName", "duplicateInFile");
      seenPhoneName.add(k);
    }

    const exists =
      (externalRef && byRef.has(externalRef)) ||
      (phone && fullName && byPhoneName.has(`${phone}|${key(fullName)}`));
    if (exists) skip++;

    payload.push({
      fullName,
      phone,
      birthDate,
      gender: gender ?? null,
      school: cellText(get(cells, "school")) || null,
      branchId,
      externalRef: externalRef || null,
      guardianName: guardianName || null,
      guardianPhone,
      relation: relation ?? "parent",
    });
  }
  return { create: payload.length - skip, skip, issues, payload };
}

// --- Groups ----------------------------------------------------------------------------

function validateGroups(sheet: Sheet, mapping: Mapping, ctx: ImportContext): RowsResult {
  const get = reader(mapping);
  const issues: ImportIssue[] = [];
  const payload: Record<string, unknown>[] = [];
  const courses = byName(ctx.courses);
  const existing = new Set(ctx.groups.map((g) => `${g.branchId}|${key(g.name)}`));
  const seen = new Set<string>();
  let skip = 0;

  for (const { number, cells } of sheet.rows) {
    const issue = (field: string, code: string) => issues.push({ row: number, field, code });
    const name = cellText(get(cells, "name"));
    if (!name) issue("name", "required");

    const courseText = cellText(get(cells, "course"));
    const course = courseText ? courses.get(key(courseText))?.[0] : undefined;
    if (!courseText) issue("course", "required");
    else if (!course) issue("course", "courseUnknown");

    const levelText = cellText(get(cells, "level"));
    const level =
      levelText && course ? course.levels.find((l) => key(l.name) === key(levelText)) : undefined;
    if (levelText && course && !level) issue("level", "levelUnknown");

    const branchId = branchFor(ctx, cellText(get(cells, "branch")), () =>
      issue("branch", "branchUnknown"),
    );

    const teacherText = cellText(get(cells, "teacher"));
    const teacher = teacherText
      ? ctx.teachers.find(
          (t) =>
            key(t.name) === key(teacherText) &&
            (t.role === "owner" || (branchId && t.branchIds.includes(branchId))),
        )
      : undefined;
    if (teacherText && !teacher) issue("teacher", "teacherUnknown");

    const roomText = cellText(get(cells, "room"));
    const room = roomText
      ? ctx.rooms.find((r) => r.branchId === branchId && key(r.name) === key(roomText))
      : undefined;
    if (roomText && !room) issue("room", "roomUnknown");

    const daysText = cellText(get(cells, "weekdays"));
    const weekdays = daysText ? parseWeekdays(daysText) : [];
    if (daysText && !weekdays) issue("weekdays", "weekdays");
    const timeRaw = get(cells, "startTime");
    const startTime = cellText(timeRaw) ? parseTimeCell(timeRaw) : null;
    if (cellText(timeRaw) && !startTime) issue("startTime", "time");
    if (weekdays && weekdays.length && !startTime && !cellText(timeRaw))
      issue("startTime", "required");
    const duration = parseIntCell(get(cells, "duration"), 15, 480);
    if (duration === null) issue("duration", "number");

    const startRaw = get(cells, "startDate");
    const startDate = parseDateCell(startRaw);
    if (!cellText(startRaw)) issue("startDate", "required");
    else if (!startDate) issue("startDate", "date");
    const endRaw = get(cells, "endDate");
    const endDate = cellText(endRaw) ? parseDateCell(endRaw) : null;
    if (cellText(endRaw) && !endDate) issue("endDate", "date");
    if (startDate && endDate && endDate < startDate) issue("endDate", "endBeforeStart");

    const capacity = parseIntCell(get(cells, "capacity"), 1, 1000);
    if (capacity === null) issue("capacity", "number");
    const cycle = parseIntCell(get(cells, "cycleLessons"), 1, 100);
    if (cycle === null) issue("cycleLessons", "number");

    const priceText = cellText(get(cells, "price"));
    let price: string | null = null;
    if (priceText) {
      if (!ctx.billing) issue("price", "priceNeedsBilling");
      else {
        try {
          const minor = parseMajorUnits(priceText);
          if (minor < 0n) throw new RangeError("negative");
          price = minor.toString();
        } catch {
          issue("price", "amount");
        }
      }
    }

    if (name && branchId) {
      const k = `${branchId}|${key(name)}`;
      if (seen.has(k)) issue("name", "duplicateInFile");
      seen.add(k);
      if (existing.has(k)) skip++;
    }

    const minutes = duration ?? course?.defaultLessonMinutes ?? 90;
    payload.push({
      name,
      branchId,
      courseId: course?.id ?? null,
      levelId: level?.id ?? null,
      teacherId: teacher?.id ?? null,
      roomId: room?.id ?? null,
      startDate,
      endDate,
      capacity: capacity ?? null,
      price,
      cycleLessons: cycle ?? null,
      rules: (weekdays ?? []).map((weekday) => ({ weekday, startTime, durationMinutes: minutes })),
    });
  }
  return { create: payload.length - skip, skip, issues, payload };
}

// --- Enrollments -------------------------------------------------------------------------

type ImportStudent = ImportContext["students"][number];

/**
 * Finds the student a row means: by external ref, else phone (+ name if several share it), else a unique
 * name. Reports `studentRequired` / `studentUnknown` / `studentAmbiguous` on the field that was used.
 */
function studentMatcher(ctx: ImportContext) {
  const byRef = new Map(ctx.students.filter((s) => s.externalRef).map((s) => [s.externalRef!, s]));
  const byPhone = new Map<string, ImportStudent[]>();
  for (const s of ctx.students)
    if (s.phone) byPhone.set(s.phone, [...(byPhone.get(s.phone) ?? []), s]);
  const byStudentName = new Map<string, ImportStudent[]>();
  for (const s of ctx.students)
    byStudentName.set(key(s.fullName), [...(byStudentName.get(key(s.fullName)) ?? []), s]);

  return (
    get: (cells: unknown[], field: string) => unknown,
    cells: unknown[],
    issue: (field: string, code: string) => void,
  ): ImportStudent | undefined => {
    const ref = cellText(get(cells, "studentRef"));
    const phoneText = cellText(get(cells, "studentPhone"));
    const phone = phoneText ? normalizePhone(phoneText, ctx.country) : null;
    if (phoneText && !phone) issue("studentPhone", "phone");
    const name = cellText(get(cells, "studentName"));
    let candidates: ImportStudent[] = [];
    let field = "studentName";
    if (ref) {
      candidates = byRef.has(ref) ? [byRef.get(ref)!] : [];
      field = "studentRef";
    } else if (phone) {
      candidates = byPhone.get(phone) ?? [];
      if (name && candidates.length > 1)
        candidates = candidates.filter((s) => key(s.fullName) === key(name));
      field = "studentPhone";
    } else if (name) {
      candidates = byStudentName.get(key(name)) ?? [];
    }
    if (!ref && !phone && !name) issue("studentName", "studentRequired");
    else if (candidates.length === 0) issue(field, "studentUnknown");
    else if (candidates.length > 1) issue(field, "studentAmbiguous");
    return candidates.length === 1 ? candidates[0] : undefined;
  };
}

function validateEnrollments(sheet: Sheet, mapping: Mapping, ctx: ImportContext): RowsResult {
  const get = reader(mapping);
  const issues: ImportIssue[] = [];
  const payload: Record<string, unknown>[] = [];
  const groups = byName(ctx.groups);
  const matchStudent = studentMatcher(ctx);
  const seen = new Set<string>();
  let skip = 0;

  for (const { number, cells } of sheet.rows) {
    const issue = (field: string, code: string) => issues.push({ row: number, field, code });
    const student = matchStudent(get, cells, issue);

    // Group: by name, narrowed by branch when the name is used in several branches.
    const groupText = cellText(get(cells, "group"));
    const branchText = cellText(get(cells, "branch"));
    let groupCandidates = groupText ? (groups.get(key(groupText)) ?? []) : [];
    if (branchText && groupCandidates.length > 1) {
      const branch = ctx.branches.find((b) => key(b.name) === key(branchText));
      groupCandidates = groupCandidates.filter((g) => g.branchId === branch?.id);
    }
    if (!groupText) issue("group", "required");
    else if (groupCandidates.length === 0) issue("group", "groupUnknown");
    else if (groupCandidates.length > 1) issue("group", "groupAmbiguous");
    const group = groupCandidates.length === 1 ? groupCandidates[0] : undefined;

    const startRaw = get(cells, "startDate");
    const startDate = cellText(startRaw) ? parseDateCell(startRaw) : ctx.today;
    if (!startDate) issue("startDate", "date");

    if (student && group) {
      const k = `${student.id}:${group.id}`;
      if (seen.has(k)) issue("group", "duplicateInFile");
      seen.add(k);
      if (ctx.openEnrollments.has(k)) skip++;
    }
    payload.push({ studentId: student?.id ?? null, groupId: group?.id ?? null, startDate });
  }
  return { create: payload.length - skip, skip, issues, payload };
}

// --- Opening balances ----------------------------------------------------------------------

/**
 * Opening balances (15): one signed amount per student, negative = an existing debt, positive = prepaid. The
 * payload names the matched student the way `import_opening_balances` finds them (their external ref, else
 * their phone + name), so a student with neither can't take an opening balance. A student who already has one
 * is skipped, as the database does.
 */
function validateOpeningBalances(sheet: Sheet, mapping: Mapping, ctx: ImportContext): RowsResult {
  const get = reader(mapping);
  const issues: ImportIssue[] = [];
  const payload: Record<string, unknown>[] = [];
  const matchStudent = studentMatcher(ctx);
  const seen = new Set<string>();
  let skip = 0;

  for (const { number, cells } of sheet.rows) {
    const issue = (field: string, code: string) => issues.push({ row: number, field, code });
    const student = matchStudent(get, cells, issue);
    if (student && !student.externalRef && !student.phone) issue("studentName", "studentNoKey");

    const amountText = cellText(get(cells, "amount"));
    let amount: string | null = null;
    if (!amountText) issue("amount", "required");
    else {
      try {
        const minor = parseMajorUnits(amountText);
        if (minor === 0n) issue("amount", "amountZero");
        else amount = minor.toString();
      } catch {
        issue("amount", "amount");
      }
    }
    const note = cellText(get(cells, "note"));
    if (note.length > 500) issue("note", "tooLong");

    if (student) {
      if (seen.has(student.id)) issue("studentName", "duplicateInFile");
      seen.add(student.id);
      if (ctx.openingBalances.has(student.id)) skip++;
    }
    payload.push({
      externalRef: student?.externalRef ?? null,
      phone: student?.externalRef ? null : (student?.phone ?? null),
      fullName: student?.fullName ?? null,
      amount,
      note: note || null,
    });
  }
  return { create: payload.length - skip, skip, issues, payload };
}
