/** Waits this long after a change before publishing, so a run of taps writes once; hidden sooner, it publishes then. */
export const SETTLE_MS = 3_000;
/** And republishes this often while the app stays open (the shared tablet), so the reminders ahead stay a week deep. */
export const REFRESH_MS = 30 * 60_000;

/** Where `schedulePublish` hears that the app was put away (the page's document and window). */
export interface PageEvents {
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/** The clock `schedulePublish` waits on (the globals; tests pass their own). */
export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: never) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: never) => void;
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

/**
 * Runs `run` once the change settles (`settleMs`) and then every `refreshMs`, or at once when the
 * app is hidden or left before it settled (a phone locked right after Save), so the change still
 * reaches the household. Returns the stop.
 */
export function schedulePublish(
  run: () => void | Promise<void>,
  { page = { doc: document, win: window }, settleMs = SETTLE_MS, refreshMs = REFRESH_MS, timers = globalTimers }: { page?: PageEvents; settleMs?: number; refreshMs?: number; timers?: Timers } = {},
): () => void {
  let pending = true;
  const go = () => {
    pending = false;
    void run();
  };
  const settle = timers.setTimeout(go, settleMs) as never;
  const refresh = timers.setInterval(go, refreshMs) as never;
  const flush = () => {
    if (!pending) return;
    timers.clearTimeout(settle);
    go();
  };
  const onHide = () => {
    if (page.doc.visibilityState === 'hidden') flush();
  };
  page.doc.addEventListener('visibilitychange', onHide);
  page.win.addEventListener('pagehide', flush);
  return () => {
    timers.clearTimeout(settle);
    timers.clearInterval(refresh);
    page.doc.removeEventListener('visibilitychange', onHide);
    page.win.removeEventListener('pagehide', flush);
  };
}
