import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  acceptInvite,
  createCenter,
  createGroup,
  en,
  inviteTeacher,
  logIn,
  settled,
  type Person,
} from "../helpers";

/**
 * `pnpm screenshots` (05-ui.md §7): seeds a demo center on a freshly reset local DB, captures uteach at
 * 1440 px and 390 px into docs/design/screenshots/uteach/, then builds reference-vs-uteach composites
 * in docs/design/screenshots/compare/. Not part of `pnpm e2e`.
 */
const ROOT = path.resolve(__dirname, "../../../../docs/design/screenshots");
const OUT = path.join(ROOT, "uteach");
const REF = path.join(ROOT, "reference");
const COMPARE = path.join(ROOT, "compare");

const OWNER: Person = {
  name: "Malika Karimova",
  login: "malika",
  phone: "+998990000005",
  password: "shots-pass-5",
};
const TEACHER: Person = {
  name: "Jasur Toshmatov",
  login: "jasur",
  phone: "+998990000006",
  password: "shots-pass-6",
};
const INVITED: Person[] = [
  { name: "Анна Смирнова", login: "anna", phone: "+998931234567", password: "" },
  { name: "Dilnoza Rahimova", login: "dilnoza", phone: "+998941234567", password: "" },
  { name: "Emily Carter", login: "emily", phone: "+998951234567", password: "" },
];

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.setTimeout(600_000);

async function shoot(page: Page, name: string, fullPage = true) {
  await settled(page);
  // Hide the Next.js dev-tools badge; it isn't part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // Let enter animations (dialogs, drawers, toasts) finish.
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
}

async function ownerPage(browser: Browser, viewport: typeof DESKTOP) {
  const context = await browser.newContext({ viewport, locale: "en-US" });
  const page = await context.newPage();
  await logIn(page, OWNER.login, OWNER.password);
  await expect(page).toHaveURL(/\/en\/home$/);
  return { context, page };
}

