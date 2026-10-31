/*
 * WHO TO SEE NEXT (TT16).
 *
 * The Live Class grid shows everyone, sorted raised hands first and then by
 * severity and name. In a room of thirty a teacher walking the floor needs one
 * more answer than "who is flagged": who has gone LONGEST without moving on,
 * so the next stop is the student who has waited most. This orders the room by
 * exactly that, from the rows the monitor already has — no new telemetry, no new
 * listener.
 *
 *   1. A RAISED HAND comes first, the one that has waited longest first. A
 *      hand is the student asking; nothing outranks it.
 *   2. Then everyone else working on this assignment, by time since their last
 *      answer, move to another question or submit (`row.idleMs`, which the
 *      student's client stamps only on that kind of academic action: a closed
 *      laptop or a page in another tab is a different flag). A student quiet for
 *      two minutes or more (the monitor's own "recently active" line) is in the
 *      list; so is a student who is STUCK (three or more wrong tries on the
 *      question), however recently they tried, because that is the clearest
 *      "come here" signal there is (livePresence.js) — such a student ranks by
 *      their own quiet time like anyone else, so a student who is typing
 *      steadily comes after one who has stopped.
 *
 * WHAT IS NOT IN IT. A student who is offline (a closed laptop is not a student
 * in front of a screen), who has not started (their own alert tile says so), or
 * who is absent (the monitor already leaves them out). And when most of the
 * room goes quiet together, quiet time says nothing: that is teacher talk,
 * paper work or a class change far more often than thirty students stopping at
 * once, the same reason individual idle alerts are suppressed then
 * (livePresence.js CLASSWIDE_QUIET_SHARE). Hands and stuck students are still
 * listed; the rest is not, and the caller says why.
 *
 * It is a teacher's list: it names students, so the screen never shows it on the
 * projector.
 *
 * THE REST OF TT16 / G-39 (live monitor signals), recorded here, NOT built: this
 * large item was scoped to this one slice, and the rest needs a rule or a new
 * kind of stored data:
 *   - Proposed-absent roll at the bell: an absent mark decides which class
 *     meetings a student missed, and support deadlines count meetings
 *     (supportDeadline.mjs), so "who is absent" needs the owner's rule (no
 *     sign-in by when; late vs absent) before MathMaster proposes marks. The
 *     attendance panel and its "Absent last class" suggestions already exist.
 *   - Partial presence (arrived late, left early): needs presence INTERVALS; the
 *     monitor keeps only each student's latest heartbeat (presence/{studentId}).
 *   - Period replay: the same gap — it needs the heartbeat history, which is not
 *     stored. Retention (how long, whose data) is a privacy decision.
 *   - Which question broke the room: the data is already here (every student's
 *     `questionStates` marks each question c/x), so a per-question tally needs no
 *     new telemetry; it needs a definition of "broke" (share who missed it? first
 *     try?). Walkthrough already says how many students are ON one question.
 *   - Flag for follow-up from a tile: already built. Every flagged tile offers
 *     "Small-group candidate" and "Parent follow-up", which write support events
 *     (onSupportAction); the Teacher Action Center reads them.
 */
import {
  CLASSWIDE_QUIET_SHARE,
  LIVE_FLAGS,
  RECENTLY_ACTIVE_AFTER_MS,
} from '../../livePresence.js';

export const SEE_NEXT_LIMIT = 5;

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const has = (row, flag) => Array.isArray(row?.flags) && row.flags.includes(flag);

/** "Q4" for the question a student is on, in its own section. */
const questionName = (row) => {
  const index = Number(row?.live?.sectionQuestionIndex ?? row?.live?.questionIndex);
  return Number.isFinite(index) && index >= 0 ? `Q${Math.floor(index) + 1}` : '';
};

/** "7 min", or "under a minute". */
export const minutesText = (milliseconds) => {
  const minutes = Math.floor(Math.max(0, Number(milliseconds) || 0) / 60000);
  return minutes < 1 ? 'under a minute' : `${minutes} min`;
};

// A wait worth saying: a minute or more. Under that it is just "now".
const waited = (waitMs) => (waitMs >= 60000 ? ` · ${minutesText(waitMs)}` : '');

const item = (row, kind, waitMs) => {
  const where = questionName(row);
  const tries = Math.max(0, Math.floor(Number(row?.live?.currentAttempts) || 0));
  const reason = {
    help: `Hand raised${where ? ` on ${where}` : ''}${waited(waitMs) ? ` · waiting ${minutesText(waitMs)}` : ''}`,
    stuck: `Stuck${where ? ` on ${where}` : ''}${tries ? ` · ${tries} tries` : ''}${waited(waitMs) ? ` · quiet ${minutesText(waitMs)}` : ''}`,
    quiet: `Quiet for ${minutesText(waitMs)}${where ? ` · ${where}` : ''}`,
  }[kind];
  return {
    id: row.id,
    name: row.name,
    nameMissing: Boolean(row.nameMissing),
    idLabel: row.idLabel || '',
    kind,
    waitMs,
    reason,
  };
};

/**
 * The students to see next, in order, at most `limit`.
 *
 *   rows        summarizeLiveClass(...).rows — the monitor's own rows
 *   classStats  summarizeLiveClass(...).classStats
 *   nowValue    the monitor's clock
 *
 * Returns `{ items, classwideQuiet, total }`: `total` is how many would be listed
 * without the limit, for "and 3 more"; `classwideQuiet` says the room is quiet
 * together, so quiet time was not used.
 */
export const seeNextQueue = ({ rows = [], classStats = null, nowValue = Date.now(), limit = SEE_NEXT_LIMIT } = {}) => {
  const classwideQuiet = Boolean(
    classStats
    && Number(classStats.activeCount) >= 4
    && Number(classStats.idleShare) >= CLASSWIDE_QUIET_SHARE,
  );
  const hands = [];
  const others = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    // `isOnline` is false for a closed laptop AND for a student who has not
    // started (livePresence.js classifyLiveStudent), so this one test leaves out
    // both; their own tiles already say so.
    if (!row || !row.id || !row.isOnline) return;
    if (has(row, LIVE_FLAGS.HELP_REQUESTED)) {
      const raisedAt = toMillis(row.live?.helpRequestedAt);
      hands.push(item(row, 'help', raisedAt ? Math.max(0, nowValue - raisedAt) : 0));
      return;
    }
    const quietMs = Math.max(0, Number(row.idleMs) || 0);
    const stuck = has(row, LIVE_FLAGS.STUCK);
    if (stuck) {
      others.push(item(row, 'stuck', quietMs));
    } else if (!classwideQuiet && quietMs >= RECENTLY_ACTIVE_AFTER_MS) {
      others.push(item(row, 'quiet', quietMs));
    }
  });
  const byWait = (a, b) => b.waitMs - a.waitMs
    || Number(a.nameMissing) - Number(b.nameMissing)
    || a.name.localeCompare(b.name)
    || String(a.id).localeCompare(String(b.id));
  hands.sort(byWait);
  others.sort(byWait);
  const all = [...hands, ...others];
  return { items: all.slice(0, Math.max(0, Math.floor(Number(limit) || 0))), classwideQuiet, total: all.length };
};

export default seeNextQueue;
