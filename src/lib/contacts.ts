// The household's care contacts: the roles Health offers as one tap, stored in English and shown
// in the reader's language. Grouping, saving and the dialog are the kit's.
import { coordinates, type Contact } from '@huishouden/pwa-kit/contact-core';
import { formatFromHome, type HouseholdHome } from '@huishouden/pwa-kit/home';
import { t } from '../i18n';

/** Doctors, pharmacies and the rest of the household's care, as one-tap roles in the contact dialog. */
export const CONTACT_ROLES = ['Doctor', 'Pharmacy', 'Specialist', 'Dentist', 'Home care'] as const;

const ROLE_KEYS = {
  Doctor: 'role.doctor',
  Pharmacy: 'role.pharmacy',
  Specialist: 'role.specialist',
  Dentist: 'role.dentist',
  'Home care': 'role.homeCare',
} as const satisfies Record<(typeof CONTACT_ROLES)[number], string>;

/** A role in the active language: one of `CONTACT_ROLES` (matched ignoring case) translated, any other as typed. */
export function roleLabel(role: string): string {
  const known = CONTACT_ROLES.find((r) => r.toLowerCase() === role.trim().toLowerCase());
  return known ? t(ROLE_KEYS[known]) : role;
}

/** A doctor or a pharmacy, by the role someone typed in English, Spanish or Dutch. */
export const DOCTOR_WORDS = /doctor|physician|pediatric|specialist|dentist|gp|m[ée]dic[oa]|doctora|pediatra|especialista|dentista|huisarts|\barts\b|kinderarts|tandarts/i;
export const PHARMACY_WORDS = /pharmac|chemist|farmacia|apotheek/i;

/**
 * A doctor's or pharmacy's name with how far it is from home ("CVS Pharmacy, 2.3 mi from home"),
 * or just the name when the household has no home or the contact no position.
 */
export function nameFromHome(c: Contact, { home, locale }: { home: HouseholdHome | undefined; locale?: string }): string {
  const away = formatFromHome(coordinates(c), { home, locale });
  return away ? t('contacts.nameFromHome', { name: c.name, away }) : c.name;
}
