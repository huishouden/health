import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stubOpenStreetMap } from '@huishouden/pwa-kit/e2e';

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
  const give = needs(page).getByRole('button', { name: 'Give Metformin 500 mg to Oma Ria' });
  await expect(give).toHaveText('Give');
  await expect(give).not.toHaveAttribute('aria-pressed');
  const ria = page.getByRole('region', { name: 'Oma Ria today' });
  const undo = ria.getByRole('button', { name: 'Undo given for Metformin 500 mg at 8 AM' });
  await expect(undo).toHaveCount(0);
  await give.click();
  await ria.getByRole('button', { name: /All done so far today/ }).click();
  await expect(page.getByText('Given: Metformin 500 mg for Oma Ria')).toBeVisible();
  await expect(needs(page)).toContainText('Nothing due right now. Next: Noor at 2 PM.');
  // Done looks done: no Give for it anywhere, a check badge, who and when, and a quiet Undo.
  await expect(page.getByRole('button', { name: 'Give Metformin 500 mg to Oma Ria' })).toHaveCount(0);
  const row = ria.locator('li[data-completion=done]', { hasText: 'Metformin 500 mg' });
  await expect(row).toContainText(/Given late 10:3\d AM by You/);
  await expect(row.locator('[data-done-badge=done]')).toBeVisible();
  await expect(undo).toHaveText('Undo');
  await expect(undo).not.toHaveAttribute('aria-pressed');
  await undo.click();
  await expect(needs(page).getByRole('button', { name: 'Give Metformin 500 mg to Oma Ria' })).toBeVisible();
});

test('a person whose doses are all done folds to one line that opens again', async ({ page }) => {
  await open(page);
  const alex = page.getByRole('region', { name: 'Alex today' });
  const summary = alex.getByRole('button', { name: /All done so far today/ });
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(alex.locator('li[data-completion]')).toHaveCount(0);
  await summary.click();
  await expect(alex.locator('li[data-completion=done]')).toContainText(/Given 7:\d\d AM by Alex/);
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
  const ria = page.getByRole('region', { name: 'Oma Ria today' });
  await ria.getByRole('button', { name: /All done so far today/ }).click();
  await expect(ria.locator('li[data-completion=done]', { hasText: 'Metformin 500 mg' })).toContainText('Given 8:15 AM by You');
  await page.clock.fastForward('03:40:00');
  await needs(page).getByRole('button', { name: 'Skip: Amoxicillin 250 mg/5 ml for Noor' }).click();
  const noor = page.getByRole('region', { name: 'Noor today' });
  await noor.getByRole('button', { name: /All done so far today/ }).click();
  const skipped = noor.locator('li[data-completion=skipped]');
  await expect(skipped).toContainText(/Skipped 2:1\d PM by You/);
  await expect(skipped.getByRole('button', { name: 'Undo skip for Amoxicillin 250 mg/5 ml at 2 PM' })).toBeVisible();
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
  await expect(filled).toContainText('Every day at 8 AM and 8 PM');
  await expect(dialog.getByRole('list', { name: 'Not used' })).toContainText('zq7 smudge');
  await expect(dialog.getByText('Left out: 3 pharmacy lines')).toBeVisible();
  await expect(dialog.getByLabel('Medicine', { exact: true })).toHaveValue('Metformin');
  await expect(dialog.getByLabel('Strength')).toHaveValue('500 mg');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Added Metformin 500 mg for Oma Ria')).toBeVisible();
});

const labelText = () => readFileSync(new URL('./fixtures/label.txt', import.meta.url), 'utf8');
const mockLabel = (page: Page) =>
  page.addInitScript((text) => {
    (window as unknown as { __mockLabelText: string }).__mockLabelText = text;
  }, labelText());
const openAddMedicine = async (page: Page) => {
  await open(page, './?tab=medicines&person=demo-person-ria');
  await page.getByRole('region', { name: "Oma Ria's medicines" }).getByRole('button', { name: 'Add medicine' }).click();
  return page.getByRole('dialog', { name: 'Medicine for Oma Ria' });
};

