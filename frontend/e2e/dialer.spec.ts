import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Dialer", () => {
  test("full dialer flow — click Nästa kund, lead card with company and phone visible", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dialer");
    // Initial state: "Redo att börja ringa?" prompt with Nästa kund button
    await expect(page.getByText("Redo att börja ringa?")).toBeVisible();
    await page.click('button:has-text("Nästa kund")');
    // Wait for lead detail to load — the LeadInfo card will render with a tel link
    await expect(page.locator('a[href^="tel:"]')).toBeVisible({ timeout: 15000 });
    // The lead company name appears as the page h1
    const heading = page.locator('h1');
    await expect(heading).not.toBeEmpty();
  });

  test("submit no_answer outcome — click Svarar ej twice, next state loads", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dialer");
    await page.click('button:has-text("Nästa kund")');
    // Wait for the outcome panel to render
    await expect(page.getByText("Utfall")).toBeVisible({ timeout: 15000 });
    // First click: select
    await page.click('button:has-text("Svarar ej")');
    // Second click: confirm (label changes to "Bekräfta: Svarar ej")
    await page.click('button:has-text("Bekräfta: Svarar ej")');
    // After submit: either a new lead loads (tel link) or empty queue message
    await expect(
      page
        .locator('a[href^="tel:"]')
        .or(page.getByText("Redo att börja ringa?"))
        .or(page.getByText("Kunde inte hämta nästa kund")),
    ).toBeVisible({ timeout: 15000 });
  });

  test("submit meeting_booked — fill date and time, confirm, next state loads", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dialer");
    await page.click('button:has-text("Nästa kund")');
    await expect(page.getByText("Utfall")).toBeVisible({ timeout: 15000 });
    // Select meeting_booked
    await page.click('button:has-text("Möte bokat")');
    // Date and time inputs appear
    await page.fill('input[type="date"]', "2026-04-15");
    await page.fill('input[type="time"]', "10:00");
    // Confirm
    await page.click('button:has-text("Bekräfta: Möte bokat")');
    // After submit: either new lead or back to initial dialer state
    await expect(
      page
        .locator('a[href^="tel:"]')
        .or(page.getByText("Redo att börja ringa?"))
        .or(page.getByText("Kunde inte hämta nästa kund")),
    ).toBeVisible({ timeout: 15000 });
  });
});
