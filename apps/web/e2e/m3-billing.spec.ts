import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { lessonIds, pauseCycleCron, resumeCycleCron, runCycleJob } from "./db";
import { addRoom, createCenter, createGroup, en, logIn, settled } from "./helpers";

/**
 * M3 E2E happy path (30-milestones M3): enroll a student → cycle 1 is charged (12 lessons) → record a cash
 * payment → print the receipt → balance 0 → mark 12 lessons → the next cycle's charge appears (the hourly job,
 * run directly) → after its due date the student is on the Debtors list, in the 0–30 bucket, and in the Excel
 * export. Then an opening balance comes in through the import and lands on the list too.
 *
 * Lessons in the past are backdated extra lessons: 12 daily lessons from 35 days ago. Enrolling catches up every
 * cycle already due, so lesson 13 (23 days ago) is added only after the marking; cycle 2 starts there and its
 * due date (start + 10 days) has passed.
 */
const OWNER = { name: "Nodira Owner", phone: "+998990000015", password: "owner-pass-15" };
const CENTER = "Debt Academy";
const GROUP = "Morning B";
const PAYER = { name: "Sardor Aliyev", phone: "+998931110001" };
const IMPORTED = { name: "Dilnoza Karimova", phone: "+998931110002" };

/** Today in Tashkent, and `days` from it. */
function tashkentDay(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function openStudentPayments(page: Page, name: string) {
  await page.goto("/en/students");
  await settled(page);
  await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", name) }).click();
  await settled(page);
  await page.getByRole("tab", { name: en.billing.tab }).click();
}

async function addStudent(page: Page, student: { name: string; phone: string }) {
  await page.goto("/en/students");
  await settled(page);
  await page.getByRole("button", { name: en.students.addButton }).click();
  const dialog = page.getByTestId("student-dialog");
  await dialog.getByLabel(en.students.fields.fullName).fill(student.name);
  await dialog.getByLabel(en.students.fields.phone, { exact: true }).fill(student.phone);
  await dialog.getByRole("button", { name: en.students.addSubmit }).click();
  await expect(dialog).toBeHidden();
}

/** An extra lesson at 09:00, `days` from today (negative = in the past), on the open group page. */
async function addPastLesson(page: Page, days: number) {
  await page.getByRole("button", { name: en.lessons.extra }).click();
  const extra = page.getByTestId("makeup-dialog");
  await extra.getByLabel(en.lessons.date).fill(tashkentDay(days));
  await extra.getByLabel(en.lessons.time).fill("09:00");
  await extra.getByLabel(en.lessons.duration).fill("60");
  await extra.getByRole("button", { name: en.lessons.makeupSubmit }).click();
  await expect(extra).toBeHidden();
}

async function workbook(headers: string[], rows: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Balances");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function uploadOpeningBalances(page: Page, file: Buffer, name: string) {
  await page.goto("/en/import?kind=opening_balances");
  await settled(page);
  await page.getByTestId("import-file").setInputFiles({
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await expect(page.getByTestId("import-mapping")).toBeVisible();
  await page.getByRole("button", { name: en.import.check }).click();
  await expect(page.getByTestId("import-summary")).toBeVisible();
}

test.describe.serial("M3 · billing happy path, debtors and opening balances", () => {
  test.beforeAll(async () => {
    await pauseCycleCron();
  });
  test.afterAll(async () => {
    await resumeCycleCron();
  });

  test("owner sets up a priced group with 12 past lessons and enrolls a student", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await createCenter(page, OWNER, CENTER, "Sergeli");
    await addRoom(page, "Sergeli", "Room 1");

    await page.goto("/en/settings/courses");
    await settled(page);
    await page.getByRole("button", { name: en.courses.addButton }).click();
    const course = page.getByTestId("course-dialog");
    await course.getByLabel(en.courses.fields.name).fill("English");
    await course.getByLabel(en.courses.fields.price).fill("600000");
    await course.getByRole("button", { name: en.courses.addSubmit }).click();
    await expect(course).toBeHidden();

    await createGroup(page, {
      room: "Room 1",
      teacher: OWNER.name,
      times: 0,
      name: GROUP,
      course: "English",
      startDate: tashkentDay(-40),
    });

    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", GROUP) }).click();
    await settled(page);
    for (let i = 0; i < 12; i++) await addPastLesson(page, -35 + i);
    expect(await lessonIds(CENTER, GROUP)).toHaveLength(12);

    await addStudent(page, PAYER);
    await addStudent(page, IMPORTED);

    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", PAYER.name) }).click();
    await settled(page);
    await page.getByRole("button", { name: en.enrollments.enroll }).click();
    const enroll = page.getByTestId("enroll-dialog");
    await enroll.getByLabel(en.enrollments.group, { exact: true }).click();
    await page
      .getByRole("option", { name: new RegExp(GROUP) })
      .first()
      .click();
    await enroll.getByLabel(en.enrollments.startDate).fill(tashkentDay(-35));
    await enroll.getByRole("button", { name: en.enrollments.enrollSubmit }).click();
    await expect(enroll).toBeHidden();
  });

  test("cycle 1 (12 lessons) is charged; a cash payment settles it and prints a receipt", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    await openStudentPayments(page, PAYER.name);
    const cycle = page.getByTestId("cycle-row");
    await expect(cycle).toHaveCount(1);
    await expect(cycle).toContainText(en.billing.cycles.cycle.replace("{no}", "1"));
    await expect(cycle).toContainText("600,000");
    await expect(page.getByTestId("student-balance")).toContainText("600,000");

    await page.getByRole("button", { name: en.billing.record.button }).click();
    const dialog = page.getByTestId("payment-dialog");
    await expect(dialog.getByLabel(en.billing.record.amount)).toHaveValue("600000");
    await dialog.getByRole("button", { name: en.billing.record.submit }).click();
    await expect(dialog.getByTestId("payment-recorded")).toContainText(/SER-\d{4}-000001/);
    const href = await dialog.getByTestId("receipt-80mm").getAttribute("href");
    const receipt = await page.request.get(href!);
    expect(receipt.headers()["content-type"]).toBe("application/pdf");
    await dialog.getByRole("button", { name: en.common.done }).click();

    await expect(page.getByTestId("student-balance")).toHaveText(en.billing.settled);
  });

  test("marking 12 lessons ends cycle 1; the hourly job charges cycle 2", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    const lessons = await lessonIds(CENTER, GROUP);
    for (const id of lessons) {
      await page.goto(`/en/attendance/${id}`);
      await settled(page);
      await page.getByTestId("all-present").click();
      await page.getByTestId("attendance-save").click();
      await expect(page.getByTestId("attendance-save")).toBeDisabled();
    }

    // Cycle 1 is used up, but there is no 13th lesson yet: no charge.
    await runCycleJob();
    await openStudentPayments(page, PAYER.name);
    await expect(page.getByTestId("cycle-row")).toHaveCount(1);

    await page.goto("/en/groups");
    await settled(page);
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", GROUP) }).click();
    await settled(page);
    await addPastLesson(page, -23);
    await runCycleJob();
    await runCycleJob(); // idempotent: still one new charge

    await openStudentPayments(page, PAYER.name);
    const cycles = page.getByTestId("cycle-row");
    await expect(cycles).toHaveCount(2);
    await expect(
      cycles.filter({ hasText: en.billing.cycles.cycle.replace("{no}", "2") }),
    ).toHaveCount(1);
    await expect(page.getByTestId("student-balance")).toContainText("600,000");
  });

  test("after the due date the student is on the Debtors list and in its Excel export", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    await page.getByRole("link", { name: en.nav.debtors }).first().click();
    await expect(page).toHaveURL(/\/en\/debtors$/);
    await settled(page);
    const row = page.getByTestId("debtor-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(PAYER.name);
    await expect(row).toContainText("600,000");
    await expect(row).toContainText(/\d+ days overdue/);
    await expect(row.getByRole("link", { name: PAYER.phone })).toHaveAttribute(
      "href",
      `tel:${PAYER.phone}`,
    );
    await expect(page.getByTestId("bucket-0-30")).toContainText("1 student");
    await expect(page.getByTestId("bucket-90+")).toContainText("0 students");

    // The bucket filter: nobody is over 90 days.
    await page.goto("/en/debtors?bucket=90%2B");
    await settled(page);
    await expect(page.getByTestId("debtor-row")).toHaveCount(0);
    await page.goto("/en/debtors");
    await settled(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("debtors-export").click(),
    ]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(await download.path());
    const sheet = book.worksheets[0]!;
    expect(sheet.getRow(1).getCell(1).text).toBe(en.debtors.student);
    expect(sheet.getRow(2).getCell(1).text).toBe(PAYER.name);
    expect(sheet.getRow(2).getCell(6).value).toBe(600000);
    expect(sheet.getRow(2).getCell(9).text).toBe(en.debtors.buckets["0-30"]);
  });

  test("an opening balance import adds a debt; importing it again adds nothing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    const file = await workbook(
      ["Telefon", "F.I.Sh.", "Qoldiq", "Izoh"],
      [[IMPORTED.phone, IMPORTED.name, "-250 000", "Old system"]],
    );
    await uploadOpeningBalances(page, file, "balances.xlsx");
    await expect(page.getByTestId("import-summary")).toContainText("1 new");
    await page.getByTestId("import-run").click();
    await expect(page.getByText("1 record added")).toBeVisible();

    await page.getByRole("link", { name: en.import.openDebtors }).click();
    await expect(page).toHaveURL(/\/en\/debtors$/);
    await settled(page);
    await expect(page.getByTestId("debtor-row")).toHaveCount(2);
    await expect(page.getByTestId("debtor-row").filter({ hasText: IMPORTED.name })).toContainText(
      "250,000",
    );
    await expect(page.getByText("Owed: UZS 850,000")).toBeVisible();

    await uploadOpeningBalances(page, file, "balances-again.xlsx");
    await expect(page.getByTestId("import-summary")).toContainText("0 new");
    await expect(page.getByTestId("import-summary")).toContainText("1 already there");
  });
});
