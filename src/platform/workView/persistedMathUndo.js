/*
 * UNDO THAT SURVIVES A REFRESH, WITHOUT RIDING THE SERVER BACKUP.
 *
 * A student who refreshes mid-solve should still be able to take back the step
 * they just made (#390). The history therefore has to outlive the page — but it
 * must not live inside the tool's work record. That record is what
 * `writeQuestionDraft` hands to the background workspace sync, and the sync
 * refuses any value over MAX_WORKSPACE_DRAFT_VALUE_BYTES (16 KB). Sixty full
 * snapshots of a 3×3 elimination are ~37 KB, so storing the stack beside the
 * work silently stopped the WORK itself from reaching the server: a Chromebook
 * swap lost the solve to save an Undo button.
 *
 * So the stack is written straight to this device's storage, never through
 * `writeQuestionDraft`, and is capped by size. It sits under the tool's own
 * draft key so the question's draft family cleanup (`removeQuestionDraftFamily`,
 * `resetQuestionDraftFamily`, `removeAssignmentDrafts`) retires it with the
 * work, and it uses the draft envelope so `readQuestionDraft`'s expiry applies.
 *
 * DECIDED (TL47, the owner, October 2026): the history stays on this device.
 * A student who moves to another Chromebook keeps the WORK, which rides the
 * server backup, and starts there with an empty Undo. Carrying the stack
 * across devices would put it back into the synced record and over the 16 KB
 * limit above, or need a store of its own for what is a convenience, not
 * work.
 */
import { readQuestionDraft } from '../../questionDraftStorage.js';
import { EMPTY_MATH_UNDO_STACK, mathematicalSnapshot } from './mathUndoStack.js';

export const PERSISTED_UNDO_SEGMENT = 'undo';

// Enough for the recent steps a refreshed student reaches for (a 3×3
// elimination snapshot is ~0.6–1.1 KB), small enough that a long assignment's
// histories cannot crowd the work out of the browser's storage quota.
export const PERSISTED_UNDO_MAX_CHARS = 12_000;

export const persistedUndoKey = (toolKey, ownerId) => (
  toolKey && ownerId ? `${toolKey}:${PERSISTED_UNDO_SEGMENT}:${ownerId}` : null
);

/** Is this storage key an Undo history (persistedUndoKey), rather than work? */
export const isPersistedUndoKey = (key) => String(key ?? '').includes(`:${PERSISTED_UNDO_SEGMENT}:`);

/*
 * A question's draft family as it may leave this device. The secure-exam
 * runtime sends every key under the item's draft key to the server
 * (RichQuestionRuntime.jsx, saveSecureExamDraft), inside per-item size and
 * entry limits; the Undo history is this device's convenience, not work, and
 * must not ride along (pass 3 review).
 */
export const withoutPersistedUndo = (entries) => (Array.isArray(entries) ? entries : [])
  .filter((entry) => !isPersistedUndoKey(entry?.key));

/** The newest entries whose serialized size fits the budget, oldest first. */
export const boundUndoEntries = (entries, maxChars = PERSISTED_UNDO_MAX_CHARS) => {
  const list = Array.isArray(entries) ? entries : [];
  const kept = [];
  let total = 0;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    let size;
    try {
      size = JSON.stringify(list[index] ?? null).length;
    } catch {
      break;
    }
    if (total + size > maxChars) break;
    total += size;
    kept.unshift(list[index]);
  }
  return kept;
};

const storage = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Local only: no draft notification, so the workspace sync never sees it. */
export const writePersistedUndo = (key, { resetKey = null, state, stack } = {}) => {
  const store = storage();
  if (!key || !store) return false;
  const entries = boundUndoEntries(stack?.entries);
  try {
    if (!entries.length) {
      store.removeItem(key);
      return true;
    }
    store.setItem(key, JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      value: { resetKey, snapshot: mathematicalSnapshot(state), entries },
    }));
    return true;
  } catch {
    // Out of quota: Undo falls back to this page's memory. The work is unaffected.
    return false;
  }
};

/*
 * A SAVED STEP IS READ BACK AS A CLAIM, AS A DRAFT IS.
 *
 * The history sits in the same storage as the draft and is as open to damage:
 * an older build's shape, another device's, anything that rewrote it. A draft
 * field is checked before a tool sees it (usePersistentToolState.js,
 * hydrateToolDraftField), but an Undo handed a saved step to the tool's setters
 * unchecked, so a step holding a value the tool cannot draw threw in the render
 * after the press: "This question could not be displayed", on an action rather
 * than on load (the November build's handoff, section 6).
 *
 * So each key of a saved step goes through the check of the draft field it is
 * restored into (`checks`; useMathUndoHistory builds them from the tool's
 * `draftFields`). A value its field keeps comes back as the field restores it:
 * the same value when it is valid, its valid part when not. A step that is not
 * a record, or holds a value its field would not keep at all, is dropped: an
 * Undo never writes a field's blank over the student's work, it goes to the
 * step before instead. A key no field claims is left as it is (a tool's restore
 * reads only its own keys), and `__proto__` is removed. A valid step comes back
 * as the very object saved.
 */
