import { describe, expect, test } from 'bun:test';
import { REFRESH_MS, schedulePublish, SETTLE_MS, type PageEvents, type Timers } from './schedule-publish';

/** A page whose visibility the test sets, with the events schedulePublish listens to. */
function fakePage() {
  const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  doc.visibilityState = 'visible';
  const win = new EventTarget();
  const hide = () => {
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { page: { doc, win } as unknown as PageEvents, hide, leave: () => win.dispatchEvent(new Event('pagehide')) };
}

/** A clock the test moves by hand. */
function fakeClock() {
  let now = 0;
  let next = 0;
  const due = new Map<number, { at: number; every?: number; fn: () => void }>();
  const timers: Timers = {
    setTimeout: (fn, ms) => (due.set(++next, { at: now + ms, fn }), next),
    clearTimeout: (id) => void due.delete(id as unknown as number),
    setInterval: (fn, ms) => (due.set(++next, { at: now + ms, every: ms, fn }), next),
    clearInterval: (id) => void due.delete(id as unknown as number),
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const [id, t] = [...due].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      if (!t) break;
      now = t.at;
      if (t.every) t.at += t.every;
      else due.delete(id!);
      t.fn();
    }
    now = until;
  };
  return { timers, advance };
}

function setup() {
  const page = fakePage();
  const clock = fakeClock();
  let runs = 0;
  const stop = schedulePublish(() => void runs++, { page: page.page, timers: clock.timers });
  return { ...page, ...clock, stop, runs: () => runs };
}

describe('schedulePublish', () => {
  test('publishes once the change settles, not before', () => {
    const s = setup();
    s.advance(SETTLE_MS - 1);
    expect(s.runs()).toBe(0);
    s.advance(1);
    expect(s.runs()).toBe(1);
  });

  test('hidden before it settles (a phone locked right after Save): publishes at once, and not again on settling', () => {
    const s = setup();
    s.advance(500);
    s.hide();
    expect(s.runs()).toBe(1);
    s.advance(SETTLE_MS);
    expect(s.runs()).toBe(1);
  });

  test('left (pagehide) before it settles: publishes at once; hidden after that: nothing more', () => {
    const s = setup();
    s.leave();
    s.hide();
    expect(s.runs()).toBe(1);
  });

  test('hidden after it already published: nothing more', () => {
    const s = setup();
    s.advance(SETTLE_MS);
    s.hide();
    expect(s.runs()).toBe(1);
  });

  test('stopped (a newer change took over): nothing runs, not even when hidden', () => {
    const s = setup();
    s.stop();
    s.hide();
    s.advance(REFRESH_MS);
    expect(s.runs()).toBe(0);
  });

  test('republishes every half hour while open', () => {
    const s = setup();
    s.advance(SETTLE_MS);
    s.advance(2 * REFRESH_MS);
    expect(s.runs()).toBe(3);
  });
});
