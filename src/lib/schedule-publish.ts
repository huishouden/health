/** Waits this long after a change before publishing, so a run of taps writes once; hidden sooner, it publishes then. */
export const SETTLE_MS = 3_000;
/** And republishes this often while the app stays open (the shared tablet), so the reminders ahead stay a week deep. */
export const REFRESH_MS = 30 * 60_000;

/** Where `schedulePublish` hears that the app was put away (the page's document and window). */
export interface PageEvents {
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Runs `run` once the change settles (`settleMs`) and then every `refreshMs`, or at once when the
 * app is hidden or left before it settled (a phone locked right after Save), so the change still
 * reaches the household. Returns the stop.
 */
export function schedulePublish(
  run: () => void | Promise<void>,
  { page = { doc: document, win: window }, settleMs = SETTLE_MS, refreshMs = REFRESH_MS }: { page?: PageEvents; settleMs?: number; refreshMs?: number } = {},
): () => void {
  let pending = true;
  const go = () => {
    pending = false;
    void run();
  };
  const settle = setTimeout(go, settleMs);
  const refresh = setInterval(go, refreshMs);
  const flush = () => {
    if (!pending) return;
    clearTimeout(settle);
    go();
  };
  const onHide = () => {
    if (page.doc.visibilityState === 'hidden') flush();
  };
  page.doc.addEventListener('visibilitychange', onHide);
  page.win.addEventListener('pagehide', flush);
  return () => {
    clearTimeout(settle);
    clearInterval(refresh);
    page.doc.removeEventListener('visibilitychange', onHide);
    page.win.removeEventListener('pagehide', flush);
  };
}