const isStep = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Two values read from JSON hold the same: a field's check may hand back an
// equal copy of a valid value (Representation Match's assignments are rebuilt
// on every read), which is no repair, so the step keeps the value it saved.
const sameValue = (a, b, depth = 0) => {
  if (Object.is(a, b)) return true;
  if (depth > 64 || !a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key], depth + 1));
};

export const repairUndoStep = (step, checks = {}) => {
  if (!isStep(step)) return { value: undefined, issues: ['not-a-record'] };
  const issues = [];
  let changed = false;
  const kept = {};
  for (const key of Object.keys(step)) {
    if (key === '__proto__') {
      changed = true;
      issues.push('hostile-key');
      continue;
    }
    const check = Object.prototype.hasOwnProperty.call(checks, key) ? checks[key] : null;
    let result = null;
    try {
      result = typeof check === 'function' ? check(step[key]) : null;
    } catch {
      return { value: undefined, issues: [...issues, `${key}: check-failed`] };
    }
    if (result === null) {
      kept[key] = step[key];
      continue;
    }
    const found = Array.isArray(result?.issues) ? result.issues.map(String) : [];
    if (result?.restored !== true) return { value: undefined, issues: [...issues, `${key}: ${found.join(', ') || 'not-kept'}`] };
    if (sameValue(result.value, step[key])) {
      kept[key] = step[key];
      continue;
    }
    found.forEach((issue) => issues.push(`${key}: ${issue}`));
    changed = true;
    kept[key] = result.value;
  }
  return { value: changed ? kept : step, issues };
};

// What one repair says, at most this many times (the diagnostic is bounded).
const MAX_REPORTED_STEPS = 12;

/*
 * The saved steps through `repair`. Nothing that needed repair: the very array
 * read. Otherwise a dropped step is gone, and so is one that now reads as the
 * state after it (an Undo that would change nothing); `onRepair` hears what.
 */
const repairedSteps = (steps, repair, state, onRepair) => {
  const issues = [];
  const note = (issue) => { if (issues.length < MAX_REPORTED_STEPS) issues.push(issue); };
  let changed = false;
  const kept = [];
  steps.forEach((step, index) => {
    let result;
    try {
      result = repair(step);
    } catch {
      result = { value: undefined, issues: ['repair-failed'] };
    }
    const found = Array.isArray(result?.issues) && result.issues.length ? ` (${result.issues.join(', ')})` : '';
    if (result?.value === undefined) {
      changed = true;
      note(`step ${index + 1} dropped${found}`);
      return;
    }
    if (result.value !== step) {
      changed = true;
      note(`step ${index + 1} repaired${found}`);
    }
    kept.push({ value: result.value, index });
  });
  if (!changed) return steps;
  const out = [];
  let after = mathematicalSnapshot(state);
  for (let position = kept.length - 1; position >= 0; position -= 1) {
    const snapshot = mathematicalSnapshot(kept[position].value);
    if (snapshot === after) {
      note(`step ${kept[position].index + 1} dropped (no change)`);
      continue;
    }
    out.unshift(kept[position].value);
    after = snapshot;
  }
  onRepair?.({ issues, saved: steps.length, kept: out.length });
  return out;
};

/**
 * The saved stack, only if it was recorded for THIS question and ends at the
 * state the tool restored. Anything else — another question, a teacher reset,
 * a newer server draft restored over this device — is history for a different
 * state, and replaying it would hand the student work they never had.
 *
 * `repair` reads each saved step back (repairUndoStep with the tool's checks);
 * `onRepair` hears what it repaired or dropped. A stack in which nothing needed
 * repair comes back exactly as it was saved.
 */
export const readPersistedUndo = (key, { resetKey = null, state, limit, repair = null, onRepair = null } = {}) => {
  const saved = key ? readQuestionDraft(key, null) : null;
  if (!saved || saved.resetKey !== resetKey || !Array.isArray(saved.entries)) return EMPTY_MATH_UNDO_STACK;
  if (saved.snapshot !== mathematicalSnapshot(state)) return EMPTY_MATH_UNDO_STACK;
  const recent = Number(limit) > 0 ? saved.entries.slice(-Number(limit)) : saved.entries;
  const entries = typeof repair === 'function' ? repairedSteps(recent, repair, state, onRepair) : recent;
  return entries.length ? { entries } : EMPTY_MATH_UNDO_STACK;
};
