import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function enterDemo(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Explore demo" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("authentication", () => {
  test("signup → dashboard → logout → login", async ({ page }) => {
    const email = `e2e-${unique()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Name").fill("E2E Tester");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-42");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByText("No competitors tracked yet")).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).first().click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL((u) => u.pathname === "/");

    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-42");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("validation messages and wrong password", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#form-error")).toContainText(/incorrect|Too many/);
  });

  test("explore demo opens the read-only demo workspace", async ({ page }) => {
    await enterDemo(page);
    await expect(page.getByText("Demo dataset — synthetic reviews.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Competitive health" })).toBeVisible();
    await page.goto("/competitors");
    const add = page.getByRole("button", { name: "Add competitor" });
    await expect(add).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("product", () => {
  test("add competitor with CSV upload shows awaiting analysis", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("CSV Tester");
    await page.getByLabel("Work email").fill(`csv-${unique()}@example.com`);
    await page.getByLabel("Password").fill("correct-horse-42");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/competitors/new");
    await page.getByLabel("Name", { exact: true }).fill("Acme Grocer");
    await page.getByText("Upload a CSV").click();
    await page.getByLabel("CSV file").setInputFiles({
      name: "acme.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("text,rating,date,userName\nDelivery was late,2,2026-09-01,bob\nGreat prices,5,2026-09-02,ann\n"),
    });
    await page.getByRole("button", { name: "Add competitor" }).click();
    await expect(page.getByText("2 reviews were imported")).toBeVisible();
    await page.goto("/competitors");
    await expect(page.getByRole("row", { name: /Acme Grocer/ })).toContainText("Awaiting first analysis run");
  });

  test("review explorer filters live in the URL and search works", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/reviews");
    await page.getByLabel("Competitor").selectOption("kwikr");
    await page.waitForURL(/competitor=kwikr/);
    await page.getByLabel("Aspect", { exact: true }).selectOption("refunds_returns");
    await page.waitForURL(/aspect=refunds_returns/);
    await page.getByLabel("Keyword").fill("refund");
    await page.waitForURL(/q=refund/);
    const items = page.locator("main li").filter({ hasText: "Kwikr" });
    await expect(items.first()).toBeVisible();
    await expect(page.locator("main mark").first()).toBeVisible();
    // back button restores the previous filter state
    await page.goBack();
    await expect(page).not.toHaveURL(/q=refund/);
    // empty state with clear action
    await page.goto("/reviews?q=zzzxqvnonexistent");
    await expect(page.getByText("No reviews match these filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/reviews$/);
  });

  test("dashboard, trends and compare render demo findings", async ({ page }) => {
    await enterDemo(page);
    await expect(page.getByText(/Kwikr · Refunds & returns/).first()).toBeVisible();
    await page.goto("/compare");
    await expect(page.getByRole("heading", { name: "Competitive gap matrix" })).toBeVisible();
    await expect(page.getByText("Weak for everyone")).toBeVisible();
    await page.goto("/trends?range=90d");
    await expect(page.getByRole("heading", { name: "Uncategorised themes" })).toBeVisible();
  });

  test("generate a report, download the PDF, share and revoke", async ({ page, browser }) => {
    await enterDemo(page);
    await page.goto("/reports/new");
    await page.getByRole("button", { name: "Generate report" }).click();
    await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: /Executive Summary/ })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await page.getByRole("button", { name: "Create share link" }).click();
    const link = (await page.locator("code").first().textContent())!;
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(link);
    await expect(anon.getByRole("heading", { level: 1 })).toContainText("competitive review");
    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Revoked")).toBeVisible();
    await anon.goto(link);
    await expect(anon.getByText("This link is not available")).toBeVisible();
  });
});

test.describe("accessibility", () => {
  for (const path of ["/", "/login"]) {
    test(`no serious axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    });
  }
  for (const path of ["/dashboard", "/reviews", "/competitors/kwikr?tab=voice"]) {
    test(`no serious axe violations on ${path}`, async ({ page }) => {
      await enterDemo(page);
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".recharts-wrapper").analyze();
      expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
});
