import { expect, test, type Page } from '@playwright/test';
import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';

// Visits in the signed-out sample household on its fixed morning (Wednesday 14 May 2031, 10:30):
// Oma Ria's diabetes check on Friday, Noor's school vaccine yesterday not marked yet, and Ria's
// cardiology follow-up still to book.
const START = new Date('2031-05-14T10:30:00');

async function open(page: Page, path = './?tab=visits') {
  await page.clock.install({ time: START });
  await page.goto(path);
  await expect(page.getByText('Sample data')).toBeVisible();
}

const upcoming = (page: Page) => page.getByRole('region', { name: 'Coming up' });
const toMark = (page: Page) => page.getByRole('region', { name: 'Did it happen?' });

test('coming up: the doctor and how far, what to bring, and the medicine list one tap away', async ({ page }) => {
  await open(page);
  const diabetes = upcoming(page).locator('li', { hasText: 'Diabetes check for Oma Ria' });
  await expect(diabetes).toContainText('Fri, May 16, 9:15 AM · Checkup');
  await expect(diabetes).toContainText('Dr. Lena Hart, 1.2 mi from home');
  await expect(diabetes).toContainText('Fasting from midnight');
  await expect(diabetes).toContainText('Reminders: the day before and 2 hours before');
  await expect(upcoming(page).locator('li', { hasText: 'Physio for the shoulder for Alex' }).getByRole('link', { name: 'Join the video visit' })).toHaveAttribute('href', 'https://video.example.com/room/physio');
  await diabetes.getByRole('button', { name: 'Bring the medicine list' }).click();
  await expect(page.getByRole('region', { name: 'Medicine list for Oma Ria' })).toBeVisible();
});

test('Attended marks yesterday’s visit done with who, and Undo puts it back; Missed too', async ({ page }) => {
  await open(page);
  await toMark(page).getByRole('button', { name: 'Mark School vaccine for Noor attended' }).click();
  await expect(page.getByText('Attended: School vaccine')).toBeVisible();
  const row = toMark(page).locator('li[data-completion=done]', { hasText: 'School vaccine for Noor' });
  await expect(row).toContainText(/Attended · marked by you 10:3\d AM/);
  await row.getByRole('button', { name: 'Undo the mark for School vaccine for Noor' }).click();
  await expect(toMark(page).getByRole('button', { name: 'Mark School vaccine for Noor attended' })).toBeVisible();
  await toMark(page).getByRole('button', { name: 'Mark School vaccine for Noor missed' }).click();
  await expect(toMark(page).locator('li[data-completion=skipped]')).toContainText(/Missed · marked by you/);
});

test('adding a visit: whose, the kind, the day; it shows on Today too', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add visit' }).click();
  const dialog = page.getByRole('dialog', { name: 'New visit' });
  await dialog.getByLabel('Whose visit').selectOption({ label: 'Noor' });
  await expect(page.getByRole('dialog', { name: 'Visit for Noor' })).toBeVisible();
  const forNoor = page.getByRole('dialog', { name: 'Visit for Noor' });
  await forNoor.getByRole('button', { name: 'Dentist' }).click();
  await forNoor.getByLabel('Day').fill('2031-05-15');
  await forNoor.getByLabel('Time', { exact: true }).fill('16:00');
  await forNoor.getByText('Where, what to bring').click();
  await forNoor.getByRole('button', { name: 'Arrive 15 minutes early' }).click();
  await forNoor.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Added Dentist for Noor')).toBeVisible();
  const row = upcoming(page).locator('li', { hasText: 'Dentist for Noor' });
  await expect(row).toContainText('Tomorrow at 4 PM');
  await expect(row).toContainText('Arrive 15 minutes early');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Noor today' })).toContainText('Tomorrow at 4 PM: Dentist');
});

test('a follow-up to book: Book opens the next visit filled in, a month on; booked, it leaves the list', async ({ page }) => {
  await open(page);
  await expect(toMark(page)).toContainText('Book a follow-up: Cardiology, Oma Ria');
  await expect(toMark(page)).toContainText('In 1 month, around May 23');
  await toMark(page).getByRole('button', { name: 'Book: Book a follow-up: Cardiology, Oma Ria' }).click();
  const dialog = page.getByRole('dialog', { name: 'Visit for Oma Ria' });
  await expect(dialog.getByLabel('Day')).toHaveValue('2031-05-23');
  await expect(dialog.getByLabel('What for (optional)')).toHaveValue('Cardiology');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Book a follow-up: Cardiology')).toHaveCount(0);
  await expect(upcoming(page).locator('li', { hasText: 'Cardiology for Oma Ria' })).toBeVisible();
});