test('Scan the label offers the camera and the library, and only the camera forces the camera', async ({ page }) => {
  await mockLabel(page);
  const dialog = await openAddMedicine(page);
  await expect(dialog.getByRole('button', { name: 'Take a photo' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose photos' })).toBeVisible();
  await expect(dialog.locator('input[type=file][capture=environment]')).toHaveCount(1);
  await expect(dialog.locator('input[type=file]:not([capture])')).toHaveCount(1);
  // A photo already on the phone: no camera involved.
  await dialog.getByLabel('Label photo').setInputFiles({ name: 'from-library.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
  await expect(dialog.getByLabel('Medicine', { exact: true })).toHaveValue('Metformin');
});

test('Scan the label takes the front and the back of a box together', async ({ page }) => {
  await mockLabel(page);
  const dialog = await openAddMedicine(page);
  await dialog
    .getByLabel('Label photo')
    .setInputFiles([
      { name: 'front.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('front') },
      { name: 'back.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('back') },
    ]);
  await expect(dialog.getByRole('region', { name: 'Filled in from the label' })).toContainText('MedicineMetformin');
});

test('Scan the label reads an image pasted with Ctrl+V', async ({ page }) => {
  await mockLabel(page);
  const dialog = await openAddMedicine(page);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['photo'], 'pasted.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByLabel('Medicine', { exact: true })).toHaveValue('Metformin');
});

test('Share → Health with a label photo opens Scan the label with it', async ({ page }) => {
  await mockLabel(page);
  await open(page);
  // What the service worker keeps for a photo shared from the gallery.
  await page.evaluate(async () => {
    const cache = await caches.open('hh-share-images');
    await cache.put(new URL('hh-shared-image-0', location.href).href, new Response('photo', { headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'label.jpg' } }));
  });
  await page.goto('./?share=image');
  const dialog = page.getByRole('dialog', { name: /^Medicine for / });
  await expect(dialog.getByRole('region', { name: 'Filled in from the label' })).toContainText('MedicineMetformin');
  await expect(page).not.toHaveURL(/share=image/);
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
  await expect(needs(page).getByRole('button', { name: 'Give Metformin 500 mg to Oma Ria' })).toBeVisible();
});

test('a helper who shares a label photo to Health is told they cannot add medicines', async ({ page }) => {
  await open(page, './?as=helper&tab=medicines');
  await page.evaluate(async () => {
    const cache = await caches.open('hh-share-images');
    await cache.put(new URL('hh-shared-image-0', location.href).href, new Response('photo', { headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'label.jpg' } }));
  });
  await page.goto('./?as=helper&share=image');
  await expect(page.getByText('Only admins, and members who care for someone, can add medicines.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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

test('a medicine’s dose times go into your own calendar, repeating; as needed has none', async ({ page }) => {
  await open(page, './?tab=medicines&person=demo-person-ria');
  const ria = page.getByRole('region', { name: /Oma Ria/ });
  await ria.getByRole('button', { name: 'Add Lisinopril 10 mg to a calendar' }).click();
  const google = new URL((await ria.getByRole('menuitem', { name: 'Google Calendar' }).getAttribute('href'))!);
  expect(google.searchParams.get('text')).toBe('Lisinopril 10 mg');
  expect(google.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA;WKST=SU');
  await page.keyboard.press('Escape');
  // Twice a day: one each, the time in the name.
  await expect(ria.getByRole('button', { name: /^Add Metformin 500 mg, .+ to a calendar$/ })).toHaveCount(2);
  await expect(ria.getByRole('button', { name: /^Add Paracetamol/ })).toHaveCount(0);
});

// The sample home is 12 Example Lane (39.7817, -89.6501); the sample pharmacy is 2.3 miles east.
const FOUND_PHARMACY = {
  osm_type: 'node', osm_id: 1001, lat: '39.7817', lon: '-89.6066', name: 'Example Drugstore',
  display_name: 'Example Drugstore, 400 Example Avenue, Springfield, Illinois, 62701, United States',
  address: { house_number: '400', road: 'Example Avenue', city: 'Springfield', state: 'Illinois', postcode: '62701', country_code: 'us' },
  extratags: { phone: '+1 555 010 7799' },
};

test('the pharmacy says how far it is from home, on the medicine, its card and the map search', async ({ page }) => {
  await stubOpenStreetMap(page, { search: [FOUND_PHARMACY] });
  await open(page, './?tab=medicines&person=demo-person-ria');
  const ria = page.getByRole('region', { name: "Oma Ria's medicines" });
  await expect(ria.getByRole('listitem').filter({ hasText: 'Lisinopril 10 mg' })).toContainText('Dr. Lena Hart · CVS Pharmacy, 2.3 mi from home');

  await page.goto('./?tab=people');
  const doctors = page.getByRole('region', { name: 'Doctors and pharmacies' });
  await expect(doctors.getByRole('region', { name: 'CVS Pharmacy' })).toContainText('2.3 mi from home');
  // No position, no distance.
  await expect(doctors.getByRole('region', { name: 'Dr. Omar Velde' })).not.toContainText('from home');

  await doctors.getByRole('button', { name: 'Add' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Find a business').fill('drugstore');
  await dialog.getByRole('button', { name: 'Search' }).click();
  await expect(dialog.getByRole('list', { name: 'Places' })).toContainText('Example Drugstore');
  await expect(dialog.getByRole('list', { name: 'Places' })).toContainText('2.3 mi from home');
});
