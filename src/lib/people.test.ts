import { describe, expect, test } from 'bun:test';
import { ageOn, audienceOf, canEdit, canGive, canSee, escalateTo, mainCarer, readersOf } from './people';

const household = {
  members: ['admin@example.com', 'carer@example.com', 'other@example.com', 'helper@example.com', 'kid@example.com', 'self@example.com'],
  roles: { 'helper@example.com': 'helper' as const, 'kid@example.com': 'kid' as const },
};
const nan = { carers: ['carer@example.com', 'helper@example.com', 'kid@example.com'], readers: readersOf({ carers: ['carer@example.com', 'helper@example.com', 'kid@example.com'] }) };

describe('who may do what', () => {
  test('admins see everyone; members and helpers only the people they look after; kids nobody', () => {
    expect(canSee(nan, 'admin', 'admin@example.com')).toBe(true);
    expect(canSee(nan, 'member', 'carer@example.com')).toBe(true);
    expect(canSee(nan, 'member', 'other@example.com')).toBe(false);
    expect(canSee(nan, 'helper', 'helper@example.com')).toBe(true);
    expect(canSee(nan, 'kid', 'kid@example.com')).toBe(false);
    expect(canEdit(nan, 'helper', 'helper@example.com')).toBe(false);
    expect(canEdit(nan, 'member', 'carer@example.com')).toBe(true);
    expect(canGive(nan, 'helper', 'helper@example.com')).toBe(true);
  });

  test('the person themself reads their own when they are a member', () => {
    const self = { carers: [], email: 'Self@example.com' };
    expect(readersOf(self)).toEqual(['self@example.com']);
    expect(canSee({ readers: readersOf(self) }, 'member', 'self@example.com')).toBe(true);
  });

  test('the audience is admins, carers and the person, never kids', () => {
    expect(audienceOf(nan, household)).toEqual(['admin@example.com', 'carer@example.com', 'helper@example.com']);
  });

  test('the main carer is reminded; the others hear about unmarked doses', () => {
    expect(mainCarer(nan, household)).toBe('carer@example.com');
    expect(escalateTo(nan, household)).toEqual(['helper@example.com']);
    const alone = { carers: ['carer@example.com'], readers: ['carer@example.com'] };
    expect(escalateTo(alone, household)).toEqual(['admin@example.com']);
    expect(mainCarer({ carers: ['kid@example.com'] }, household)).toBe('admin@example.com');
  });

  test('age on a day', () => {
    expect(ageOn({ birthDate: '1949-05-15' }, '2031-05-14')).toBe(81);
    expect(ageOn({ birthDate: '1949-05-14' }, '2031-05-14')).toBe(82);
    expect(ageOn({}, '2031-05-14')).toBeNull();
  });
});
