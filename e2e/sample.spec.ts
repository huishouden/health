import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The signed-out sample household on its fixed morning (Wednesday 14 May 2031, 10:30): Oma Ria's
// 8 AM metformin is not marked, her paracetamol was given at 8:40 and her lisinopril runs low.
const START = new Date('2031-05-14T10:30:00');

async function open(page: Page, path = './') {
  await page.clock.install({ time: START });
  await page.goto(path);
  await expect(page.getByText('Sample data')).toBeVisible();
}

const needs = (page: Page) => page.getByRole('region', { name: 'Needs doing' });

test('marking a dose given moves it to done with who and when, and Undo puts it back', async ({ page }) => {
  await open(page);
  await expect(needs(page)).toContainText('Metformin 500 mg');
  await expect(needs(page)).toContainText('8 AM · not marked');
  await needs(page).getByRole('button', { name: 'Given: Metformin 500 mg for Oma Ria' }).click();
  await expect(page.getByText('Given: Metformin 500 mg for Oma Ria')).toBeVisible();
  await expect(needs(page)).toContainText('Nothing due right now. Next: Noor at 2 PM.');
  const ria = page.getByRole('region', { name: 'Oma Ria today' });
  await expect(ria).toContainText(/Metformin 500 mg 8 AM · Given late 10:3\d AM by You/);
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(needs(page)).toContainText('Metformin 500 mg');
});

test('a second dose too soon asks first, naming who gave the first and when', async ({ page }) => {
  await open(page);
  const ria = page.getByRole('region', { name: 'Oma Ria today' });
  await expect(ria).toContainText('Last 2 hours ago by Jo · fine from 12:40 PM');
  await ria.getByRole('button', { name: 'Give Paracetamol 500 mg to Oma Ria' }).click();
  const dialog = page.getByRole('dialog', { name: 'Paracetamol 500 mg for Oma Ria' });
  await expect(dialog.getByRole('alert')).toHaveText('Last given 2 hours ago; Paracetamol 500 mg needs 4 hours between doses. The next dose is fine from 12:40 PM.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('Late marks a dose at another time; Skip records a skip', async ({ page }) => {
  await open(page);
  await needs(page).getByRole('button', { name: 'Another time: Metformin 500 mg for Oma Ria' }).click();
  const dialog = page.getByRole('dialog', { name: 'Metformin 500 mg for Oma Ria' });
  await dialog.getByLabel('Given at').fill('2031-05-14T08:15');
  await dialog.getByRole('button', { name: 'Mark given' }).click();
  await expect(page.getByRole('region', { name: 'Oma Ria today' })).toContainText('Metformin 500 mg 8 AM · Given 8:15 AM by You');
});

test('Scan the label shows what it filled, and what it read but did not use', async ({ page }) => {
  const label = readFileSync(new URL('./fixtures/label.txt', import.meta.url), 'utf8');
  await page.addInitScript((text) => {
    (window as unknown as { __mockLabelText: string }).__mockLabelText = text;
  }, label);
  await open(page, './?tab=medicines&person=demo-person-ria');
  await page.getByRole('region', { name: "Oma Ria's medicines" }).getByRole('button', { name: 'Add medicine' }).click();
  const dialog = page.getByRole('dialog', { name: 'Medicine for Oma Ria' });
  await dialog.getByLabel('Label photo').setInputFiles({ name: 'label.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a real photo') });
  const filled = dialog.getByRole('region', { name: 'Filled in from the label' });
  await expect(filled).toContainText('Filled in from the label. Check each field before saving.');
  await expect(filled).toContainText('MedicineMetformin');
  await expect(filled).toContainText('Every day at 8 AM, 8 PM');
  await expect(dialog.getByRole('list', { name: 'Not used' })).toContainText('zq7 smudge');
  await expect(dialog.getByText('Left out: 3 pharmacy lines')).toBeVisible();
  await expect(dialog.getByLabel('Medicine', { exact: true })).toHaveValue('Metformin');
  await expect(dialog.getByLabel('Strength')).toHaveValue('500 mg');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Added Metformin 500 mg for Oma Ria')).toBeVisible();
});

test('the list for the doctor has allergies and every current medicine', async ({ page }) => {
  await open(page, './?tab=medicines&person=demo-person-ria');
  await page.getByRole('button', { name: 'List for the doctor' }).click();
  const list = page.getByRole('region', { name: 'Medicine list for Oma Ria' });
  await expect(list).toContainText('Allergies: Penicillin');
  for (const m of ['Lisinopril 10 mg', 'Metformin 500 mg', 'Atorvastatin 20 mg', 'Paracetamol 500 mg']) await expect(list).toContainText(m);
});

