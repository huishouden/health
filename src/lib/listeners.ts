/**
 * Which keyed listeners to stop and which to start, so each one restarts only when its own key
 * changes: `live` and `wanted` map an id (a person) to the key its listener reads with (the
 * household, the person and the window). Stopped first: a changed key is stopped and started again.
 */
export function planListeners(live: ReadonlyMap<string, string>, wanted: ReadonlyMap<string, string>): { stop: string[]; start: string[] } {
  const stop = [...live].filter(([id, key]) => wanted.get(id) !== key).map(([id]) => id);
  const start = [...wanted].filter(([id, key]) => live.get(id) !== key).map(([id]) => id);
  return { stop, start };
}
