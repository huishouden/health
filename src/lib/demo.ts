import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { HouseholdHome } from '@huishouden/pwa-kit/home';
import { addDays, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';
import type { Dose, Med, Person, PersonPhoto, Visit, VisitNote } from './model';
import { doseId, rowsBetween } from './meds';
import { readersOf } from './people';

// Invented sample household for the signed-out app: README screenshots and first impressions.
// Everything is relative to one fixed day in 2031, so nothing resembles a real household's dates.
// The sample morning has something to do: Oma Ria's 8 AM metformin hasn't been marked, Noor's
// 2 PM antibiotic is next, and her lisinopril is running low.

/** Wednesday 14 May 2031, 10:30 local time (the suite's sample day). The demo's clock starts here. */
export const DEMO_NOW = new Date(2031, 4, 14, 10, 30).getTime();

export const DEMO_MEMBERS = ['sam@example.com', 'alex@example.com'];
/** The sample household's helper (a home carer who comes in the mornings), for `?as=helper`. */
export const DEMO_HELPER = 'jo@example.com';
const [SAM, ALEX] = DEMO_MEMBERS;

/** Whose eyes the sample is seen through: the admin, or `?as=helper` / `?as=kid`. */
export function demoRole(search: string): 'admin' | 'helper' | 'kid' {
  const as = new URLSearchParams(search).get('as');
  return as === 'helper' || as === 'kid' ? as : 'admin';
}

export interface HealthData {
  people: Person[];
  photos: PersonPhoto[];
  meds: Med[];
  doses: Dose[];
  /** Each person's visits (appointments), past and to come. */
  visits: Visit[];
  /** The visits' notes: only those of people the reader keeps (admins and member carers). */
  visitNotes: VisitNote[];
  /** The household's contacts shown in Health (doctors, pharmacies). */
  contacts: Contact[];
}

export const emptyData = (): HealthData => ({ people: [], photos: [], meds: [], doses: [], visits: [], visitNotes: [], contacts: [] });

const TODAY = toYmd(DEMO_NOW);
const day = (offset: number) => addDays(TODAY, offset);
const at = (offset: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return ymdToTime(day(offset)) + (h * 60 + m) * 60_000;
};
const CREATED = at(-120, '09:00');

const RIA = 'demo-person-ria';
const NOOR = 'demo-person-noor';
const ALEX_P = 'demo-person-alex';
const GP = 'demo-contact-gp';
const PEDS = 'demo-contact-pediatrician';
const PHARMACY = 'demo-contact-pharmacy';
const EYES = 'demo-contact-eyes';

function person(id: string, order: number, data: Omit<Person, 'id' | 'readers' | 'createdAt' | 'by'>): Person {
  return { id, ...data, readers: readersOf(data), createdAt: CREATED + order * 60_000, by: SAM };
}

function people(): Person[] {
  return [
    person(RIA, 0, { name: 'Oma Ria', birthDate: '1949-02-11', carers: [DEMO_HELPER, SAM], allergies: 'Penicillin', notes: 'Takes tablets with a glass of water. Crushed in yoghurt if she struggles.' }),
    person(NOOR, 1, { name: 'Noor', birthDate: '2024-03-02', carers: [SAM, ALEX], allergies: '' }),
    person(ALEX_P, 2, { name: 'Alex', birthDate: '1990-07-23', email: ALEX, carers: [ALEX] }),
  ];
}

const base = { asNeeded: false, escalateMinutes: 30, remind: true, createdAt: CREATED, by: SAM } as const;

function meds(): Med[] {
  return [
    { ...base, id: 'demo-med-lisinopril', personId: RIA, name: 'Lisinopril', strength: '10 mg', dose: '1 tablet', doseAmount: 1, doseUnit: 'tablet', times: ['08:00'], everyDays: 1, startDate: day(-90), prescriberId: GP, pharmacyId: PHARMACY, refills: 2, supply: 30, supplyAt: at(-25, '12:00'), notes: 'For blood pressure.' },
    { ...base, id: 'demo-med-metformin', personId: RIA, name: 'Metformin', strength: '500 mg', dose: '1 tablet', doseAmount: 1, doseUnit: 'tablet', times: ['08:00', '18:00'], everyDays: 1, withFood: true, startDate: day(-90), prescriberId: GP, pharmacyId: PHARMACY, refills: 5, supply: 120, supplyAt: at(-20, '12:00') },
    { ...base, id: 'demo-med-atorvastatin', personId: RIA, name: 'Atorvastatin', strength: '20 mg', dose: '1 tablet', doseAmount: 1, doseUnit: 'tablet', times: ['21:00'], everyDays: 1, startDate: day(-90), prescriberId: GP, pharmacyId: PHARMACY, refills: 3 },
    { ...base, id: 'demo-med-vitd', personId: RIA, name: 'Vitamin D3', strength: '25 mcg', dose: '1 capsule', times: ['08:00'], rule: { freq: 'week', every: 1, start: day(-87), days: [1] }, startDate: day(-87), escalateMinutes: 0 },
    { ...base, id: 'demo-med-paracetamol', personId: RIA, name: 'Paracetamol', strength: '500 mg', dose: '2 tablets', doseAmount: 2, doseUnit: 'tablet', asNeeded: true, times: [], minHours: 4, maxPerDay: 4, startDate: day(-90), escalateMinutes: 0, remind: false, notes: 'For knee pain.' },
    { ...base, id: 'demo-med-amoxicillin', personId: NOOR, name: 'Amoxicillin', strength: '250 mg/5 ml', dose: '5 ml', doseAmount: 5, doseUnit: 'ml', times: ['08:00', '14:00', '20:00'], everyDays: 1, withFood: true, startDate: day(-2), endDate: day(4), prescriberId: PEDS, pharmacyId: PHARMACY, notes: 'Keep in the fridge. Shake well.' },
    { ...base, id: 'demo-med-cetirizine', personId: NOOR, name: 'Cetirizine', strength: '1 mg/ml', dose: '2.5 ml', asNeeded: true, times: [], minHours: 24, maxPerDay: 1, startDate: day(-60), escalateMinutes: 0, remind: false },
    { ...base, id: 'demo-med-levothyroxine', personId: ALEX_P, name: 'Levothyroxine', strength: '50 mcg', dose: '1 tablet', doseAmount: 1, doseUnit: 'tablet', times: ['07:00'], everyDays: 1, withFood: false, startDate: day(-200), by: ALEX, refills: 4, supply: 90, supplyAt: at(-30, '12:00') },
  ];
}

/** Who gave a dose on a given day and time: the helper in the mornings, Sam or Alex otherwise. */
const giver = (personId: string, hhmm: string, offset: number) =>
  personId === ALEX_P ? ALEX : personId === RIA && hhmm < '12:00' ? DEMO_HELPER : offset % 2 ? SAM : ALEX;

/**
 * Four weeks of doses: nearly all given a few minutes after their time, two missed and one skipped
 * on purpose, and today's morning partly done (Ria's metformin not marked).
 */
function doses(list: Med[]): Dose[] {
  const out: Dose[] = [];
  const from = at(-28, '00:00');
  const missed = new Set(['demo-med-atorvastatin@-9', 'demo-med-metformin@-4', 'demo-med-metformin@0']);
  for (const r of rowsBetween(list, [], from, DEMO_NOW, DEMO_NOW)) {
    const offset = Math.round((ymdToTime(r.slot.date) - ymdToTime(TODAY)) / 86_400_000);
    if (missed.has(`${r.med.id}@${offset}`)) continue;
    if (offset === 0 && r.slot.time === '08:00' && r.med.id === 'demo-med-metformin') continue;
    const skipped = r.med.id === 'demo-med-lisinopril' && offset === -12;
    const late = (r.slot.at / 60_000) % 17;
    out.push({
      id: doseId(r.med.id, r.slot.key),
      personId: r.med.personId,
      medId: r.med.id,
      slot: r.slot.key,
      at: r.slot.at + late * 60_000,
      status: skipped ? 'skipped' : 'given',
      ...(skipped ? { note: 'Fasting for a blood test' } : {}),
      by: giver(r.med.personId, r.slot.time, offset),
      createdAt: r.slot.at + late * 60_000,
    });
  }
  // As needed: paracetamol now and then, most recently this morning.
  for (const [offset, hhmm] of [[-20, '15:00'], [-11, '09:30'], [-3, '16:00'], [0, '08:40']] as const) {
    const t = at(offset, hhmm);
    out.push({ id: `demo-dose-para-${offset}`, personId: RIA, medId: 'demo-med-paracetamol', at: t, status: 'given', by: offset === 0 ? DEMO_HELPER : SAM, createdAt: t });
  }
  return out;
}

function contacts(): Contact[] {
  const c = (id: string, name: string, role: string, phone: string, extra: Partial<Contact> = {}): Contact => ({
    id, name, role, phone, apps: ['health'], private: true, createdAt: CREATED, by: SAM, ...extra,
  });
  return [
    c(GP, 'Dr. Lena Hart', 'Doctor', '(555) 010-2231', { address: '12 Example Street', lat: 39.7983, lng: -89.6544 }),
    c(PEDS, 'Dr. Omar Velde', 'Pediatrician', '(555) 010-4410'),
    c(PHARMACY, 'CVS Pharmacy', 'Pharmacy', '(555) 010-7788', { website: 'https://www.cvs.com', address: '400 Example Avenue, Springfield', lat: 39.7817, lng: -89.6066 }),
    c(EYES, 'Example Eye Clinic', 'Specialist', '(555) 010-3090', { address: '8 Example Road, Springfield', lat: 39.8102, lng: -89.6431 }),
  ];
}

/**
 * Visits: Oma Ria's diabetes check the day after tomorrow (fasting, the medicine list, a follow-up
 * in three months) and her eye exam in two weeks; Noor's school vaccine yesterday, not marked yet;
 * Alex's physio by video next week; and Ria's cardiology visit three weeks ago, attended, whose
 * follow-up in a month is still to book.
 */
function visits(): Visit[] {
  const v = (id: string, personId: string, data: Omit<Visit, 'id' | 'personId' | 'createdAt' | 'by' | 'remindBefore'> & Partial<Pick<Visit, 'remindBefore' | 'by'>>): Visit => ({
    id: `demo-visit-${id}`, personId, remindBefore: [1440, 120], createdAt: CREATED, by: SAM, ...data,
  });
  return [
    v('diabetes', RIA, { kind: 'checkup', title: 'Diabetes check', at: at(2, '09:15'), minutes: 30, contactId: GP, prep: ['Fasting from midnight'], medList: true, followUp: { every: 3, unit: 'month' } }),
    v('eyes', RIA, { kind: 'eye', title: 'Eye exam', at: at(13, '14:00'), contactId: EYES, prep: ['Bring her glasses', 'Someone else drives home (eye drops)'], remindBefore: [2880, 120] }),
    v('vaccine', NOOR, { kind: 'vaccine', title: 'School vaccine', at: at(-1, '15:30'), minutes: 20, contactId: PEDS, by: ALEX }),
    v('physio', ALEX_P, { kind: 'therapy', title: 'Physio for the shoulder', at: at(6, '17:00'), minutes: 45, link: 'https://video.example.com/room/physio', remindBefore: [60], by: ALEX }),
    v('cardio', RIA, { kind: 'specialist', title: 'Cardiology', at: at(-21, '11:00'), location: 'Example Heart Center, 30 Example Street', followUp: { every: 1, unit: 'month' }, status: 'attended', markedAt: at(-21, '12:30'), markedBy: DEMO_HELPER }),
    v('dentist', NOOR, { kind: 'dentist', title: 'Check-up', at: at(-60, '10:00'), status: 'attended', markedAt: at(-60, '11:00'), markedBy: SAM }),
  ];
}

function visitNotes(): VisitNote[] {
  return [
    { id: 'demo-visit-cardio', personId: RIA, text: 'Blood pressure a little high. Keep lisinopril as it is; check again in a month.', updatedAt: at(-21, '13:00'), by: SAM },
  ];
}

/** The sample household's home, for "2.3 mi from home" beside the pharmacy and on the care team's cards. */
export const DEMO_HOME: HouseholdHome = { address: '12 Example Lane, Springfield, Illinois 62701', lat: 39.7817, lng: -89.6501, setBy: SAM, updatedAt: CREATED };

export function demoData(): HealthData {
  const m = meds();
  return { people: people(), photos: [], meds: m, doses: doses(m), visits: visits(), visitNotes: visitNotes(), contacts: contacts() };
}

export const DEMO_IDS = { RIA, NOOR, ALEX: ALEX_P };