// Printed in dark too: the paper must stay black on white. The kit drops .dark on beforeprint, but
// emulateMedia does not fire it, so this also checks the print styles alone keep the list light.
for (const scheme of ['light', 'dark'] as const) {
  test(`the list for the doctor prints on its own and the PDF has the medicines (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((mode) => localStorage.setItem('hh-theme', mode), scheme);
    await open(page, './?tab=history&person=demo-person-ria');
    await page.getByRole('button', { name: 'List for the doctor' }).click();
    const list = page.getByRole('region', { name: 'Medicine list for Oma Ria' });
    await expect(list).toContainText('Metformin 500 mg');
    await page.emulateMedia({ media: 'print', colorScheme: scheme });
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(scheme === 'dark');
    // The phone's bottom bar flags <html> with data-hh-bottom-nav; hiding that flag blanked the page.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).display)).not.toBe('none');
    await expect(list).toBeVisible();
    expect((await list.boundingBox())?.height).toBeGreaterThan(400);
    await expect(list.getByRole('columnheader', { name: 'Prescribed by' }).first()).toBeVisible();
    await expect(page.locator('hh-app-bar')).toBeHidden();
    await expect(page.locator('nav[data-hh-bottom-nav]')).toBeHidden();
    await expect(page.getByText('Sample data')).toBeHidden();
    await expect(list.getByRole('button', { name: 'Print' })).toBeHidden();
    // Dark ink on a white page: every text in the list, and the list's and page's backgrounds.
    const paper = await list.evaluate((el) => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const lum = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const texts = [...el.querySelectorAll('h1, h2, p, th, td, li, span')].filter((e) => e.checkVisibility() && e.textContent?.trim());
      return {
        background: Math.min(lum(getComputedStyle(el).backgroundColor), lum(getComputedStyle(document.body).backgroundColor)),
        lightestText: Math.max(...texts.map((e) => lum(getComputedStyle(e).color))),
      };
    });
    expect(paper.background, 'white paper').toBeGreaterThan(0.95);
    // Under 0.18 is at least 4.5:1 on white.
    expect(paper.lightestText, 'dark ink').toBeLessThan(0.18);
    const pdf = await page.pdf({ format: 'A4' });
    // A blank page is under 1 KB; the list with its fonts is about 100 KB.
    expect(pdf.length).toBeGreaterThan(20_000);
    const text = spawnSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
    if (!text.error) {
      // Table cells wrap ("Metformin 500" over "mg"), so the medicine is matched by name.
      for (const t of ['Medicines for Oma Ria', 'Allergies: Penicillin', 'Metformin', 'Lisinopril']) expect(text.stdout).toContain(t);
    }
  });
}

for (const width of [360, 390]) {
  test(`the list for the doctor fits a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, './?print=demo-person-ria');
    const list = page.getByRole('region', { name: 'Medicine list for Oma Ria' });
    await expect(list).toContainText('Prescribed by Dr. Lena Hart');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const box = await list.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}

test('history counts missed doses per medicine', async ({ page }) => {
  await open(page, './?tab=history&person=demo-person-ria');
  const history = page.getByRole('region', { name: "Oma Ria's history" });
  await expect(history.getByRole('row', { name: /Metformin 500 mg/ })).toContainText('5');
  await expect(history).toContainText('Metformin 500 mg 8 AM · missed');
});

test('a helper sees only the people they look after and cannot change medicines', async ({ page }) => {
  await open(page, './?as=helper&tab=medicines');
  await expect(page.getByRole('region', { name: "Oma Ria's medicines" })).toBeVisible();
  await expect(page.getByRole('region', { name: "Noor's medicines" })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add medicine' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(needs(page).getByRole('button', { name: 'Given: Metformin 500 mg for Oma Ria' })).toBeVisible();
});

test('a kid sees no medicines', async ({ page }) => {
  await open(page, './?as=kid');
  await expect(page.getByText('Medicines are looked after by the grown-ups.')).toBeVisible();
});

test('adding a person with carers', async ({ page }) => {
  await open(page, './?tab=people');
  await page.getByRole('button', { name: 'Add person' }).click();
  const dialog = page.getByRole('dialog', { name: 'New person' });
  await dialog.getByLabel('Name').fill('Opa Henk');
  await dialog.getByRole('checkbox', { name: 'Alex' }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'People' })).toContainText('Opa Henk');
  await expect(page.getByRole('region', { name: 'People' })).toContainText('Reminded first: Alex');
});
