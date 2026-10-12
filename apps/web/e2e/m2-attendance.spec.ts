import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptInvite,
  addRoom,
  createCenter,
  createGroup,
  en,
  inviteTeacher,
  logIn,
  settled,
} from "./helpers";

/**
 * M2 E2E (30-milestones M2): a teacher on a 375 px phone opens today's lesson from Today, taps "All present",
 * marks the exceptions and saves in one request; the lesson is held and the admin sees the marks in the
 * Attendance list and the group's matrix, edits a cell there and exports the month to Excel.
 */
const OWNER = { name: "Shahnoza Owner", phone: "+998990000012", password: "owner-pass-12" };
const TEACHER = { name: "Jasur Teacher", phone: "+998990000013", password: "teach-pass-13" };
const GROUP = "Morning English";
const STUDENTS = Array.from({ length: 15 }, (_, i) => ({
  name: `Pupil ${String(i + 1).padStart(2, "0")} Karimov`,
  phone: `+99893555${String(i).padStart(4, "0")}`,
}));
const ABSENT = STUDENTS[2]!.name;
const LATE = STUDENTS[6]!.name;

/** Today in Tashkent and the current time rounded down to 5 minutes (same day, so Today lists it). */
function tashkentNow(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const minute = String(Math.floor(Number(get("minute")) / 5) * 5).padStart(2, "0");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${minute}` };
}

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function workbook(headers: string[], rows: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Data");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function importFile(
  page: Page,
  kind: "students" | "enrollments",
  file: Buffer,
  count: number,
) {
  await page.goto(`/en/import?kind=${kind}`);
  await settled(page);
  await page.getByTestId("import-file").setInputFiles({
    name: `${kind}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await expect(page.getByTestId("import-mapping")).toBeVisible();
  await page.getByRole("button", { name: en.import.check }).click();
  await expect(page.getByTestId("import-summary")).toContainText(`${count} new`);
  await page.getByTestId("import-run").click();
  await expect(page.getByText(`${count} records added`)).toBeVisible();
}

/** Picks a mark on one student's card (the visible button; the radio inside is screen-reader only). */
async function mark(page: Page, student: string, status: keyof typeof en.attendance.statusShort) {
  const row = page.getByTestId("attendance-row").filter({ hasText: student });
  await row.getByText(en.attendance.statusShort[status], { exact: true }).click();
  return row;
}

