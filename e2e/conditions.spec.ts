import { expect, test, type Page } from '@playwright/test';

// Conditions in the signed-out sample household on its fixed morning (Wednesday 14 May 2031):
// Oma Ria's diabetes, blood pressure, cholesterol, knee and cataract; Noor's hay fever and an ear
// infection that is over; Alex's thyroid and migraines. The condition lookup (the National Library
// of Medicine's Clinical Tables) is answered here, never on the network.
const START = new Date('2031-05-14T10:30:00');
const LOOKUP = /clinicaltables\.nlm\.nih\.gov\/api\/(conditions|icd10cm)\/v3\/search/;

async function open(page: Page, path = './?tab=conditions') {
  await page.clock.install({ time: START });
  await page.goto(path);
  await expect(page.getByText('Sample data')).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole('region', { name: `${name}'s conditions` });

test('each person by medical area, current areas open with counts, resolved ones last', async ({ page }) => {
  await open(page);
  const ria = card(page, 'Oma Ria');
  const areas = ria.locator('summary');
  await expect(areas).toHaveText([/^Cardiology1/, /^Endocrinology2/, /^Ophthalmology1/, /^Orthopedics1/]);
  const diabetes = ria.locator('li', { hasText: 'Type 2 diabetes' });
  await expect(diabetes).toContainText('Managed');
  await expect(diabetes).toContainText('Diagnosed March 2019 · by Dr. Lena Hart, 1.2 mi from home');
  await expect(diabetes).toContainText('Treated with Metformin 500 mg');
  await expect(diabetes).toContainText('ICD-10 E11.9');
  const noor = card(page, 'Noor');
  await expect(noor.locator('summary').last()).toContainText('1 resolved');
  await expect(noor.locator('details').last()).not.toHaveAttribute('open', '');
  // A visit about it is one tap away.
  await diabetes.getByRole('button', { name: /Diabetes check, Fri, May 16/ }).click();
  await expect(page.getByRole('region', { name: 'Coming up' }).locator('li', { hasText: 'Diabetes check' })).toContainText('About Type 2 diabetes');
});

test('the household by medical area, each condition saying whose it is', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'By medical area' }).click();
  const all = page.getByRole('region', { name: "Everyone's conditions by medical area" });
  const endo = all.locator('details', { hasText: 'Endocrinology' });
  await expect(endo.locator('summary')).toContainText('3');
  await expect(endo.locator('li', { hasText: 'Underactive thyroid' })).toContainText('for Alex');
  await expect(endo.locator('li', { hasText: 'Type 2 diabetes' })).toContainText('for Oma Ria');
});

test('adding one: the lookup fills the name, the ICD-10 code and the area; the medicine says what it is for', async ({ page }) => {
  const asked: string[] = [];
  await page.route(LOOKUP, async (route) => {
    const url = new URL(route.request().url());
    asked.push(url.searchParams.get('terms') ?? '');
    expect(route.request().headers()['referer']).toBeUndefined();
    if (url.pathname.includes('/conditions/')) await route.fulfill({ json: [1, ['1'], { icd10cm_codes: ['M54.12'] }, [['Radiculopathy']]] });
    else await route.fulfill({ json: [1, ['M54.12'], null, [['M54.12', 'Radiculopathy, cervical region']]] });
  });
  await open(page);
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await card(page, 'Alex').getByRole('button', { name: 'Add a condition' }).click();
  const dialog = page.getByRole('dialog', { name: 'New condition for Alex' });
  await dialog.getByPlaceholder('Start typing').fill('cervical radic');
  const suggestions = dialog.getByRole('list', { name: 'Suggestions' });
  await suggestions.getByRole('button', { name: /Radiculopathy, cervical region/ }).click();
  await expect(dialog.getByLabel('Medical area')).toHaveValue('neurology');
  await expect(dialog.getByText('ICD-10 M54.12')).toBeVisible();
  await dialog.getByText('Diagnosed, by whom and where').click();
  await dialog.getByLabel('Diagnosed: year').fill('2030');
  await dialog.getByLabel('Diagnosed: month').selectOption({ label: 'September' });
  await dialog.getByLabel('Diagnosed by').selectOption({ label: 'Dr. Ines Mol (Specialist)' });
  await dialog.getByText('Levothyroxine 50 mcg').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Added Radiculopathy, cervical region for Alex')).toBeVisible();
  const neuro = card(page, 'Alex').locator('details', { hasText: 'Neurology' });
  await expect(neuro.locator('summary')).toContainText('2');
  await expect(neuro.locator('li', { hasText: 'Radiculopathy, cervical region' })).toContainText('Diagnosed September 2030 · by Dr. Ines Mol');
  // Only the words typed went out.
  expect(asked.every((q) => q === 'cervical radic')).toBe(true);
  await page.getByRole('button', { name: 'Medicines' }).click();
  await expect(page.locator('li', { hasText: 'Levothyroxine' })).toContainText('For Radiculopathy, cervical region and Underactive thyroid');
});

test('typed by hand while the lookup is down: the name saves as typed, the area from its words', async ({ page }) => {
  await page.route(LOOKUP, (route) => route.abort('internetdisconnected'));
  await open(page);
  await page.getByRole('button', { name: 'Noor', exact: true }).click();
  await card(page, 'Noor').getByRole('button', { name: 'Add a condition' }).click();
  const dialog = page.getByRole('dialog', { name: 'New condition for Noor' });
  await dialog.getByPlaceholder('Start typing').fill('Childhood asthma');
  await expect(dialog.getByText('Suggestions need a connection')).toBeVisible();
  await expect(dialog.getByLabel('Medical area')).toHaveValue('pulmonology');
  await dialog.getByLabel('Medical area').selectOption({ label: 'Allergy and immunology' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Noor').locator('details', { hasText: 'Allergy and immunology' }).locator('summary')).toContainText('2');
});

test('the list for the doctor has the current conditions by area, not the resolved ones', async ({ page }) => {
  await open(page, './?print=demo-person-noor');
  const list = page.getByRole('region', { name: 'Medicine list for Noor' });
  await expect(list.getByRole('heading', { name: 'Conditions' })).toBeVisible();
  await expect(list).toContainText('Allergy and immunology');
  await expect(list).toContainText('Hay fever (since 2030)');
  await expect(list).not.toContainText('Middle ear infection');
});

test('a visit names its medical area and, for those who may see it, its condition', async ({ page }) => {
  await open(page, './?tab=visits&person=demo-person-ria');
  const eyes = page.getByRole('region', { name: 'Coming up' }).locator('li', { hasText: 'Eye exam' });
  await expect(eyes).toContainText('Ophthalmology');
  await expect(eyes).toContainText('About Cataract');
});

test('a helper carer sees no conditions: no tab, nothing on medicines, visits or the list', async ({ page }) => {
  await open(page, './?as=helper&tab=medicines');
  await expect(page.getByRole('region', { name: "Oma Ria's medicines" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conditions' })).toHaveCount(0);
  await expect(page.getByText('For Type 2 diabetes')).toHaveCount(0);
  await page.getByRole('button', { name: 'Visits' }).click();
  const eyes = page.getByRole('region', { name: 'Coming up' }).locator('li', { hasText: 'Eye exam' });
  await expect(eyes).toContainText('Ophthalmology');
  await expect(eyes).not.toContainText('Cataract');
  await page.goto('./?as=helper&print=demo-person-ria');
  await expect(page.getByRole('region', { name: 'Medicine list for Oma Ria' })).not.toContainText('Conditions');
  await page.goto('./?as=helper&tab=conditions');
  await expect(page.getByText('Type 2 diabetes')).toHaveCount(0);
});