test('Not needed takes the follow-up off, with Undo', async ({ page }) => {
  await open(page);
  await toMark(page).getByRole('button', { name: 'Not needed: Book a follow-up: Cardiology, Oma Ria' }).click();
  await expect(page.getByText('No follow-up to book: Cardiology')).toBeVisible();
  await expect(page.getByText('Book a follow-up: Cardiology, Oma Ria')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Book a follow-up: Cardiology, Oma Ria')).toBeVisible();
});

test('the home carer sees when, where and what to bring, marks visits, but never the notes or others’ edits', async ({ page }) => {
  await open(page, './?tab=visits&as=helper');
  await expect(upcoming(page)).toContainText('Diabetes check');
  await expect(upcoming(page)).not.toContainText('Physio');
  await expect(page.getByText('Blood pressure a little high')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit Diabetes check/ })).toHaveCount(0);
  await expect(upcoming(page)).toContainText('Only the admins and the members who look after Oma Ria can change a visit someone else added, or read the notes.');
  await page.getByRole('button', { name: 'Add visit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Visit for Oma Ria' });
  await dialog.getByText('Where, what to bring').click();
  await expect(dialog.getByLabel('Notes')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  // An admin reads the notes.
  await open(page);
  await expect(page.getByRole('region', { name: 'Past visits' })).toContainText('Blood pressure a little high');
});

const events: CalendarMatch[] = [
  { id: 'evt-noor-flu', title: "Noor's flu shot", start: new Date('2031-05-21T15:00:00').getTime(), end: new Date('2031-05-21T15:20:00').getTime(), allDay: false, location: '', description: '', link: 'https://calendar.example.com/e/noor', calendarName: 'Family' },
  { id: 'evt-dentist', title: 'Dentist', start: new Date('2031-05-22T09:00:00').getTime(), allDay: false, location: '5 Example Square', description: '', link: 'https://calendar.example.com/e/dentist', calendarName: 'Family' },
  { id: 'evt-eyes', title: 'Eye exam', start: new Date('2031-05-23T11:00:00').getTime(), allDay: false, location: '', description: '', link: 'https://calendar.example.com/e/eyes', calendarName: 'Family' },
];

test('import from calendar: an event naming someone is theirs; one naming nobody asks whose', async ({ page }) => {
  await page.addInitScript((list) => {
    (window as unknown as { __mockCalendarEvents: CalendarMatch[] }).__mockCalendarEvents = list;
  }, events);
  await open(page);
  await page.getByRole('button', { name: 'Import from calendar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from calendar' });
  await dialog.getByRole('button', { name: "Add Noor's flu shot" }).click();
  await expect(upcoming(page).locator('li', { hasText: "Noor's flu shot for Noor" })).toContainText('Vaccine');
  await dialog.getByRole('button', { name: 'Add Dentist' }).click();
  const whose = page.getByRole('dialog', { name: 'New visit' });
  await expect(whose.getByLabel('Day')).toHaveValue('2031-05-22');
  await whose.getByLabel('Whose visit').selectOption({ label: 'Alex' });
  await page.getByRole('dialog', { name: 'Visit for Alex' }).getByRole('button', { name: 'Save' }).click();
  await expect(upcoming(page).locator('li', { hasText: 'Dentist for Alex' })).toBeVisible();
});

test('new calendar events that name someone are suggested; Add puts them in', async ({ page }) => {
  await page.addInitScript((list) => {
    const w = window as unknown as { __mockCalendarEvents: CalendarMatch[]; __mockCalendarToken: string };
    w.__mockCalendarEvents = list;
    w.__mockCalendarToken = 'test-token';
  }, events);
  await open(page);
  const card = page.getByRole('region', { name: 'New in your calendar' });
  await expect(card).toContainText("Noor's flu shot");
  await expect(card).not.toContainText('Dentist');
  await card.getByRole('button', { name: /^Add/ }).first().click();
  await expect(upcoming(page).locator('li', { hasText: "Noor's flu shot for Noor" })).toBeVisible();
});

test('Add all: each event naming nobody opens in turn, with its own day', async ({ page }) => {
  await page.addInitScript((list) => {
    (window as unknown as { __mockCalendarEvents: CalendarMatch[] }).__mockCalendarEvents = list;
  }, events);
  await open(page);
  await page.getByRole('button', { name: 'Import from calendar' }).click();
  await page.getByRole('dialog', { name: 'Import from calendar' }).getByRole('button', { name: /^Add all/ }).click();
  const first = page.getByRole('dialog', { name: 'New visit' });
  await expect(first.getByLabel('What for (optional)')).toHaveValue('Dentist');
  await expect(first.getByLabel('Day')).toHaveValue('2031-05-22');
  await first.getByLabel('Whose visit').selectOption({ label: 'Alex' });
  await page.getByRole('dialog', { name: 'Visit for Alex' }).getByRole('button', { name: 'Save' }).click();
  const second = page.getByRole('dialog', { name: 'New visit' });
  await expect(second.getByLabel('What for (optional)')).toHaveValue('Eye exam');
  await expect(second.getByLabel('Day')).toHaveValue('2031-05-23');
  await expect(second.getByLabel('Whose visit')).toHaveValue('');
});
