import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Dashboard", () => {
  test("dashboard loads — stat cards and Nästa kund button visible", async ({
    page,
  }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
    // Heading
    await expect(page.getByText("Dashboard")).toBeVisible();
    // At least one StatCard label is visible
    await expect(page.getByText("Samtal idag")).toBeVisible();
    await expect(page.getByText("Leads kvar")).toBeVisible();
    await expect(page.getByText("Möten")).toBeVisible();
    // Primary CTA button
    await expect(page.locator('button:has-text("Nästa kund")')).toBeVisible();
  });

  test("navigate to dialer — clicking Nästa kund goes to /dialer", async ({
    page,
  }) => {
    await login(page);
    await page.click('button:has-text("Nästa kund")');
    await page.waitForURL("**/dialer");
    await expect(page).toHaveURL(/\/dialer/);
  });
});
