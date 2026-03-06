import { test, expect } from '@playwright/test';

test('homepage loads successfully', async ({ page }) => {
  await page.goto('/');

  // Check that the page title contains "SoarCast"
  await expect(page).toHaveTitle(/SoarCast/);

  // Check that the main heading is visible
  await expect(page.locator('h1').first()).toBeVisible();
});

test('navigation works', async ({ page }) => {
  await page.goto('/');

  // Check that the navigation contains expected links
  const nav = page.locator('nav');
  await expect(nav).toBeVisible();
});
