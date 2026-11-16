/*
 * SENDING CRASH COUNTS, WHEN THE OWNER HAS TURNED THAT ON.
 *
 * Loaded only after a failure was recorded (clientDiagnostics.js imports it
 * lazily), so it costs the first load nothing and a healthy session never
 * runs it. It reads no Firestore document, ever: whether reporting is on
 * comes back from the callable itself.
 *
 * What is sent is defined in functions/shared/crashReport.mjs: a count in a
 * bucket made of closed shapes. The scrubbed message the local log keeps is
 * NOT sent; it is reduced here to a signature built from a fixed word list.
 *
 *   - Mode unknown: one empty `{ probe: true }` request asks. Nothing about
 *     the failure is sent until the answer is "family" or "question".
 *   - Mode off: the queue is dropped and this device does not ask again for
 *     24 hours.
 *   - Mode on: failures are counted into buckets on the device and sent in
 *     one batch after a short quiet period, with a growing gap between
 *     batches and at most MAX_CALLS_PER_DAY requests a day.
 */
import {
  CRASH_KINDS,
  CRASH_REPORT_LIMITS,
  CRASH_REPORT_SCHEMA,
  clampCrashCount,
  crashBucketId,
  normalizeCrashBucket,
  utcDayKey,
} from '../../../functions/shared/crashReport.mjs';

export const CRASH_REPORT_STORAGE_KEY = 'mm:crash-reports';
export const MAX_CALLS_PER_DAY = CRASH_REPORT_LIMITS.callsPerReporterPerDay;
export const MODE_TTL_MS = 24 * 60 * 60 * 1000;
export const FIRST_SEND_DELAY_MS = 3000;
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

const browserStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** The real transport: null when nobody is signed in (nothing is sent, nothing is counted). */
const callableTransport = async (payload) => {
  const [{ httpsCallable }, { auth, functions }] = await Promise.all([import('firebase/functions'), import('../../firebaseApp.js')]);
  if (!auth?.currentUser) return null;
  const response = await httpsCallable(functions, 'reportClientCrashes')(payload);
  return response?.data || {};
};

