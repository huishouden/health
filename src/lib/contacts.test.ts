import { describe, expect, test } from 'bun:test';
import { DEMO_HOME, demoData } from './demo';
import { nameFromHome } from './contacts';

const contacts = demoData().contacts;
const pharmacy = contacts.find((c) => c.role === 'Pharmacy')!;
const peds = contacts.find((c) => c.role === 'Pediatrician')!;

describe('a contact with how far it is from home', () => {
  test('the sample pharmacy is 2.3 miles from the sample home', () => {
    expect(nameFromHome(pharmacy, { home: DEMO_HOME, locale: 'en-US' })).toBe('CVS Pharmacy, 2.3 mi from home');
  });

  test('in kilometres where the region uses them', () => {
    expect(nameFromHome(pharmacy, { home: DEMO_HOME, locale: 'en-GB' })).toBe('CVS Pharmacy, 2.3 mi from home');
    expect(nameFromHome(pharmacy, { home: DEMO_HOME, locale: 'en-IE' })).toBe('CVS Pharmacy, 3.7 km from home');
  });

  test('just the name without a home or without a position', () => {
    expect(nameFromHome(pharmacy, { home: undefined })).toBe('CVS Pharmacy');
    expect(nameFromHome(peds, { home: DEMO_HOME })).toBe('Dr. Omar Velde');
  });
});
