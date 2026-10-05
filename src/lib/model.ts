// Firestore shapes under households/{householdId}/healthPeople. The project's rules accept exactly
// these keys (`keys().hasOnly(...)`), so writers build documents from these types and never add
// fields. Everything about a person lives under their document, so the rules can let only the
// household's admins and that person's carers (and the person, if a member) read it.

import type { EventRule } from '@huishouden/pwa-kit/schedule';

// Visits (appointments) are the kit's model, shared with the assistant connector: `healthPeople/{id}/visits`
// and their notes, for admins and member carers only, in `visitNotes` (`@huishouden/pwa-kit/visit`).
export type { FollowUp, Visit, VisitData, VisitInput, VisitKind, VisitNote, VisitNoteData, VisitStatus } from '@huishouden/pwa-kit/visit';

/** healthPeople/{personId}: someone the household gives medicine to, with or without an account. */
export interface PersonData {
  name: string;
  /** YYYY-MM-DD. */
  birthDate?: string;
  /** Their own email when they are a member of the household (they then see their own medicines). */
  email?: string;
  /** Members who look after their medicines, main carer first: reminded at dose time. The rest hear when a dose isn't marked. */
  carers: string[];
  /** Who the rules let read: the carers and the person's own email. Written from the two, never edited. */
  readers: string[];
  allergies?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  by: string;
}
export interface Person extends PersonData {
  id: string;
}

/** healthPeople/{personId}/photo/avatar: a small WebP or JPEG data URL from `@huishouden/pwa-kit/photo`. */
export interface PersonPhotoData {
  data: string;
  updatedAt: number;
  by: string;
}
export interface PersonPhoto extends PersonPhotoData {
  /** The person's id (the document is always `avatar`). */
  id: string;
}

/** healthPeople/{personId}/meds/{medId}. */
export interface MedData {
  personId: string;
  /** "Lisinopril". */
  name: string;
  /** "10 mg". */
  strength?: string;
  /** One dose in words: "1 tablet", "5 ml". */
  dose?: string;
  /** One dose as a number of `doseUnit`, for counting the supply down. */
  doseAmount?: number;
  /** "tablet", "ml". */
  doseUnit?: string;
  /** Taken when needed rather than at set times. */
  asNeeded: boolean;
  /** "HH:MM" dose times on a dosing day, sorted; empty when as needed. */
  times: string[];
  /** Days between dosing days when there is no `rule`: 1 every day, 2 every other day. */
  everyDays?: number;
  /** Dosing days on a calendar pattern (Mondays and Thursdays, the 1st of the month). */
  rule?: EventRule;
  /** As needed: hours to wait between doses. */
  minHours?: number;
  /** As needed: the most doses in any 24 hours. */
  maxPerDay?: number;
  /** true with food, false on an empty stomach, absent either way. */
  withFood?: boolean;
  /** YYYY-MM-DD. */
  startDate: string;
  /** YYYY-MM-DD, the last day (stopped, or prescribed until). */
  endDate?: string;
  /** Household contacts (`@huishouden/pwa-kit/contacts`). */
  prescriberId?: string;
  pharmacyId?: string;
  refills?: number;
  /** Units on hand (of `doseUnit`) when counted, at `supplyAt`. */
  supply?: number;
  supplyAt?: number;
  /** When someone said a refill is ordered (here or on the household to-do list). */
  refillOrderedAt?: number;
  /** Minutes after a dose time before the other carers hear it isn't marked; 0 never. */
  escalateMinutes: number;
  /** Notifications at dose time. */
  remind: boolean;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  by: string;
}
export interface Med extends MedData {
  id: string;
}

export const DOSE_STATUSES = ['given', 'skipped'] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

/** healthPeople/{personId}/doses/{doseId}: a dose given or skipped, by whom and when. */
export interface DoseData {
  personId: string;
  medId: string;
  /** The scheduled dose it answers, "YYYY-MM-DDTHH:MM" (`@huishouden/pwa-kit/dose` `DoseSlot.key`); none as needed. */
  slot?: string;
  /** When it was given (or skipped). */
  at: number;
  status: DoseStatus;
  note?: string;
  by: string;
  createdAt: number;
}
export interface Dose extends DoseData {
  id: string;
}

/** Field sizes the rules allow. */
export const LIMITS = { name: 60, medName: 80, strength: 40, dose: 80, doseUnit: 20, allergies: 200, notes: 500, doseNote: 200 } as const;
export const MAX_TIMES = 6;
export const DEFAULT_ESCALATE_MINUTES = 30;
/** A refill is due when this many days of doses are left. */
export const LOW_SUPPLY_DAYS = 7;
