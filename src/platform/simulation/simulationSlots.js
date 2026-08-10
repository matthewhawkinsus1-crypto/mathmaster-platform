// Simulation slots, snapshots and the simulated clock.
//
// A teacher exploring routing needs to compare branches, not destroy one
// scenario to look at another: "here is the struggling student before question
// four, and here is the same student if they get it right". That needs three
// things the simulator did not have — several named simulations at once, saved
// states that can be restored, and a clock the teacher controls.
//
// All pure. The simulated learner document itself is produced by
// `simulatedLearner.js`; this only holds, copies and rewinds it.

const now = () => Date.now();

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export const DEFAULT_SLOT_NAMES = Object.freeze([
  'Default test student',
  'Struggling student',
  'Advanced student',
]);

/**
 * A slot holds one simulated learner and its history. `session` is exactly what
 * createSimulatedLearner returned, plus whatever the outcome controls have done
 * to it since.
 */
export const createSlot = ({ name = 'Simulation', session = null, nowValue = null } = {}) => ({
  id: uid('slot'),
  name,
  session,
  snapshots: [],
  // Null means "use the real clock". A teacher who has not set a date should
  // see what a student sees today, not a date this file invented.
  simulatedNow: nowValue,
  createdAt: now(),
});

export const renameSlot = (slots, slotId, name) => slots.map((slot) => (
  slot.id === slotId ? { ...slot, name: String(name || '').trim() || slot.name } : slot
));

export const updateSlot = (slots, slotId, changes) => slots.map((slot) => (
  slot.id === slotId ? { ...slot, ...changes } : slot
));

export const removeSlot = (slots, slotId) => {
  const remaining = slots.filter((slot) => slot.id !== slotId);
  // Never zero: a simulator with no simulation has nothing to show, and the
  // teacher would have to know to create one before anything worked.
  return remaining.length ? remaining : [createSlot({ name: DEFAULT_SLOT_NAMES[0] })];
};

/**
 * Copy a slot, including its saved snapshots.
 *
 * This is the "test both branches" move: duplicate, then force a different
 * outcome in the copy and compare. The copy is deliberately independent —
 * nothing in it shares a reference with the original.
 */
export const duplicateSlot = (slots, slotId, { name = null } = {}) => {
  const source = slots.find((slot) => slot.id === slotId);
  if (!source) return slots;
  const copy = {
    ...structuredCloneish(source),
    id: uid('slot'),
    name: name || `${source.name} (copy)`,
    createdAt: now(),
  };
  const index = slots.findIndex((slot) => slot.id === slotId);
  return [...slots.slice(0, index + 1), copy, ...slots.slice(index + 1)];
};

// The session is plain JSON — synthetic documents, records and timeline
// entries — so this is a deep copy without needing structuredClone, which is
// absent in some of the environments the tests run in.
const structuredCloneish = (value) => JSON.parse(JSON.stringify(value));

// --- Snapshots ---------------------------------------------------------------

/**
 * Save the slot's current state under a label.
 *
 * A snapshot captures the whole session — the learner document, the synthetic
 * assignments, the timeline and any CCMR overrides — because a restored state
 * that reproduces the routing but not the assessment evidence is not the same
 * state.
 */
export const saveSnapshot = (slot, { label = null, ccmrOverrides = {} } = {}) => {
  if (!slot?.session) return slot;
  const snapshot = {
    id: uid('snap'),
    at: now(),
    label: String(label || '').trim() || `Snapshot ${slot.snapshots.length + 1}`,
    session: structuredCloneish(slot.session),
    ccmrOverrides: structuredCloneish(ccmrOverrides || {}),
    simulatedNow: slot.simulatedNow ?? null,
  };
  return { ...slot, snapshots: [...slot.snapshots, snapshot] };
};

export const deleteSnapshot = (slot, snapshotId) => ({
  ...slot,
  snapshots: (slot.snapshots || []).filter((entry) => entry.id !== snapshotId),
});

/**
 * Restore a snapshot into the slot. Returns the slot and the CCMR overrides,
 * which the component owns separately.
 */
export const restoreSnapshot = (slot, snapshotId) => {
  const snapshot = (slot?.snapshots || []).find((entry) => entry.id === snapshotId);
  if (!snapshot) return { slot, ccmrOverrides: null, restored: false };
  return {
    slot: {
      ...slot,
      session: structuredCloneish(snapshot.session),
      simulatedNow: snapshot.simulatedNow ?? null,
    },
    ccmrOverrides: structuredCloneish(snapshot.ccmrOverrides || {}),
    restored: true,
  };
};

/**
 * Rewind the timeline to a point, discarding everything after it.
 *
 * The evidence itself is not rewound — attempts are recorded into the learner
 * document by the real attempt policy and cannot be un-recorded without
 * replaying. So a rewind restores the nearest snapshot at or before that point
 * and says so, rather than silently trimming a list and leaving the mastery
 * state where it was.
 */
export const rewindTo = (slot, eventId) => {
  const timeline = slot?.session?.timeline || [];
  const index = timeline.findIndex((entry) => entry.id === eventId);
  if (index < 0) return { slot, ccmrOverrides: null, restored: false, reason: 'unknown-point' };

  const at = timeline[index].at;
  const candidates = (slot.snapshots || []).filter((snapshot) => snapshot.at <= at);
  if (!candidates.length) {
    return { slot, ccmrOverrides: null, restored: false, reason: 'no-snapshot' };
  }
  const nearest = candidates.reduce((best, entry) => (entry.at > best.at ? entry : best));
  return { ...restoreSnapshot(slot, nearest.id), reason: 'restored', snapshotLabel: nearest.label };
};

// --- The simulated clock ------------------------------------------------------

/**
 * The value every engine should be given for "now".
 *
 * The real clock is never touched. A simulated date is passed through the same
 * `nowValue` the live app passes, so the calendar provider, the lifecycle and
 * the path engine all move together — which is what makes "change the date and
 * watch Module 3 become current" a real test rather than a display trick.
 */
// `Number(null)` is 0, and 0 is a finite number — the epoch. Checking the value
// rather than its coercion is what keeps "no simulated date" from meaning
// "1 January 1970".
const hasSimulatedNow = (slot) => typeof slot?.simulatedNow === 'number' && Number.isFinite(slot.simulatedNow);

export const resolveSimulatedNow = (slot, realNow = Date.now()) => (
  hasSimulatedNow(slot) ? slot.simulatedNow : realNow
);

export const setSimulatedDate = (slot, isoDate) => {
  const text = String(isoDate || '').trim();
  if (!text) return { ...slot, simulatedNow: null };
  // Midday local, so a date does not land either side of a day boundary
  // depending on the viewer's timezone.
  const parsed = Date.parse(`${text}T12:00:00`);
  return Number.isFinite(parsed) ? { ...slot, simulatedNow: parsed } : slot;
};

export const describeSimulatedDate = (slot) => {
  if (!hasSimulatedNow(slot)) return 'Today (real date)';
  return new Date(slot.simulatedNow).toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
};

/** The value an <input type="date"> should show for this slot. */
export const simulatedDateInputValue = (slot) => {
  if (!hasSimulatedNow(slot)) return '';
  const date = new Date(slot.simulatedNow);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
