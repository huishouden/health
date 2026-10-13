import { expect, test, type Page } from '@playwright/test';

// A reload (an update applying, kit STANDARD.md "Updates") and Back return to the screen in the
// address: the tab and the person on it. The signed-out sample household.

const currentTab = (page: Page) => page.locator('nav[slot="nav"] button[aria-current="page"]');
const tabButton = (page: Page, name: string) => page.locator('nav[slot="nav"]').getByRole('button', { name, exact: true });

test('a reload and Back return to the screen in the address', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Sample data')).toBeVisible();
  await expect(currentTab(page)).toHaveText('Today');
  await tabButton(page, 'Medicines').click();
  await expect(page).toHaveURL(/[?&]tab=medicines/);
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await expect(page).toHaveURL(/[?&]person=/);
  await tabButton(page, 'Visits').click();
  await expect(page).toHaveURL(/[?&]tab=visits/);

  await page.reload();
  await expect(currentTab(page)).toHaveText('Visits');
  await expect(page).toHaveURL(/[?&]person=/);

  await page.goBack();
  await expect(currentTab(page)).toHaveText('Medicines');
  await page.goBack();
  await expect(currentTab(page)).toHaveText('Today');
  await page.goForward();
  await expect(currentTab(page)).toHaveText('Medicines');
});
