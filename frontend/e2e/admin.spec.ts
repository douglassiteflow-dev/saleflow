import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Admin", () => {
  test("admin access — admin user can view /admin/users with user table", async ({
    page,
  }) => {
    await login(page, "admin@saleflow.se", "admin123");
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users/);
    // Page heading
    await expect(page.getByText("Användare")).toBeVisible();
    // Table is rendered: wait for at least one row with a user email
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("td").filter({ hasText: /@saleflow\.se/ }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("agent blocked from admin — redirected to /dashboard", async ({
    page,
  }) => {
    await login(page, "agent@saleflow.se", "agent123");
    await page.goto("/admin/users");
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("import page loads — file upload input visible for admin", async ({
    page,
  }) => {
    await login(page, "admin@saleflow.se", "admin123");
    await page.goto("/admin/import");
    await expect(page).toHaveURL(/\/admin\/import/);
    await expect(page.getByText("Importera leads")).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });
});