test.describe.serial("M2 · attendance", () => {
  const now = tashkentNow();

  test("owner sets up a group of 15 with a lesson now", async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, "Davomat Academy", "Chilonzor");
    await addRoom(page, "Chilonzor", "Room 1");
    const url = await inviteTeacher(page, TEACHER, "Chilonzor");
    await acceptInvite(browser, url, TEACHER);

    await page.goto("/en/settings/courses");
    await settled(page);
    await page.getByRole("button", { name: en.courses.addButton }).click();
    const course = page.getByTestId("course-dialog");
    await course.getByLabel(en.courses.fields.name).fill("English");
    await course.getByRole("button", { name: en.courses.addSubmit }).click();
    await expect(course).toBeHidden();

    await createGroup(page, { room: "Room 1", teacher: TEACHER.name, times: 0, name: GROUP });
    await expect(page.getByTestId("group-row")).toContainText(GROUP);

    // 15 students and their enrollments from Excel (a week ago).
    await importFile(
      page,
      "students",
      await workbook(
        [en.import.fields.students.fullName, en.import.fields.students.phone],
        STUDENTS.map((s) => [s.name, s.phone]),
      ),
      15,
    );
    await importFile(
      page,
      "enrollments",
      await workbook(
        [
          en.import.fields.enrollments.studentPhone,
          en.import.fields.enrollments.group,
          en.import.fields.enrollments.startDate,
        ],
        STUDENTS.map((s) => [s.phone, GROUP, daysBefore(now.date, 7)]),
      ),
      15,
    );

    // A lesson starting now (an extra lesson outside the weekly times).
    await page.goto("/en/groups");
    await settled(page);
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", GROUP) }).click();
    await page.getByRole("button", { name: en.lessons.extra }).click();
    const extra = page.getByTestId("makeup-dialog");
    await extra.getByLabel(en.lessons.date).fill(now.date);
    await extra.getByLabel(en.lessons.time).fill(now.time);
    await extra.getByLabel(en.lessons.duration).fill("60");
    await extra.getByRole("button", { name: en.lessons.makeupSubmit }).click();
    await expect(extra).toBeHidden();
    await expect(page.getByTestId("lesson-row")).toHaveCount(1);
  });

  test("teacher on a 375 px phone marks 15 students in one request", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await logIn(page, TEACHER.phone, TEACHER.password);
    await expect(page).toHaveURL(/\/en\/today$/);

    const lesson = page.getByTestId("today-lesson").filter({ hasText: GROUP });
    await expect(lesson).toContainText(en.attendance.chip.toMark);
    await lesson.getByRole("link").click();
    await expect(page).toHaveURL(/\/en\/attendance\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("sheet-title")).toHaveText(GROUP);
    await expect(page.getByTestId("attendance-row")).toHaveCount(15);
    await settled(page);

    // "All present" + two exceptions, then one Save.
    const started = Date.now();
    await page.getByTestId("all-present").click();
    await expect(page.getByTestId("attendance-counter")).toHaveText("15 of 15 marked");
    await mark(page, ABSENT, "absent");
    const late = await mark(page, LATE, "late");
    await late.getByLabel(en.attendance.lateMinutes).fill("10");
    await page.getByLabel(en.attendance.topic).fill("Past simple");

    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST") posts.push(r.url());
    });
    await page.getByTestId("attendance-save").click();
    await expect(page.getByText("Attendance saved · 1 absence alert queued")).toBeVisible();
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(posts).toHaveLength(1);

    // Saved: the lesson is held and the marks come back after a reload.
    await page.reload();
    await settled(page);
    await expect(page.getByText(en.lessons.status.held, { exact: true })).toBeVisible();
    await expect(page.getByTestId("attendance-row").filter({ hasText: ABSENT })).toHaveAttribute(
      "data-status",
      "absent",
    );
    await expect(page.getByTestId("attendance-row").filter({ hasText: LATE })).toHaveAttribute(
      "data-status",
      "late",
    );
    await expect(page.getByLabel(en.attendance.topic)).toHaveValue("Past simple");
    await expect(page.getByTestId("attendance-save")).toBeDisabled();

    await page.goto("/en/today");
    await settled(page);
    await expect(page.getByTestId("today-lesson").filter({ hasText: GROUP })).toContainText(
      "15/15 marked",
    );
    await context.close();
  });

  test("the admin sees the marks", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await page
      .getByRole("complementary", { name: en.nav.menu })
      .getByRole("link", { name: en.nav.attendance })
      .click();
    await expect(page).toHaveURL(/\/en\/attendance$/);
    const row = page.getByTestId("attendance-lesson").filter({ hasText: GROUP });
    await expect(row).toContainText("15/15 marked");
    await expect(row).toContainText("1 absent");
    await row.getByRole("link", { name: new RegExp(GROUP) }).click();
    await expect(page.getByTestId("attendance-row").filter({ hasText: ABSENT })).toHaveAttribute(
      "data-status",
      "absent",
    );
    await expect(page.getByTestId("sheet-banner")).toHaveCount(0);
  });

  test("the admin sees the month in the group's matrix, edits a cell and exports it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);
    await page.goto("/en/groups");
    await settled(page);
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", GROUP) }).click();
    // The Lessons tab counts the marks too.
    await expect(page.getByTestId("lesson-row")).toContainText("15/15 marked");
    await page.getByRole("tab", { name: en.groups.tabAttendance }).click();

    const matrixRow = (name: string) => page.getByTestId("matrix-row").filter({ hasText: name });
    await expect(page.getByTestId("matrix-row")).toHaveCount(15);
    await expect(matrixRow(ABSENT).getByTestId("matrix-cell")).toHaveAttribute(
      "data-status",
      "absent",
    );
    await expect(matrixRow(ABSENT)).toContainText("0%");
    await expect(matrixRow(LATE).getByTestId("matrix-cell")).toHaveAttribute("data-status", "late");
    await expect(matrixRow(LATE)).toContainText("100%");

    // Admin edit: absent → excused; excused counts neither way, so the rate becomes "—".
    await matrixRow(ABSENT)
      .getByRole("button", { name: /^Change the mark of/ })
      .click();
    await page.getByRole("button", { name: en.attendance.status.excused, exact: true }).click();
    await expect(page.getByText(en.attendance.matrix.saved)).toBeVisible();
    await expect(matrixRow(ABSENT).getByTestId("matrix-cell")).toHaveAttribute(
      "data-status",
      "excused",
    );
    await expect(matrixRow(ABSENT)).toContainText("—");

    // Excel: the same cells and rate as the screen.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("attendance-export").click(),
    ]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(await download.path());
    const sheet = book.worksheets[0]!;
    const rowOf = (name: string) => {
      let found: ExcelJS.Row | undefined;
      sheet.eachRow((row) => {
        if (row.getCell(1).text === name) found = row;
      });
      return found!;
    };
    expect(sheet.getRow(2).getCell(1).text).toBe(en.attendance.matrix.student);
    // Columns: name, the lesson, P, L, A, E, rate.
    expect(rowOf(ABSENT).getCell(2).text).toBe(en.attendance.letter.excused);
    expect(rowOf(ABSENT).getCell(7).text).toBe("");
    expect(rowOf(LATE).getCell(2).text).toBe(en.attendance.letter.late);
    expect(rowOf(LATE).getCell(4).value).toBe(1);
    expect(rowOf(LATE).getCell(7).value).toBe(1);
    expect(rowOf(STUDENTS[0]!.name).getCell(2).text).toBe(en.attendance.letter.present);
  });
});
