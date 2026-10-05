import { expect, test } from '@playwright/test';
import {
  expectBottomNav,
  expectCleanLoad,
  expectCompactSampleBanner,
  expectGoogleSignInPopup,
  expectHuishoudenFrame,
  expectInstallable,
  expectSecurityHeaders,
  expectThemeConsistent,
} from '@huishouden/pwa-kit/e2e';
import { SUITE_ORIGIN } from '@huishouden/pwa-kit/site';

test('loads without runtime errors and shows the sample day', async ({ page }) => {
  await expectCleanLoad(page);
  await expect(page.getByText('Sample data')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Needs doing' })).toBeVisible();
  await expectHuishoudenFrame(page, { app: 'Health', portalUrl: '/' });
  await expect(page).toHaveTitle('Huishouden Health');
});

test('link previews say what Health is', async ({ page, request }) => {
  await page.goto('./');
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', 'Medicines and care for everyone at home');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${SUITE_ORIGIN}/health/og.png`);
  expect((await request.get('./og.png')).ok()).toBe(true);
});

test('is installable', ({ page, request }) => expectInstallable(page, request));

test('Google sign-in popup reaches Google with an allowed redirect URI', ({ page, context }) =>
  expectGoogleSignInPopup(page, context, async (p) => {
    await p.getByRole('button', { name: 'Sign in with Google' }).first().click();
  }));

test('sends the security headers and leaves sign-in un-framed', ({ request }) => expectSecurityHeaders(request, './', { camera: true }));

test('the Sample data banner is one line on a phone', ({ page }) => expectCompactSampleBanner(page, './'));

test('on a phone the sections are a bottom bar', ({ page }) => expectBottomNav(page, { path: './', labels: ['Today', 'Medicines', 'Visits', 'History', 'More'], more: ['Conditions', 'People'] }));

test('follows the suite theme: dark on a dark device, readable', ({ page }) => expectThemeConsistent(page, { path: './' }));
