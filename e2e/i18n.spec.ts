import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { expectLocalized, useLanguage } from '@huishouden/pwa-kit/e2e';
import es from '../src/locales/es.json' with { type: 'json' };
import nl from '../src/locales/nl.json' with { type: 'json' };

// The signed-out sample household in Spanish and Dutch: Health's own chrome and the kit's, no English
// left. People, medicine names, doses as typed and notes are sample data and stay as entered.
const START = new Date('2031-05-14T10:30:00');
const ENGLISH = ['Needs doing', 'Medicines', 'History', 'People', 'Given', 'Skip', 'Late', 'Done today', 'When needed', 'Running low', 'Allergies'];

for (const [lang, messages] of [
  ['es', es],
  ['nl', nl],
] as const) {
  test(`the sample household in ${lang}`, async ({ page }) => {
    await page.clock.install({ time: START });
    await expectLocalized(page, lang, { words: ENGLISH });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages['app.name']);
    await expect(page.getByRole('region', { name: messages['today.needs'] })).toBeVisible();

    // A dose marked another way, in that language.
    await page.getByRole('region', { name: messages['today.needs'] }).getByRole('button', { name: new RegExp(`^${messages['today.anotherTimeFor'].split('{')[0]}`) }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: messages['dose.skipped'], exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  });
}

test('the list for the doctor in Spanish: translated labels and dates, and it still prints', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: START });
  await useLanguage(page, 'es');
  await page.goto('./?print=demo-person-ria');
  const list = page.getByRole('region', { name: es['print.listFor'].replace('{name}', 'Oma Ria') });
  await expect(list).toContainText('Medicamentos de Oma Ria');
  await expect(list).toContainText('Alergias: Penicillin');
  await expect(list).toContainText(/Actualizada el miércoles, 14 de mayo/);
  await expect(list).not.toContainText('Prescribed by');
  await page.emulateMedia({ media: 'print' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('columnheader', { name: es['print.prescribedBy'] }).first()).toBeVisible();
  const pdf = await page.pdf({ format: 'A4' });
  expect(pdf.length).toBeGreaterThan(20_000);
  const text = spawnSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
  if (!text.error) for (const t of ['Medicamentos de Oma Ria', 'Alergias', 'Metformin', 'Recetado']) expect(text.stdout).toContain(t);
});
