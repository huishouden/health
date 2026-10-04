import { afterEach, describe, expect, test } from 'bun:test';
import { setLangForTests } from '@huishouden/pwa-kit/i18n';
import { localizeAgenda } from '@huishouden/pwa-kit/agenda';
import { localizeTodos } from '@huishouden/pwa-kit/todos';
import { localizeReminders } from '@huishouden/pwa-kit/reminders';
import { DEMO_HELPER, DEMO_MEMBERS, DEMO_NOW, demoData } from './demo';
import { agendaItems, reminderItems, todoItems, type PublishInput } from './publish';
import { scheduleText } from './meds';
import { roleLabel } from './contacts';
import { listModel, listText } from '../components/PrintList';
import { SUITE_ORIGIN } from '@huishouden/pwa-kit/site';

// Spanish and Dutch: what Health writes for the household in each language. Medicine names stay off
// the portal (agenda and to-dos) in every language; reminders to the carers' own devices name them.
// Back to English after each (resetI18nForTests would also forget the app's catalogue).
afterEach(() => setLangForTests('en'));

const data = demoData();
const [SAM, ALEX] = DEMO_MEMBERS;
const household = { members: [SAM, ALEX, DEMO_HELPER], roles: { [DEMO_HELPER]: 'helper' as const } };
const input: PublishInput = { ...data, household, now: DEMO_NOW, url: (p) => `${SUITE_ORIGIN}/health/${p}` };
const names = data.meds.map((m) => m.name);
const leaks = (text: string) => names.filter((n) => text.includes(n));

describe('the portal stays name-free in every language', () => {
  test('agenda items and to-dos carry es and nl, without medicine names', async () => {
    const agenda = await localizeAgenda(() => agendaItems(input));
    const todos = await localizeTodos(() => todoItems(input));
    expect(agenda.length).toBeGreaterThan(0);
    expect(todos.length).toBeGreaterThan(0);
    for (const i of [...agenda, ...todos]) {
      expect(i.texts.es?.title).toBeTruthy();
      expect(i.texts.nl?.title).toBeTruthy();
      // Names only in calendarDetail, which the portal never shows.
      const { calendarDetail: _names, ...shown } = i as typeof i & { calendarDetail?: string };
      expect(leaks(JSON.stringify(shown))).toEqual([]);
    }
    expect(agenda[0].texts.es?.title).toMatch(/^Medicamento para /);
    expect(agenda[0].texts.nl?.title).toMatch(/^Medicijn voor /);
  });
});

describe('dose reminders say the time the reader’s way', () => {
  test('"At 6 PM", "A las 6 p.m.", "Om 18:00", then the medicines', async () => {
    const reminders = await localizeReminders(() => reminderItems(input));
    const dose = reminders.find((r) => r.ref?.startsWith('health:dose:') && r.body?.includes('Metformin'))!;
    expect(dose.texts.en?.body).toMatch(/^At 6 PM: Metformin/);
    expect(dose.texts.es?.body).toMatch(/^A las 6 p\.m\.: Metformin .*con comida/);
    expect(dose.texts.nl?.body).toMatch(/^Om 18:00: Metformin .*bij het eten/);
    expect(dose.texts.en?.body).not.toContain('18:00');
  });
});

describe('in Spanish and Dutch', () => {
  test('schedules, roles and the list for the doctor', async () => {
    const med = data.meds.find((m) => !m.asNeeded && m.times.length > 1)!;
    const ria = data.people.find((p) => p.name === 'Oma Ria')!;
    await setLangForTests('es', ['es-MX']);
    expect(scheduleText({ ...med, times: ['13:00', '21:00'], rule: undefined, everyDays: 1 })).toBe('Todos los días a la 1 p.m. y 9 p.m.');
    expect(roleLabel('pharmacy')).toBe('Farmacia');
    const es = listText(listModel(ria, data.meds, data.doses, data.contacts, DEMO_NOW), DEMO_NOW);
    expect(es).toContain('Medicamentos de Oma Ria');
    expect(es).toMatch(/Alergias: /);

    await setLangForTests('nl', ['nl-NL']);
    expect(scheduleText({ ...med, times: ['08:00', '20:00'], rule: undefined, everyDays: 2 })).toBe('Om de dag om 8:00 en 20:00');
    const nl = listText(listModel(ria, data.meds, data.doses, data.contacts, DEMO_NOW), DEMO_NOW);
    expect(nl).toContain('Medicijnen van Oma Ria');
    expect(nl).toContain('Stand van');
  });
});
