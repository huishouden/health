import { expect, test, type Browser, type Page } from '@playwright/test';
import { expectPageReads, useTestHousehold } from '@huishouden/pwa-kit/e2e';
import { testHousehold } from '@huishouden/pwa-kit/staging';
import { SETTLE_MS } from '../src/lib/schedule-publish';

// Read budgets (pwa-kit STANDARD.md "Read budgets"): what opening Health costs a household in
// Firestore reads, on the emulators with a build that counts them (`expectPageReads`), each in a
// fresh browser context (a first open, nothing cached). A change that raises a ceiling says why in
// its PR. An invented household: Test Gran, looked after by the helper and the admin, and Test Kid,
// by the member and the admin; each with two medicines, a few doses, a visit with its notes and a
// condition; two Health contacts and one of another app's.
const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const { admin, member, helper } = testHousehold('reads').users;
const by = admin.email;

// Doses are read from a month back (`doseWindowStart`), or from an older supply count: Test Gran's
// tablets were counted 45 days ago, so her dose of 40 days ago is read; Test Kid's of 60 days ago
// is not.
function person(id: string, name: string, carers: string[], { counted, old }: { counted?: number; old: number }) {
  const meds = ['tablets', 'drops'].map((what, i) => ({
    [`healthPeople/${id}/meds/${id}-m${i}`]: { personId: id, name: `Test ${what}`, dose: '1', asNeeded: false, times: ['08:00', '20:00'], everyDays: 1, startDate: ymd(NOW - 90 * DAY), escalateMinutes: 30, remind: true, ...(i === 0 && counted ? { supply: 60, supplyAt: NOW - counted * DAY } : {}), createdAt: NOW - 90 * DAY, by },
  }));
  const doses = [1, 2, 3, old].map((d) => ({
    [`healthPeople/${id}/doses/${id}-d${d}`]: { personId: id, medId: `${id}-m0`, at: NOW - d * DAY, status: 'given', by, createdAt: NOW - d * DAY },
  }));
  return Object.assign(
    { [`healthPeople/${id}`]: { name, carers, readers: carers, createdAt: NOW - 90 * DAY, by } },
    ...meds,
    ...doses,
    { [`healthPeople/${id}/visits/${id}-v1`]: { personId: id, kind: 'checkup', at: NOW + 2 * DAY, remindBefore: [DAY], createdAt: NOW - DAY, by } },
    { [`healthPeople/${id}/visitNotes/${id}-v1`]: { personId: id, text: 'Bring the list', updatedAt: NOW - DAY, by } },
    { [`healthPeople/${id}/conditions/${id}-c1`]: { personId: id, name: 'Test condition', specialty: 'cardiology', status: 'managed', createdAt: NOW - DAY, by } },
  );
}
const contact = (id: string, name: string, app: string) => ({ [`contacts/${id}`]: { name, role: 'Doctor', phone: '555-0100', apps: [app], private: true, createdAt: NOW - DAY, by } });

const hh = useTestHousehold(test, {
  scope: 'reads',
  docs: {
    ...person('gran', 'Test Gran', [helper.email, admin.email], { counted: 45, old: 40 }),
    ...person('kid', 'Test Kid', [member.email, admin.email], { old: 60 }),
    ...contact('gp', 'Test GP', 'health'),
    ...contact('pharmacy', 'Test Pharmacy', 'health'),
    ...contact('vet', 'Test Vet', 'pet'),
  },
});

// One open at a time: another open's writes (a sign-in's profile, its publish) would reach this
// page's listeners and be counted as its reads.
test.describe.configure({ mode: 'serial' });

const loaded = (page: Page, who: string) => expect(page.getByRole('region', { name: `${who} today` })).toBeVisible({ timeout: 30_000 });

// Each person has used Health before on another device: a first sign-in's own writes (the member's
// profile, their language) are done, so they don't land in a measured open as changes its listeners
// bill, early or late.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [as, who] of [['admin', 'Test Gran'], ['member', 'Test Kid'], ['helper', 'Test Gran']] as const) {
    const page = await hh.open(browser, as);
    await loaded(page, who);
    await page.waitForTimeout(SETTLE_MS + 1500);
    await page.close();
  }
});

async function firstOpen(browser: Browser, as: 'admin' | 'member' | 'helper', path: string, ready: (page: Page) => Promise<unknown>, max: number, label: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const page = await context.newPage();
    return await expectPageReads(
      page,
      async () => {
        await hh.signIn(page, as, path);
        await ready(page);
      },
      // Past the publish a few seconds after the data is in (SETTLE_MS): its queries are part of an open.
      // One read either way: the sign-in writes the member's own profile (pwa-kit saveMyProfile), which
      // the profiles listener bills once more when it lands after the listener's first server
      // snapshot, and not when it lands before.
      { max, min: max - 1, label, settleMs: SETTLE_MS + 1500 },
    );
  } finally {
    await context.close();
  }
}

// The admin reads everyone: each person's six listeners (medicines, doses, visits, the photo, visit
// notes, conditions), the people, the household's contacts, profiles and the household, then two
// queries: the assistant's old appointments and the publish's reminders (on the local preview the
// links are http, so its agenda and to-dos stop before reading; e2e/reads.sdk.ts budgets the
// publish whole). Every tab mounts the same listeners, so each costs the same on a first open.
for (const [tab, ready] of [
  ['', (p: Page) => loaded(p, 'Test Gran')],
  ['?tab=medicines', (p: Page) => expect(p.getByRole('region', { name: /Test (Gran|Kid)'s medicines/ }).first()).toBeVisible({ timeout: 30_000 })],
  ['?tab=visits', (p: Page) => expect(p.getByRole('button', { name: 'Add visit' })).toBeVisible({ timeout: 30_000 })],
  ['?tab=conditions', (p: Page) => expect(p.getByText('Test condition').first()).toBeVisible({ timeout: 30_000 })],
  ['?tab=history', (p: Page) => expect(p.getByRole('region', { name: /history/ }).first()).toBeVisible({ timeout: 30_000 })],
  ['?tab=people', (p: Page) => expect(p.getByRole('region', { name: 'People' })).toBeVisible({ timeout: 30_000 })],
] as const) {
  test(`opening Health${tab ? ` at ${tab.slice(5)}` : ' (Today)'}, signed in as an admin`, async ({ browser }) => {
    await firstOpen(browser, 'admin', `./${tab}`, ready, 32, `Health ${tab || 'Today'}, admin`);
  });
}

// A member carer reads only the people they look after (the rules return nothing else): Test Kid's
// three recent doses, not the one of 60 days ago.
test('opening Health (Today), signed in as a member carer: only their person read', async ({ browser }) => {
  await firstOpen(browser, 'member', './', (p) => loaded(p, 'Test Kid'), 21, 'Health Today, member');
});

// A helper carer: their person's medicines, doses, visits and photo, never the notes or conditions;
// the household's contacts that aren't private (none). Test Gran's four doses: her tablets' count of
// 45 days ago reaches back to the one of 40 days ago.
test('opening Health (Today), signed in as a helper carer: no notes, conditions or private contacts read', async ({ browser }) => {
  await firstOpen(browser, 'helper', './', (p) => loaded(p, 'Test Gran'), 16, 'Health Today, helper');
});
