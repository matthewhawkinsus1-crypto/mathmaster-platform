/*
 * MANY SMALL REAL-TIME UPDATES, ONE RENDER.
 *
 * The teacher dashboard streams one presence document per rostered student.
 * Each student's device heartbeats every 20 seconds, and every snapshot used
 * to call setState on the root App component — so a teacher with 150 students
 * re-rendered the entire dashboard about 7.5 times a second while it sat idle,
 * and the initial subscription fired 150 renders in a row. That is the
 * "sluggish dashboard" profile: constant work proportional to roster size.
 *
 * A buffer collects the latest value per key and flushes them together at most
 * once per `flushMs`. The first flush is immediate (the teacher sees the room
 * at once); later snapshots inside the window are merged into the next flush.
 * `null` means "the document is gone" and deletes the key.
 *
 * Pure except for the injected timer, so the render counts are measured in a
 * node test rather than asserted.
 */

export const PRESENCE_FLUSH_MS = 1000;

export const createKeyedUpdateBuffer = ({
  flushMs = PRESENCE_FLUSH_MS,
  onFlush,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle),
  now = () => Date.now(),
} = {}) => {
  let pending = new Map();
  let timer = null;
  let lastFlushAt = -Infinity;
  let cancelled = false;

  const flush = () => {
    timer = null;
    if (cancelled || !pending.size) return;
    const changes = pending;
    pending = new Map();
    lastFlushAt = now();
    onFlush?.(changes);
  };

  return {
    set(key, value) {
      if (cancelled) return;
      pending.set(key, value);
      if (timer !== null) return;
      const wait = Math.max(0, lastFlushAt + flushMs - now());
      if (wait === 0) flush();
      else timer = setTimer(flush, wait);
    },
    cancel() {
      cancelled = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending = new Map();
    },
  };
};

/**
 * Apply a batch to a keyed record. Returns the SAME object when nothing
 * changed, so React skips the render entirely.
 */
export const applyKeyedChanges = (current = {}, changes = new Map()) => {
  let next = current;
  changes.forEach((value, key) => {
    if (value === null || value === undefined) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) return;
      if (next === current) next = { ...current };
      delete next[key];
      return;
    }
    if (next[key] === value) return;
    if (next === current) next = { ...current };
    next[key] = value;
  });
  return next;
};

export default createKeyedUpdateBuffer;
