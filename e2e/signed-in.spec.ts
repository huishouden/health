import { expect, test, type Browser, type Page } from '@playwright/test';
import { runPortalTodo, signInTestUser } from '@huishouden/pwa-kit/e2e';
import { seedTestHousehold } from '@huishouden/pwa-kit/staging';

// Signed in as the staging project's invented test users (pwa-kit STANDARD.md "Staging"): the real
// staging Firestore and rules. test-a is the admin, test-b a member who doesn't look after the test
// person, test-helper a helper who does. The household keeps its data between runs, so the test
// person is added once and each run's own medicine is named for the run and removed at the end.
test.skip(!process.env.HH_STAGING_SA, 'signed-in tests run against staging, in CI');

test.beforeAll(async () => {
  if (process.env.HH_STAGING_ACCESS_TOKEN) await seedTestHousehold({ accessToken: process.env.HH_STAGING_ACCESS_TOKEN });
});

const PERSON = 'Test Gran';
const DROPS = 'Test drops';
const HELPER = 'test-helper@example.com';

async function as(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signInTestUser(page, { email });
  return page;
}

const loaded = (page: Page) => expect(page.getByRole('region', { name: 'Needs doing' }).or(page.getByText(/Nobody's medicines are shared with you yet|Whose medicines does the household look after/))).toBeVisible({ timeout: 30_000 });

/** test-a's test person, looked after by the helper only, with an as-needed medicine. */
async function testPerson(page: Page) {
  await loaded(page);
  await page.getByRole('button', { name: 'People', exact: true }).click();
  const people = page.getByRole('region', { name: 'People' });
  if ((await people.getByText(PERSON, { exact: true }).count()) === 0) {
    await page.getByRole('button', { name: 'Add person' }).click();
    const dialog = page.getByRole('dialog', { name: 'New person' });
    await dialog.getByLabel('Name').fill(PERSON);
    await dialog.getByRole('checkbox', { name: /test-helper@example\.com/ }).check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(people.getByText(PERSON, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Medicines', exact: true }).click();
  const meds = page.getByRole('region', { name: `${PERSON}'s medicines` });
  await expect(meds).toBeVisible({ timeout: 20_000 });
  if ((await meds.getByText(DROPS).count()) === 0) await addMed(page, DROPS, { asNeeded: true });
}

async function addMed(page: Page, name: string, { asNeeded = false, time = '00:00' } = {}) {
  const meds = page.getByRole('region', { name: `${PERSON}'s medicines` });
  await meds.getByRole('button', { name: 'Add medicine' }).click();
  const dialog = page.getByRole('dialog', { name: `Medicine for ${PERSON}` });
  await dialog.getByLabel('Medicine', { exact: true }).fill(name);
  await dialog.getByLabel('Dose', { exact: true }).fill('1 drop');
  if (asNeeded) await dialog.getByRole('button', { name: 'When needed' }).click();
  else await dialog.getByLabel('Dose 1 time').fill(time);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(meds.getByText(name, { exact: true })).toBeVisible();
}

async function deleteMed(page: Page, name: string) {
  await page.getByRole('button', { name: 'Medicines', exact: true }).click();
  const meds = page.getByRole('region', { name: `${PERSON}'s medicines` });
  await meds.getByRole('button', { name: `Edit ${name}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(meds.getByText(name, { exact: true })).toHaveCount(0);
}

test('only the admin and the person’s carer see their medicines; the carer gives a dose', async ({ browser }) => {
  test.setTimeout(150_000);
  const admin = await as(browser, 'test-a@example.com');
  await testPerson(admin);

  // A member who doesn't look after them sees nobody: the rules return nothing.
  const member = await as(browser, 'test-b@example.com');
  await loaded(member);
  await member.getByRole('button', { name: 'Medicines', exact: true }).click();
  await expect(member.getByText("Nobody's medicines are shared with you yet. An admin can add you as someone who looks after them.")).toBeVisible();
  await expect(member.getByText(PERSON)).toHaveCount(0);

  // The helper who looks after them sees them, marks a dose (saved: no refusal), and changes no medicine.
  const helper = await as(browser, HELPER);
  await loaded(helper);
  const day = helper.getByRole('region', { name: `${PERSON} today` });
  await expect(day).toBeVisible({ timeout: 20_000 });
  await day.getByRole('button', { name: `Give ${DROPS} to ${PERSON}` }).click();
  const guard = helper.getByRole('dialog', { name: `${DROPS} for ${PERSON}` });
  if (await guard.isVisible().catch(() => false)) await guard.getByRole('button', { name: /Give it again|Mark given/ }).click();
  await expect(helper.getByText(`Given: ${DROPS} for ${PERSON}`)).toBeVisible();
  await expect(day).toContainText(/Last (just now|\d+ minutes? ago) by You/);
  await helper.waitForTimeout(3000);
  await expect(helper.getByText(/Couldn't save|only admins/i)).toHaveCount(0);
  await helper.getByRole('button', { name: 'Medicines', exact: true }).click();
  await expect(helper.getByRole('region', { name: `${PERSON}'s medicines` })).toBeVisible();
  await expect(helper.getByRole('button', { name: 'Add medicine' })).toHaveCount(0);

  // The admin's own device shows the helper's dose.
  await admin.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(admin.getByRole('region', { name: `${PERSON} today` })).toContainText(/Last .* by (?!You)\S+/, { timeout: 20_000 });
});

test('a dose not marked is on the portal’s To-do list for the admin, not for other members; Given there marks it in Health', async ({ browser }) => {
  test.setTimeout(180_000);
  // A 12 AM dose is missed from 2 AM; earlier in the night it is still due.
  test.skip(new Date().getHours() < 3, 'the 12 AM dose is not missed before 2 AM');
  const name = `Run ${Date.now()}`;
  const admin = await as(browser, 'test-a@example.com');
  await testPerson(admin);
  await addMed(admin, name);
  const title = `Not marked: 12 AM medicine for ${PERSON}`;
  try {
    // Published a few seconds after the change, for named people only.
    await admin.waitForTimeout(6000);
    const member = await as(browser, 'test-b@example.com');
    await member.goto('/todo', { waitUntil: 'networkidle' });

    await runPortalTodo(admin, title, { action: 'done', timeout: 45_000 });
    await expect(member.getByRole('listitem', { name: title, exact: true })).toHaveCount(0);

    await admin.goto('./?tab=history');
    await expect(admin.getByRole('region', { name: `${PERSON}'s history` })).toContainText(new RegExp(`${name} 12:00 AM · given by You`), { timeout: 20_000 });
  } finally {
    await admin.goto('./?tab=medicines');
    await deleteMed(admin, name);
  }
});