export const createCrashReporter = ({
  storage = browserStorage(),
  transport = callableTransport,
  now = () => Date.now(),
  setTimer = (fn, ms) => {
    const id = setTimeout(fn, ms);
    id?.unref?.(); // node (tests): a pending report never keeps a process alive
    return id;
  },
  clearTimer = (id) => clearTimeout(id),
} = {}) => {
  let timer = null;
  let flushing = false;

  const load = () => {
    let state = null;
    try {
      state = JSON.parse(storage?.getItem(CRASH_REPORT_STORAGE_KEY) || 'null');
    } catch {
      state = null;
    }
    if (!state || typeof state !== 'object') state = {};
    const day = utcDayKey(now());
    if (state.day !== day) state = { mode: state.mode, modeAt: state.modeAt, queue: state.queue, day, calls: 0, lastCallAt: 0 };
    if (!state.queue || typeof state.queue !== 'object') state.queue = {};
    return state;
  };
  const save = (state) => {
    try {
      storage?.setItem(CRASH_REPORT_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: this failure goes unreported.
    }
  };
  const modeIsFresh = (state) => typeof state.mode === 'string' && now() - (Number(state.modeAt) || 0) < MODE_TTL_MS;
  const nextAllowedAt = (state) => (state.calls > 0
    ? (Number(state.lastCallAt) || 0) + Math.min(BACKOFF_BASE_MS * (2 ** (state.calls - 1)), BACKOFF_MAX_MS)
    : 0);

  const schedule = (delay) => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      return flush();
    }, delay);
  };

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      let state = load();
      if (!Object.keys(state.queue).length) return;
      if (state.calls >= MAX_CALLS_PER_DAY) return;
      const wait = nextAllowedAt(state) - now();
      if (wait > 0) {
        schedule(wait);
        return;
      }
      const call = async (payload) => {
        const answer = await transport(payload);
        if (answer === null) return null;
        state = load();
        state.calls += 1;
        state.lastCallAt = now();
        if (typeof answer?.mode === 'string') {
          state.mode = answer.mode;
          state.modeAt = now();
        }
        save(state);
        return answer;
      };
      if (!modeIsFresh(state)) {
        // Ask first. Nothing about the failure leaves until the answer is yes.
        if (await call({ probe: true }) === null) return;
      }
      if (state.mode !== 'family' && state.mode !== 'question') {
        state.queue = {};
        save(state);
        return;
      }
      // Rebuild for the mode the server named: "family" drops the question.
      // One request holds a bounded number of buckets. What does not fit stays
      // queued for the next request, so `sentKeys` names only what went.
      const merged = new Map();
      const sentKeys = [];
      for (const [key, entry] of Object.entries(state.queue)) {
        const bucket = normalizeCrashBucket(entry?.bucket, { mode: state.mode });
        const id = crashBucketId(bucket);
        if (!merged.has(id) && merged.size >= CRASH_REPORT_LIMITS.bucketsPerCall) continue;
        const count = clampCrashCount((merged.get(id)?.count || 0) + (Number(entry?.count) || 1));
        merged.set(id, { ...bucket, count });
        sentKeys.push(key);
      }
      const buckets = [...merged.values()].map((bucket) => {
        const sent = { ...bucket };
        delete sent.role; // the server takes the role from the sign-in, not from the request
        return sent;
      });
      if (state.calls >= MAX_CALLS_PER_DAY) return;
      const answer = await call({ v: CRASH_REPORT_SCHEMA, buckets });
      if (answer === null) return;
      for (const key of sentKeys) delete state.queue[key];
      save(state);
      if (Object.keys(state.queue).length) schedule(nextAllowedAt(state) - now());
    } catch {
      // A failed report is never shown and never retried in a loop: the call
      // was not counted, so count the attempt and let the backoff space it.
      const state = load();
      state.calls += 1;
      state.lastCallAt = now();
      save(state);
    } finally {
      flushing = false;
    }
  };

  /**
   * Count one failure. `detail` is what the diagnostic already holds: kind,
   * source, build, screen (a path), the error text, and for a question its
   * family, module, assignment and question ids.
   */
  const reportCrash = (detail = {}) => {
    if (!storage) return false;
    if (!CRASH_KINDS.includes(detail.kind)) return false;
    const state = load();
    if (modeIsFresh(state) && state.mode !== 'family' && state.mode !== 'question') return false;
    // Kept on the device at question detail; reduced to the server's mode when sent.
    const bucket = normalizeCrashBucket(detail, { mode: 'question' });
    const id = crashBucketId(bucket);
    const full = !state.queue[id] && Object.keys(state.queue).length >= CRASH_REPORT_LIMITS.bucketsPerReporterPerDay;
    if (!full) {
      state.queue[id] = { bucket, count: clampCrashCount((Number(state.queue[id]?.count) || 0) + 1) };
      save(state);
    }
    if (state.calls < MAX_CALLS_PER_DAY) schedule(Math.max(FIRST_SEND_DELAY_MS, nextAllowedAt(state) - now()));
    return !full;
  };

  /** Send what an earlier page left queued (a crash followed by a quick reload). */
  const resume = () => {
    const state = load();
    if (Object.keys(state.queue).length && state.calls < MAX_CALLS_PER_DAY) schedule(Math.max(FIRST_SEND_DELAY_MS, nextAllowedAt(state) - now()));
  };

  return { reportCrash, resume, flush };
};

let shared = null;
const reporter = () => {
  if (!shared) shared = createCrashReporter();
  return shared;
};
export const reportCrash = (detail) => reporter().reportCrash(detail);
export const resumeCrashReports = () => reporter().resume();
