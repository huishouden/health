import { expect, test, type Page } from '@playwright/test';
import { runPortalTodo, useTestHousehold } from '@huishouden/pwa-kit/e2e';

// Signed in as the invented people of a household of this run's own (pwa-kit STANDARD.md
// "Staging"), against the real rules: on the emulators (`bun run e2e:emulator`), and on
// staging for what needs the suite's site (@staging) or a kit bump (@smoke). The admin adds the test
// person with the helper as their carer; the member doesn't look after them.
const hh = useTestHousehold(test);

const PERSON = 'Test Gran';
const DROPS = 'Test drops';

const loaded = (page: Page) => expect(page.getByRole('region', { name: 'Needs doing' }).or(page.getByText(/Nobody's medicines are shared with you yet|Whose medicines does the household look after/))).toBeVisible({ timeout: 30_000 });
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The admin's test person, looked after by the helper only, with an as-needed medicine: added the first time. */
async function testPerson(page: Page) {
  await loaded(page);
  await page.getByRole('button', { name: 'People', exact: true }).click();
  const people = page.getByRole('region', { name: 'People' });
  await expect(people).toBeVisible({ timeout: 20_000 });
  if ((await people.getByText(PERSON, { exact: true }).count()) === 0) {
    await page.getByRole('button', { name: 'Add person' }).click();
    const dialog = page.getByRole('dialog', { name: 'New person' });
    await dialog.getByLabel('Name').fill(PERSON);
    await dialog.getByRole('checkbox', { name: new RegExp(escape(hh.users.helper.email)) }).check();
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

test('only the admin and the person’s carer see their medicines; the carer gives a dose', { tag: '@smoke' }, async ({ browser }) => {
  test.setTimeout(150_000);
  const admin = await hh.open(browser, 'admin');
  await testPerson(admin);

  // A member who doesn't look after them sees nobody (the rules return nothing): only the prompt to add a person.
  const member = await hh.open(browser, 'member');
  await loaded(member);
  await member.getByRole('button', { name: 'Medicines', exact: true }).click();
  await expect(member.getByText('Whose medicines does the household look after?')).toBeVisible({ timeout: 20_000 });
  await expect(member.getByText(PERSON)).toHaveCount(0);

  // The helper who looks after them sees them, marks a dose (saved: no refusal), and changes no medicine.
  const helper = await hh.open(browser, 'helper');
  await loaded(helper);
  const day = helper.getByRole('region', { name: `${PERSON} today` });
  await expect(day).toBeVisible({ timeout: 20_000 });
  await day.getByRole('button', { name: `Give ${DROPS} to ${PERSON}` }).click();
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

// @staging: the portal's To-do list is another app on the suite's site.
test('a dose not marked is on the portal’s To-do list for the admin, not for other members; Given there marks it in Health', { tag: '@staging' }, async ({ browser }) => {
  test.setTimeout(180_000);
  // A 12 AM dose is missed from 2 AM; earlier in the night it is still due.
  test.skip(new Date().getHours() < 3, 'the 12 AM dose is not missed before 2 AM');
  const name = 'Night drops';
  const admin = await hh.open(browser, 'admin');
  await testPerson(admin);
  await addMed(admin, name);
  const title = `Not marked: 12 AM medicine for ${PERSON}`;
  // Published a few seconds after the change, for named people only.
  await admin.waitForTimeout(6000);
  await admin.goto('/todo');
  await expect(admin.getByRole('listitem', { name: title, exact: true })).toBeVisible({ timeout: 45_000 });
  // Another member's To-do list, loaded, never has it.
  const member = await hh.open(browser, 'member', '/todo');
  await expect(member.getByRole('heading', { name: 'To-do', level: 2 })).toBeVisible({ timeout: 30_000 });
  await expect(member.getByRole('region', { name: 'Loading' })).toHaveCount(0, { timeout: 30_000 });
  await expect(member.getByRole('listitem', { name: title, exact: true })).toHaveCount(0);

  await runPortalTodo(admin, title, { action: 'done', timeout: 45_000 });

  await admin.goto('./?tab=history');
  await expect(admin.getByRole('region', { name: `${PERSON}'s history` })).toContainText(new RegExp(`${name} 12:00 AM · given by You`), { timeout: 20_000 });
});

test('a visit: the admin adds it with notes; the helper carer sees when and where, never the notes, and marks it attended', { tag: '@smoke' }, async ({ browser }) => {
  test.setTimeout(150_000);
  const admin = await hh.open(browser, 'admin');
  await testPerson(admin);
  await admin.getByRole('button', { name: 'Visits', exact: true }).click();
  await admin.getByRole('button', { name: 'Add visit' }).click();
  const title = `Test eye exam ${Date.now() % 100000}`;
  const yesterday = new Date(Date.now() - 86_400_000);
  const day = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  let dialog = admin.getByRole('dialog', { name: 'New visit' });
  if (await dialog.count()) await dialog.getByLabel('Whose visit').selectOption({ label: PERSON });
  dialog = admin.getByRole('dialog', { name: `Visit for ${PERSON}` });
  await dialog.getByRole('button', { name: 'Eye doctor' }).click();
  await dialog.getByLabel('What for (optional)').fill(title);
  await dialog.getByLabel('Day').fill(day);
  await dialog.getByLabel('Time', { exact: true }).fill('10:00');
  await dialog.getByText('Where, what to bring').click();
  await dialog.getByLabel('Where').fill('9 Example Lane');
  await dialog.getByLabel('Notes').fill('Test note for keepers only');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const marking = admin.getByRole('region', { name: 'Did it happen?' });
  await expect(marking).toContainText(title, { timeout: 20_000 });
  await admin.waitForTimeout(3000);
  await expect(admin.getByText(/Couldn't save/i)).toHaveCount(0);

  const helper = await hh.open(browser, 'helper', './?tab=visits');
  const helperMarking = helper.getByRole('region', { name: 'Did it happen?' });
  await expect(helperMarking).toContainText(title, { timeout: 30_000 });
  await expect(helper.getByText('Test note for keepers only')).toHaveCount(0);
  await helperMarking.getByRole('button', { name: new RegExp(`Mark ${escape(title)}.* attended`) }).click();
  await expect(helperMarking.locator('li[data-completion=done]', { hasText: title })).toContainText('Attended · marked by you');
  await helper.waitForTimeout(3000);
  await expect(helper.getByText(/Couldn't save/i)).toHaveCount(0);

  // The admin's device shows the helper's mark.
  await expect(marking.locator('li[data-completion=done]', { hasText: title })).toContainText(/Attended · marked by (?!you)/, { timeout: 20_000 });
});
