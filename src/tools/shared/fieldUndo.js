/*
 * UNIVERSAL UNDO FOR A TOOL WHOSE ANSWER IS A HANDFUL OF FIELDS (TOOL-2).
 *
 * Ten registry tools had no Undo: the work bar's ↶ Undo was always there and
 * always greyed. Most of them hold their answer as a few
 * `usePersistentToolState` fields — typed boxes, a slider, a choice — and the
 * platform hook (useMathUndoHistory) needs exactly two things from them: the
 * fields as one object, and a way to put such an object back. This is that,
 * once, so each tool names its fields instead of writing a restore by hand.
 *
 * `restoreToolFields` is pure (node tests it): a field the restored state does
 * not carry — a history saved before the tool grew that field — is left as it
 * is rather than blanked, and only a field whose value differs is written, so
 * an Undo never rewrites the draft beyond what it takes back.
 */
import { mathematicalSnapshot } from '../../platform/workView/mathUndoStack.js';

export const toolFieldState = (fields) => Object.fromEntries(
  Object.entries(fields || {}).map(([name, [value]]) => [name, value]),
);

export const restoreToolFields = (fields, restored) => {
  const written = [];
  if (!restored || typeof restored !== 'object') return written;
  Object.entries(fields || {}).forEach(([name, [value, set]]) => {
    if (!Object.prototype.hasOwnProperty.call(restored, name)) return;
    if (mathematicalSnapshot(value) === mathematicalSnapshot(restored[name])) return;
    set(restored[name]);
    written.push(name);
  });
  return written;
};
