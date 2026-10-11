import { describe, expect, test } from 'bun:test';
import { schedulePublish, type PageEvents } from './schedule-publish';

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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('schedulePublish', () => {
  test('publishes once the change settles', async () => {
    const { page } = fakePage();
    let runs = 0;
    const stop = schedulePublish(() => void runs++, { page, settleMs: 20, refreshMs: 60_000 });
    expect(runs).toBe(0);
    await wait(40);
    expect(runs).toBe(1);
    stop();
  });

  test('hidden before it settles (a phone locked right after Save): publishes at once, and not again on settling', async () => {
    const { page, hide } = fakePage();
    let runs = 0;
    const stop = schedulePublish(() => void runs++, { page, settleMs: 20, refreshMs: 60_000 });
    hide();
    expect(runs).toBe(1);
    await wait(40);
    expect(runs).toBe(1);
    stop();
  });

  test('left (pagehide) before it settles: publishes at once; hidden after it already ran: nothing more', async () => {
    const left = fakePage();
    let runs = 0;
    const stop = schedulePublish(() => void runs++, { page: left.page, settleMs: 20, refreshMs: 60_000 });
    left.leave();
    left.hide();
    expect(runs).toBe(1);
    stop();
  });

  test('stopped (a newer change took over): nothing runs, not even when hidden', async () => {
    const { page, hide } = fakePage();
    let runs = 0;
    schedulePublish(() => void runs++, { page, settleMs: 20, refreshMs: 60_000 })();
    hide();
    await wait(40);
    expect(runs).toBe(0);
  });

  test('republishes on the refresh interval while open', async () => {
    const { page } = fakePage();
    let runs = 0;
    const stop = schedulePublish(() => void runs++, { page, settleMs: 5, refreshMs: 15 });
    await wait(55);
    stop();
    expect(runs).toBeGreaterThanOrEqual(3);
  });
});
