import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Sidebar navigation", () => {
  test("all agent sidebar links navigate to correct pages", async ({ page }) => {
    await login(page);

    // Dashboard
    await page.click('nav a:has-text("Dashboard")');
    await page.waitForURL("**/dashboard");
    await expect(page.locator("h1").filter({ hasText: "Dashboard" })).toBeVisible();

    // Ringare (Dialer)
    await page.click('nav a:has-text("Ringare")');
    await page.waitForURL("**/dialer");
    await expect(
      page.getByText("Redo att börja ringa?").or(page.locator("h1")),
    ).toBeVisible();

    // Möten (Meetings)
    await page.click('nav a:has-text("Möten")');
    await page.waitForURL("**/meetings");
    // The meetings page has a heading with "Möten"
    await expect(page.locator("h1")).toBeVisible();

    // Historik (History)
    await page.click('nav a:has-text("Historik")');
    await page.waitForURL("**/history");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("admin sidebar links visible and navigable for admin user", async ({
    page,
  }) => {
    await login(page, "admin@saleflow.se", "admin123");

    // Användare
    await page.click('nav a:has-text("Användare")');
    await page.waitForURL("**/admin/users");
    await expect(page.locator("h1").filter({ hasText: "Användare" })).toBeVisible();

    // Importera
    await page.click('nav a:has-text("Importera")');
    await page.waitForURL("**/admin/import");
    await expect(
      page.locator("h1").filter({ hasText: "Importera" }),
    ).toBeVisible();

    // Statistik
    await page.click('nav a:has-text("Statistik")');
    await page.waitForURL("**/admin/stats");
    await expect(page.locator("h1")).toBeVisible();
  });
});
