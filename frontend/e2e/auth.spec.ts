import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Auth", () => {
  test("login success — redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "agent@saleflow.se");
    await page.fill('input[type="password"]', "agent123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Dashboard")).toBeVisible();
  });

  test("login failure — shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "agent@saleflow.se");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Stay on login, error appears
    await expect(page).toHaveURL(/\/login/);
    // The error paragraph appears when login.isError is true
    const errorEl = page.locator("p.text-sm").filter({ hasText: /.+/ }).first();
    await expect(errorEl).toBeVisible({ timeout: 10000 });
  });

  test("protected route redirect — /dashboard redirects to /login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout — redirects to /login", async ({ page }) => {
    await login(page);
    // "Logga ut" button is in the Topbar
    await page.click('button:has-text("Logga ut")');
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
  });
});
