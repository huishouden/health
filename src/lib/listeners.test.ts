import { describe, expect, test } from 'bun:test';
import { planListeners } from './listeners';

const map = (o: Record<string, string>) => new Map(Object.entries(o));

describe('planListeners', () => {
  test('nothing changed: nothing stopped or started', () => {
    expect(planListeners(map({ gran: 'h1/gran@1', kid: 'h1/kid@2' }), map({ gran: 'h1/gran@1', kid: 'h1/kid@2' }))).toEqual({ stop: [], start: [] });
  });
  test("one person's window moves: only theirs restarts", () => {
    expect(planListeners(map({ gran: 'h1/gran@1', kid: 'h1/kid@2' }), map({ gran: 'h1/gran@5', kid: 'h1/kid@2' }))).toEqual({ stop: ['gran'], start: ['gran'] });
  });
  test('a person added starts; a person gone stops', () => {
    expect(planListeners(map({ gran: 'h1/gran@1' }), map({ kid: 'h1/kid@2' }))).toEqual({ stop: ['gran'], start: ['kid'] });
  });
  test('another household: every listener restarts, also for the same ids', () => {
    expect(planListeners(map({ gran: 'h1/gran@1' }), map({ gran: 'h2/gran@1' }))).toEqual({ stop: ['gran'], start: ['gran'] });
  });
  test('first open and closing', () => {
    expect(planListeners(new Map(), map({ gran: 'h1/gran@1' }))).toEqual({ stop: [], start: ['gran'] });
    expect(planListeners(map({ gran: 'h1/gran@1' }), new Map())).toEqual({ stop: ['gran'], start: [] });
  });
});
