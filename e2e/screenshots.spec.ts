import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { captureScreenshot } from '@huishouden/pwa-kit/e2e';

// README images of the signed-out app's invented sample household, refreshed by CI after each
// deploy. The clock is frozen at the sample's moment so every run renders the same.
const fixedTime = '2031-05-14T10:30:00';
const needsDoing = (p: import('@playwright/test').Page) => expect(p.getByRole('region', { name: 'Needs doing' }).getByText('Metformin 500 mg')).toBeVisible();

test('today', ({ page }) => captureScreenshot(page, 'today', { fixedTime, prepare: needsDoing }));

test('medicines', ({ page }) =>
  captureScreenshot(page, 'medicines', { path: './?tab=medicines&person=demo-person-ria', fixedTime, prepare: (p) => expect(p.getByText('6 tablets left')).toBeVisible() }));

test('visits', ({ page }) =>
  captureScreenshot(page, 'visits', { path: './?tab=visits', fixedTime, prepare: (p) => expect(p.getByRole('region', { name: 'Coming up' }).getByText('Diabetes check')).toBeVisible() }));

test('history', ({ page }) =>
  captureScreenshot(page, 'history', { path: './?tab=history&person=demo-person-ria', fixedTime, prepare: (p) => expect(p.getByRole('region', { name: "Oma Ria's history" })).toBeVisible() }));

test('people', ({ page }) => captureScreenshot(page, 'people', { path: './?tab=people', fixedTime, prepare: (p) => expect(p.getByText('Reminded first: Jo')).toBeVisible() }));

test('list for the doctor', ({ page }) =>
  captureScreenshot(page, 'doctor-list', { path: './?tab=medicines&print=demo-person-ria', fixedTime, prepare: (p) => expect(p.getByRole('region', { name: 'Medicine list for Oma Ria' })).toBeVisible() }));

test('double dose', ({ page }) =>
  captureScreenshot(page, 'double-dose', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Give Paracetamol 500 mg to Oma Ria' }).click();
      await expect(p.getByRole('dialog').getByRole('alert')).toBeVisible();
    },
  }));

test('scan the label', async ({ page }) => {
  const label = readFileSync(new URL('./fixtures/label.txt', import.meta.url), 'utf8');
  await page.addInitScript((text) => {
    (window as unknown as { __mockLabelText: string }).__mockLabelText = text;
  }, label);
  await captureScreenshot(page, 'scan-label', {
    path: './?tab=medicines&person=demo-person-ria',
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Add medicine' }).click();
      const dialog = p.getByRole('dialog', { name: 'Medicine for Oma Ria' });
      await dialog.getByLabel('Label photo').setInputFiles({ name: 'label.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
      await expect(dialog.getByText('Filled in from the label. Check each field before saving.')).toBeVisible();
    },
  });
});

test('phone: today', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-today', { fixedTime, prepare: needsDoing });
});

test('phone: visits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-visits', { path: './?tab=visits&person=demo-person-ria', fixedTime, prepare: (p) => expect(p.getByRole('region', { name: 'Coming up' }).getByText('Diabetes check')).toBeVisible() });
});

test('phone: medicines', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-medicines', { path: './?tab=medicines&person=demo-person-ria', fixedTime, prepare: (p) => expect(p.getByText('6 tablets left')).toBeVisible() });
});