test("seed a demo center", async ({ page, browser }) => {
  await createCenter(page, OWNER, "Bright English", "Chilonzor");

  for (const name of ["Yunusobod", "Sergeli"]) {
    await page.goto("/en/settings/branches");
    await settled(page);
    await page.getByRole("button", { name: en.settings.branches.addButton }).click();
    const dialog = page.getByTestId("branch-dialog");
    await dialog.getByLabel(en.settings.branches.fields.name).fill(name);
    await dialog.getByLabel(en.settings.branches.fields.address).fill(`${name}, Amir Temur 12`);
    await dialog.getByRole("button", { name: en.settings.branches.addSubmit }).click();
    await expect(dialog).toBeHidden();
  }

  await page.getByRole("link", { name: "Chilonzor" }).first().click();
  await page.getByRole("tab", { name: en.settings.branches.tabRooms }).click();
  for (const [room, capacity] of [
    ["Room 101", "12"],
    ["Room 102", "16"],
    ["IELTS lab", "10"],
  ] as const) {
    await page.getByRole("button", { name: en.settings.rooms.add }).click();
    const dialog = page.getByTestId("room-dialog");
    await dialog.getByLabel(en.settings.rooms.fields.name).fill(room);
    await dialog.getByLabel(en.settings.rooms.fields.capacity).fill(capacity);
    await dialog.getByRole("button", { name: en.settings.rooms.add }).click();
    await expect(dialog).toBeHidden();
  }

  const url = await inviteTeacher(page, TEACHER, "Chilonzor");
  await acceptInvite(browser, url, TEACHER);
  for (const person of INVITED) await inviteTeacher(page, person, "Yunusobod");

  // Courses, levels and two groups for the M1 screens.
  for (const [course, levels] of [
    ["IELTS", ["5.5", "6.0", "6.5"]],
    ["General English", ["Elementary", "Pre-Intermediate", "Intermediate"]],
  ] as const) {
    await page.goto("/en/settings/courses");
    await settled(page);
    await page.getByRole("button", { name: en.courses.addButton }).click();
    const dialog = page.getByTestId("course-dialog");
    await dialog.getByLabel(en.courses.fields.name).fill(course);
    await dialog.getByLabel(en.courses.fields.price).fill(course === "IELTS" ? "750000" : "600000");
    await dialog.getByRole("button", { name: en.courses.addSubmit }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name: en.common.rowOpen.replace("{name}", course) }).click();
    for (const level of levels) {
      await page.getByRole("button", { name: en.courses.levels.add }).click();
      const levelDialog = page.getByTestId("level-dialog");
      await levelDialog.getByLabel(en.courses.levels.name).fill(level);
      await levelDialog.getByRole("button", { name: en.courses.levels.add }).click();
      await expect(levelDialog).toBeHidden();
    }
  }
  await createGroup(page, { course: "IELTS", room: "Room 101", teacher: TEACHER.name, times: 3 });
  await createGroup(page, {
    room: "Room 102",
    teacher: OWNER.name,
    times: 2,
    days: ["Tuesday", "Thursday"],
    firstStart: "10:00",
  });
  await createGroup(page, {
    room: "IELTS lab",
    teacher: OWNER.name,
    times: 2,
    days: ["Monday", "Wednesday"],
    firstStart: "15:00",
  });

  // Students through the Excel import (also exercises it).
  const names = [
    "Aziza Karimova",
    "Bekzod Tursunov",
    "Анна Ким",
    "Diyorbek Rahimov",
    "Elena Pak",
    "Farrux Islomov",
    "Gulnoza Yusupova",
    "Hasan Qodirov",
    "Ирина Ли",
    "Jamshid Aliev",
    "Kamila Saidova",
    "Laylo Ergasheva",
  ];
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Students");
  sheet.addRow(["F.I.Sh.", "Telefon", "Ota-ona", "Ota-ona telefoni"]);
  names.forEach((n, i) =>
    sheet.addRow([
      n,
      `+99893${4000000 + i}`,
      `Parent of ${n.split(" ")[0]}`,
      `+99894${4000000 + i}`,
    ]),
  );
  await page.goto("/en/import?kind=students");
  await settled(page);
  await page.getByTestId("import-file").setInputFiles({
    name: "students.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  });
  await page.getByRole("button", { name: en.import.check }).click();
  await page.getByTestId("import-run").click();
  await expect(page.getByText(`${names.length} records added`)).toBeVisible();
});

test("capture uteach", async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });

  for (const [viewport, w] of [
    [DESKTOP, 1440],
    [PHONE, 390],
  ] as const) {
    const { context, page } = await ownerPage(browser, viewport);

    await shoot(page, `home-${w}`);
    await page.goto("/en/staff");
    await shoot(page, `staff-${w}`);
    await page.getByRole("button", { name: en.staff.inviteButton }).click();
    await expect(page.getByTestId("invite-dialog")).toBeVisible();
    await shoot(page, `staff-invite-dialog-${w}`, false);
    await page.keyboard.press("Escape");

    await page.goto("/en/settings/branches");
    await settled(page);
    await page.getByRole("link", { name: "Chilonzor" }).first().click();
    await page.getByRole("tab", { name: en.settings.branches.tabRooms }).click();
    await shoot(page, `branch-detail-${w}`);

    await page.goto("/en/dev/ui");
    await shoot(page, `dev-ui-${w}`);

    await page.goto("/en/settings/courses");
    await shoot(page, `courses-${w}`);
    await page.goto("/en/groups");
    await shoot(page, `groups-${w}`);
    await page.getByRole("button", { name: en.groups.addButton }).click();
    await expect(page.getByTestId("group-dialog")).toBeVisible();
    await shoot(page, `group-dialog-${w}`, false);
    await page.keyboard.press("Escape");
    await page
      .getByRole("link", { name: /^Open IELTS/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);
    await shoot(page, `group-detail-${w}`);
    await page.getByRole("tab", { name: en.groups.tabSchedule }).click();
    await shoot(page, `group-schedule-${w}`);

    const nextMonday = (() => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(
        new Date(),
      );
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 8 - (d.getUTCDay() || 7));
      return d.toISOString().slice(0, 10);
    })();
    await page.goto(`/en/schedule?date=${nextMonday}`);
    await shoot(page, `schedule-week-${w}`);
    if (w === 1440) {
      await page.goto(`/en/schedule?date=${nextMonday}&view=day`);
      await shoot(page, "schedule-day-rooms-1440");
    }

    await page.goto("/ru/staff");
    await shoot(page, `staff-ru-${w}`);

    await page.goto("/en/students");
    await shoot(page, `students-${w}`);
    await page
      .getByRole("link", { name: /^Open Aziza Karimova/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await page.getByRole("tab", { name: en.students.tabGuardians }).click();
    await shoot(page, `student-detail-${w}`);
    await page.goto("/en/import?kind=groups");
    await shoot(page, `import-${w}`);
    await page.goto("/en/onboarding/courses");
    await shoot(page, `onboarding-courses-${w}`);

    if (w === 390) {
      await page.goto("/en/home");
      await settled(page);
      await page.getByRole("button", { name: en.nav.openMenu }).click();
      await shoot(page, "menu-open-390", false);
    }
    await context.close();
  }

  // Teacher's Today with the drawer open, and the Uzbek login page.
  const context = await browser.newContext({ viewport: PHONE, locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/uz/login");
  await shoot(page, "login-uz-390");
  await logIn(page, TEACHER.login, TEACHER.password);
  await expect(page).toHaveURL(/\/en\/today$/);
  await shoot(page, "today-390");
  await page.getByRole("button", { name: en.nav.openMenu }).click();
  await shoot(page, "today-menu-open-390", false);
  await context.close();
});

/** Reference screenshot → matching uteach screenshot. */
const PAIRS: [string, string][] = [
  ["dashboard-1440", "home-1440"],
  ["dashboard-390", "home-390"],
  ["teachers-1440", "staff-1440"],
  ["teachers-390", "staff-390"],
  ["teachers-add-dialog-1440", "staff-invite-dialog-1440"],
  ["teachers-add-dialog-390", "staff-invite-dialog-390"],
  ["teachers-details-1440", "branch-detail-1440"],
  ["teachers-details-390", "branch-detail-390"],
  ["mobile-menu-open-390", "menu-open-390"],
];

test("build side-by-side composites", async ({ page }) => {
  fs.mkdirSync(COMPARE, { recursive: true });
  const dataUri = (file: string) =>
    `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;

  for (const [ref, ours] of PAIRS) {
    const wide = ref.endsWith("1440");
    await page.setViewportSize({ width: wide ? 1440 * 2 + 72 : 390 * 2 + 72, height: 900 });
    // Plain composite page for this script only; it is never part of the app.
    await page.setContent(`<!doctype html><html><body style="margin:0;padding:24px;display:flex;gap:24px;align-items:flex-start;font:600 18px system-ui;background:Canvas;color:CanvasText">
      <figure style="margin:0"><figcaption style="margin-bottom:8px">reference · ${ref}</figcaption><img src="${dataUri(path.join(REF, `${ref}.png`))}"></figure>
      <figure style="margin:0"><figcaption style="margin-bottom:8px">uteach · ${ours}</figcaption><img src="${dataUri(path.join(OUT, `${ours}.png`))}"></figure>
    </body></html>`);
    await page.screenshot({ path: path.join(COMPARE, `${ours}.png`), fullPage: true });
  }
});
