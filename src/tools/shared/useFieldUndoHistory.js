import { useMemo, useRef } from 'react';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import { restoreToolFields, toolFieldState } from './fieldUndo.js';

/**
 * Universal Undo over a tool's answer fields (fieldUndo.js, TOOL-2).
 *
 *   const undo = useFieldUndoHistory({
 *     questionData,
 *     fields: { fogAnswer: [fogAnswer, setFogAnswer], x: [x, setX] },
 *     onRestore: clearFeedback,
 *   });
 *
 * The tool keeps its own state; the history is the platform's, registered with
 * the work bar's ↶ Undo and kept across a reload of this question on this
 * device (persistedMathUndo.js — never in the synced draft, nor sent with a
 * secure item's drafts). An Undo writes back the fields it takes back and calls
 * `onRestore`; it never submits and never touches a recorded attempt.
 *
 * A verdict on screen is the tool's business, exactly as after its own edits: a
 * tool that clears its verdict when the student edits passes `onRestore` to do
 * the same on an Undo (Data Modeling, Function Operations); one whose edits
 * leave the last verdict up leaves it up after an Undo too.
 */
export default function useFieldUndoHistory({ questionData, fields, label = 'Undo your last change', onRestore = null, persist = true }) {
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const values = Object.values(fields).map(([value]) => value);
  // The fields of one tool are fixed, so the dependency list keeps its length.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => toolFieldState(fieldsRef.current), values);
  const restore = useMemo(() => (restored) => {
    restoreToolFields(fieldsRef.current, restored);
    onRestoreRef.current?.(restored);
  }, []);
  return useMathUndoHistory({
    label,
    state,
    onRestore: restore,
    resetKey: questionUndoResetKey(questionData),
    persist,
  });
}
