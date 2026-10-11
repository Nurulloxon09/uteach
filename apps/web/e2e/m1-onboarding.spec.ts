import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { createGroup, en, logIn, settled, signUp } from "./helpers";

/**
 * M1 E2E (30-milestones M1): onboarding wizard (resumable) → course from a preset + group with a schedule →
 * enroll a student with a guardian → the lessons are in the timetable. Then Excel import: a 300-row students
 * file, the same file again (no duplicates), and a broken file (row/column errors, nothing written).
 */
const OWNER = { name: "Ziyoda Owner", phone: "+998990000011", password: "owner-pass-11" };

function nextMonday(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 8 - (d.getUTCDay() || 7));
  return d.toISOString().slice(0, 10);
}

/** An .xlsx with the given header row and data rows (built in memory). */
async function workbook(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Students");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function uploadStudents(page: Page, file: Buffer, name: string) {
  await page.goto("/en/import?kind=students");
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

test.describe.serial("M1 · onboarding wizard, happy path and Excel import", () => {
  test("wizard → course → group → student with guardian → timetable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/signup");
    await signUp(page, OWNER);
    await expect(page).toHaveURL(/\/en\/onboarding$/);
    await settled(page);

    // Steps 1–2: center and first branch.
    await page.getByLabel(en.onboarding.centerName).fill("Ziyo Academy");
    await page.getByLabel(en.onboarding.branchName).fill("Chilonzor");
    await page.getByRole("button", { name: en.onboarding.submit }).click();

    // Step 3: rooms.
    await expect(page).toHaveURL(/\/en\/onboarding\/rooms$/);
    await settled(page);
    await page
      .getByLabel(en.onboarding.roomName.replace("{n}", "1"), { exact: true })
      .fill("Room A");
    await page.getByLabel(en.onboarding.roomCapacity).first().fill("12");
    await page.getByTestId("continue-step").click();

    // Step 4: a preset course (IELTS comes with its levels).
    await expect(page).toHaveURL(/\/en\/onboarding\/courses$/);
    await settled(page);
    await page.getByRole("checkbox", { name: en.onboarding.presets.ielts.name }).check();
    await page.getByTestId("continue-step").click();
    await expect(page).toHaveURL(/\/en\/onboarding\/import$/);

    // Resumable: leave, come back from Home's "Continue setup".
    await page.getByTestId("finish-later").click();
    await expect(page).toHaveURL(/\/en\/home$/);
    await expect(page.getByTestId("continue-setup")).toContainText(en.home.continueSetup);
    await page.getByRole("link", { name: en.home.continueSetupButton }).click();
    await expect(page).toHaveURL(/\/en\/onboarding\/import$/);
    await settled(page);
    await page.getByTestId("skip-step").click();
    await expect(page).toHaveURL(/\/en\/onboarding\/staff$/);
    await settled(page);
    await page.getByTestId("continue-step").click();
    await expect(page).toHaveURL(/\/en\/home$/);
    await expect(page.getByTestId("continue-setup")).toHaveCount(0);

    // The preset created IELTS with 4 levels.
    await page.goto("/en/settings/courses");
    await settled(page);
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", "IELTS") }).click();
    await expect(page.getByTestId("level-row")).toHaveCount(4);

    // A group with Mon/Wed/Fri 18:00, taught by the owner in Room A.
    await createGroup(page, { course: "IELTS", room: "Room A", teacher: OWNER.name, times: 3 });

    // A student with a guardian, enrolled into the group.
    await page.goto("/en/students");
    await settled(page);
    await page.getByRole("button", { name: en.students.addButton }).click();
    const add = page.getByTestId("student-dialog");
    await add.getByLabel(en.students.fields.fullName).fill("Kamola Rashidova");
    await add.getByLabel(en.students.guardian.name).fill("Dilfuza Rashidova");
    await add.getByLabel(en.students.guardian.phone).fill("+998905556677");
    await add.getByRole("button", { name: en.students.addSubmit }).click();
    await expect(add).toBeHidden();
    await page
      .getByRole("link", { name: en.common.rowOpen.replace("{name}", "Kamola Rashidova") })
      .click();
    await settled(page);
    await page.getByRole("button", { name: en.enrollments.enroll }).click();
    const enroll = page.getByTestId("enroll-dialog");
    await enroll.getByLabel(en.enrollments.group, { exact: true }).click();
    await page.getByRole("option", { name: /IELTS · Mon\/Wed\/Fri 18:00/ }).click();
    await enroll.getByRole("button", { name: en.enrollments.enrollSubmit }).click();
    await expect(enroll).toBeHidden();
    await expect(page.getByTestId("enrollment-row")).toContainText("IELTS · Mon/Wed/Fri 18:00");

    // Next week's timetable shows the group's three lessons.
    await page.goto(`/en/schedule?date=${nextMonday()}`);
    await settled(page);
    await expect(page.getByTestId("timetable-lesson")).toHaveCount(3);
    await expect(page.getByTestId("timetable-lesson").first()).toContainText(
      "IELTS · Mon/Wed/Fri 18:00",
    );
  });

  test("Excel import: 300 students, again without duplicates, and a broken file", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await logIn(page, OWNER.phone, OWNER.password);
    await expect(page).toHaveURL(/\/en\/home$/);

    // Column names in Uzbek, Russian and English mixed, as real files are: the mapping is guessed.
    const headers = ["F.I.Sh.", "Телефон", "Guardian's phone", "Ota-ona"];
    const rows = Array.from({ length: 300 }, (_, i) => [
      `Import Student ${i + 1}`,
      `+99893${String(2000000 + i)}`,
      `+99894${String(2000000 + i)}`,
      `Parent ${i + 1}`,
    ]);
    const file = await workbook(headers, rows);

    await uploadStudents(page, file, "students.xlsx");
    await expect(page.getByTestId("import-summary")).toContainText("300 new");
    await page.getByTestId("import-run").click();
    await expect(page.getByText("300 records added")).toBeVisible();

    await page.goto("/en/students?q=Import%20Student%20300");
    await expect(page.getByTestId("student-row")).toHaveCount(1);

    // The same file again: everything is already there.
    await uploadStudents(page, file, "students-again.xlsx");
    await expect(page.getByTestId("import-summary")).toContainText("0 new");
    await expect(page.getByTestId("import-summary")).toContainText("300 already there");
    await expect(page.getByTestId("import-run")).toBeDisabled();

    // A broken file: problems listed by row and column, nothing imported.
    const broken = await workbook(headers, [
      ["", "+998931110001", "", ""],
      ["Broken Phone", "12", "", ""],
    ]);
    await uploadStudents(page, broken, "broken.xlsx");
    await expect(page.getByTestId("import-summary")).toContainText("2 problems");
    const issues = page.getByTestId("import-issue");
    await expect(issues).toHaveCount(2);
    await expect(issues.first()).toContainText(en.import.errors.required);
    await expect(issues.nth(1)).toContainText(en.import.errors.phone);
    await expect(page.getByTestId("import-run")).toHaveCount(0);

    await page.goto("/en/students?q=Broken");
    await expect(page.getByTestId("student-row")).toHaveCount(0);
  });
});
