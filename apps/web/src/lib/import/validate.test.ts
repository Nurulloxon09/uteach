import { describe, expect, it } from "vitest";
import type { Sheet } from "./read";
import { validateImport, type ImportContext, type Mapping } from "./validate";

const BRANCH = "00000000-0000-4000-8000-0000000000b1";
const ctx = (overrides: Partial<ImportContext> = {}): ImportContext => ({
  country: "UZ",
  billing: true,
  today: "2026-10-12",
  branches: [{ id: BRANCH, name: "Chilonzor" }],
  courses: [
    { id: "c1", name: "IELTS", defaultLessonMinutes: 90, levels: [{ id: "l1", name: "6.0" }] },
  ],
  teachers: [{ id: "t1", name: "Jasur Toshmatov", role: "teacher", branchIds: [BRANCH] }],
  rooms: [{ id: "r1", name: "Room 101", branchId: BRANCH }],
  students: [],
  groups: [],
  openEnrollments: new Set(),
  openingBalances: new Set(),
  ...overrides,
});

/** A students sheet like a real export: name, phone, guardian name and phone. */
function studentsSheet(count: number): Sheet {
  return {
    headers: ["F.I.Sh.", "Telefon", "Ota-ona", "Ota-ona telefoni"],
    rows: Array.from({ length: count }, (_, i) => ({
      number: i + 2,
      cells: [
        `Student ${i + 1}`,
        `90 ${String(1000000 + i).slice(0, 3)} ${String(1000000 + i).slice(3, 5)} ${String(1000000 + i).slice(5, 7)}`,
        `Parent ${i + 1}`,
        `+99891${String(1000000 + i)}`,
      ],
    })),
  };
}
const studentsMapping: Mapping = {
  fullName: 0,
  phone: 1,
  guardianName: 2,
  guardianPhone: 3,
  birthDate: null,
  gender: null,
  school: null,
  branch: null,
  externalRef: null,
  relation: null,
};

describe("validateImport: students", () => {
  it("accepts a 300-row file with local phone formats", () => {
    const result = validateImport("students", studentsSheet(300), studentsMapping, ctx());
    expect(result.issues).toEqual([]);
    expect(result).toMatchObject({ rows: 300, create: 300, skip: 0 });
    expect(result.payload[0]).toMatchObject({
      fullName: "Student 1",
      phone: "+998901000000",
      branchId: BRANCH,
    });
  });

  it("counts rows that already exist as skipped (re-import makes no duplicates)", () => {
    const first = validateImport("students", studentsSheet(300), studentsMapping, ctx());
    const existing = first.payload.map((p, i) => ({
      id: `s${i}`,
      fullName: String(p.fullName),
      phone: p.phone as string,
      externalRef: null,
    }));
    const again = validateImport(
      "students",
      studentsSheet(300),
      studentsMapping,
      ctx({ students: existing }),
    );
    expect(again).toMatchObject({ create: 0, skip: 300, issues: [] });
  });

  it("reports bad cells by row and column, and then imports nothing", () => {
    const sheet = studentsSheet(3);
    sheet.rows[0]!.cells[0] = "";
    sheet.rows[2]!.cells[1] = "12";
    const result = validateImport("students", sheet, studentsMapping, ctx());
    expect(result.issues).toEqual([
      { row: 2, field: "fullName", code: "required" },
      { row: 4, field: "phone", code: "phone" },
    ]);
    expect(result.payload).toEqual([]);
  });

  it("needs the name column", () => {
    const result = validateImport(
      "students",
      studentsSheet(1),
      { ...studentsMapping, fullName: null },
      ctx(),
    );
    expect(result.issues).toEqual([{ row: 0, field: "fullName", code: "columnMissing" }]);
  });
});

