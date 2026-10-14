import { expect, test } from "@playwright/test";
import en from "@uteach/i18n/messages/en.json";
import ru from "@uteach/i18n/messages/ru.json";
import uz from "@uteach/i18n/messages/uz.json";

/**
 * M7e public pages, signed out: the landing page with the public plans and sign-up in every language, and the
 * draft terms and privacy pages.
 */
const CATALOGS = { uz, ru, en } as const;

for (const [locale, m] of Object.entries(CATALOGS)) {
  test(`landing, terms and privacy (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.public.hero.title);
    await expect(page.getByTestId("feature-card")).toHaveCount(8);
    // The seeded public plans (starter, growth, pro); the hidden trial plan never shows.
    await expect(page.getByTestId("plan-card")).toHaveCount(3);
    await expect(page.getByTestId("plan-card").first()).toContainText(m.public.plans.perMonth);

    await page.getByRole("link", { name: m.public.footer.terms }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/terms$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.legal.terms.title);
    await expect(page.getByTestId("legal-draft")).toContainText(m.legal.draftBody);

    await page.getByRole("link", { name: m.public.footer.privacy }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.legal.privacy.title);
    await expect(page.getByTestId("legal-draft")).toBeVisible();

    await page.goto(`/${locale}`);
    await page.getByTestId("hero-signup").click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/signup$`));
  });
}

test("search engines are kept out outside production", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(await res.text()).toContain("Disallow: /");
});
