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

/**
 * The saved stack, only if it was recorded for THIS question and ends at the
 * state the tool restored. Anything else — another question, a teacher reset,
 * a newer server draft restored over this device — is history for a different
 * state, and replaying it would hand the student work they never had.
 */
export const readPersistedUndo = (key, { resetKey = null, state, limit } = {}) => {
  const saved = key ? readQuestionDraft(key, null) : null;
  if (!saved || saved.resetKey !== resetKey || !Array.isArray(saved.entries)) return EMPTY_MATH_UNDO_STACK;
  if (saved.snapshot !== mathematicalSnapshot(state)) return EMPTY_MATH_UNDO_STACK;
  const entries = Number(limit) > 0 ? saved.entries.slice(-Number(limit)) : saved.entries;
  return entries.length ? { entries } : EMPTY_MATH_UNDO_STACK;
};