describe("validateImport: groups and enrollments", () => {
  const groupSheet: Sheet = {
    headers: ["Group", "Course", "Level", "Teacher", "Room", "Days", "Time", "Start", "Price"],
    rows: [
      {
        number: 2,
        cells: [
          "IELTS A",
          "ielts",
          "6.0",
          "Jasur Toshmatov",
          "Room 101",
          "Du/Chor/Ju",
          "18:00",
          "01.09.2026",
          "600 000",
        ],
      },
      {
        number: 3,
        cells: ["Kids", "Kids English", "", "Nobody", "", "Mon/Funday", "", "2026-09-01", ""],
      },
    ],
  };
  const groupMapping: Mapping = {
    name: 0,
    course: 1,
    level: 2,
    teacher: 3,
    room: 4,
    weekdays: 5,
    startTime: 6,
    startDate: 7,
    price: 8,
    branch: null,
    duration: null,
    endDate: null,
    capacity: null,
    cycleLessons: null,
  };

  it("resolves courses, levels, teachers and rooms by name and parses the weekly times", () => {
    const result = validateImport(
      "groups",
      { ...groupSheet, rows: [groupSheet.rows[0]!] },
      groupMapping,
      ctx(),
    );
    expect(result.issues).toEqual([]);
    expect(result.payload[0]).toMatchObject({
      courseId: "c1",
      levelId: "l1",
      teacherId: "t1",
      roomId: "r1",
      startDate: "2026-09-01",
      price: "60000000",
      rules: [
        { weekday: 1, startTime: "18:00", durationMinutes: 90 },
        { weekday: 3, startTime: "18:00", durationMinutes: 90 },
        { weekday: 5, startTime: "18:00", durationMinutes: 90 },
      ],
    });
  });

  it("names every unknown value", () => {
    const codes = validateImport("groups", groupSheet, groupMapping, ctx()).issues.map(
      (i) => `${i.row}:${i.field}:${i.code}`,
    );
    expect(codes).toEqual([
      "3:course:courseUnknown",
      "3:teacher:teacherUnknown",
      "3:weekdays:weekdays",
    ]);
  });

  it("matches enrollments to students and groups and skips existing ones", () => {
    const sheet: Sheet = {
      headers: ["Student phone", "Group"],
      rows: [{ number: 2, cells: ["+998931234567", "IELTS A"] }],
    };
    const mapping: Mapping = {
      studentPhone: 0,
      group: 1,
      studentRef: null,
      studentName: null,
      branch: null,
      startDate: null,
    };
    const base = ctx({
      students: [{ id: "s1", fullName: "Ali", phone: "+998931234567", externalRef: null }],
      groups: [{ id: "g1", name: "IELTS A", branchId: BRANCH }],
    });
    expect(validateImport("enrollments", sheet, mapping, base)).toMatchObject({
      create: 1,
      issues: [],
      payload: [{ studentId: "s1", groupId: "g1", startDate: "2026-10-12" }],
    });
    const again = validateImport("enrollments", sheet, mapping, {
      ...base,
      openEnrollments: new Set(["s1:g1"]),
    });
    expect(again).toMatchObject({ create: 0, skip: 1 });
  });

  it("turns opening balances into signed minor units and names students the way the database finds them", () => {
    const sheet: Sheet = {
      headers: ["ID", "Telefon", "F.I.Sh.", "Balans", "Izoh"],
      rows: [
        { number: 2, cells: ["A-7", "", "", "-500 000", "Old system"] },
        { number: 3, cells: ["", "93 123 45 67", "", "250000.50", ""] },
        { number: 4, cells: ["", "", "Nobody", "0", ""] },
        { number: 5, cells: ["", "", "Vali", "abc", ""] },
      ],
    };
    const mapping: Mapping = {
      studentRef: 0,
      studentPhone: 1,
      studentName: 2,
      amount: 3,
      note: 4,
    };
    const base = ctx({
      students: [
        { id: "s1", fullName: "Ali", phone: "+998901112233", externalRef: "A-7" },
        { id: "s2", fullName: "Bobur", phone: "+998931234567", externalRef: null },
        { id: "s3", fullName: "Vali", phone: null, externalRef: null },
      ],
    });
    const result = validateImport("opening_balances", sheet, mapping, base);
    expect(result.issues.map((i) => `${i.row}:${i.field}:${i.code}`)).toEqual([
      "4:studentName:studentUnknown",
      "4:amount:amountZero",
      "5:studentName:studentNoKey",
      "5:amount:amount",
    ]);

    const valid = validateImport(
      "opening_balances",
      { ...sheet, rows: sheet.rows.slice(0, 2) },
      mapping,
      { ...base, openingBalances: new Set(["s2"]) },
    );
    expect(valid).toMatchObject({
      create: 1,
      skip: 1,
      issues: [],
      payload: [
        {
          externalRef: "A-7",
          phone: null,
          fullName: "Ali",
          amount: "-50000000",
          note: "Old system",
        },
        {
          externalRef: null,
          phone: "+998931234567",
          fullName: "Bobur",
          amount: "25000050",
          note: null,
        },
      ],
    });
  });
});
