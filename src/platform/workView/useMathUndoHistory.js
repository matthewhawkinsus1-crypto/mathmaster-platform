import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_MATH_UNDO_STACK,
  MATH_UNDO_LIMIT,
  mathUndoDepth,
  mathematicalSnapshot,
  recordMathUndoEntry,
  undoMathUndoEntry,
} from './mathUndoStack.js';

/*
 * HOW A BATCH A-D TOOL REACHES THE PLATFORM UNDO BUTTON.
 *
 * `QuestionEngine` has owned one shared Undo controller since long before Work
 * View, and the older modules register with it through an `onUndoStateChange`
 * prop. The tool registry does not pass that prop: a registry tool is mounted
 * with `questionData` and `onAction` and nothing else, which is why every one of
 * them grew its own Undo button beside its own controls. Eighteen tools, and no
 * two of them undid the same amount of work.
 *
 * Threading a new prop through the registry would put the burden on whoever
 * adds the next tool. A context instead: `QuestionEngine` opens the channel
 * once at the call site, and a tool opts in with one hook. Where no channel is
 * open — the tools lab bench, a teacher preview — the hook still tracks history
 * and still reports `canUndo`, so the Work View shell keeps a working Undo and
 * only the platform work bar is absent.
 */
const WorkViewUndoContext = createContext(null);

/**
 * Which question a tool is currently showing.
 *
 * `questionId` FIRST, and that ordering is the whole point. The canonical V5
 * boundary synthesises a `questionId` for every question and guarantees it is
 * unique; question-level `id` is usually absent there, and `prompt` is not an
 * identity at all — a drill repeats the same sentence over different givens, so
 * keying on it makes several consecutive questions look like one and hands the
 * student an Undo stack recorded for a different item. `ToolWrapper` already
 * keys its attempt record off this same chain; named once so the two cannot
 * drift.
 */
export const questionUndoResetKey = (questionData) => (
  questionData?.questionId ?? questionData?.id ?? questionData?.prompt ?? null
);

export function WorkViewUndoProvider({ register, children }) {
  return React.createElement(WorkViewUndoContext.Provider, { value: register || null }, children);
}

export const useWorkViewUndoRegistration = () => useContext(WorkViewUndoContext);

/**
 * Universal Undo over state a tool already owns.
 *
 * The tool keeps its own `useState` calls and hands this hook a plain object of
 * the values that are mathematically its answer, plus the one function that
 * puts such an object back. Nothing is copied into a second owner: the hook
 * holds previous states for the undo stack and reads the live one from the
 * render it is called in.
 *
 * PRESENTATION CANNOT ENTER. Anything the student sees but has not decided —
 * camera, drawers, the measured viewport — is stripped by
 * `mathematicalSnapshot` before two states are compared, so opening Work View,
 * rotating the phone, or pressing Fit records nothing and Undo still takes back
 * the last real edit.
 */
export default function useMathUndoHistory({
  label = 'Undo the last change',
  state,
  onRestore,
  // Something that changes when the QUESTION changes. Needed because a tool is
  // not always remounted between questions — `PathSessionPlayer` renders one
  // QuestionEngine and swaps the question under it — and a history that
  // survived that would let a student press Undo on question 4 and be handed
  // question 3's answer. Build it with `questionUndoResetKey`.
  resetKey = null,
  enabled = true,
  limit = MATH_UNDO_LIMIT,
}) {
  const stackRef = useRef(EMPTY_MATH_UNDO_STACK);
  const previousRef = useRef(state);
  // Set when a restore is in flight. Compared by snapshot rather than held as a
  // boolean: if the restore lands in a render this hook never sees — a tool that
  // restores into a value it already held — a boolean would stay set and
  // swallow the student's NEXT edit.
  const restoringSnapshotRef = useRef(null);
  const [depth, setDepth] = useState(0);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;
  const register = useWorkViewUndoRegistration();

  const resetKeyRef = useRef(resetKey);

  // Declared BEFORE the recording effect so a question change clears the stack
  // and re-baselines in the same flush that would otherwise record the swap
  // from one question's answers to the next as an edit.
  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    stackRef.current = EMPTY_MATH_UNDO_STACK;
    previousRef.current = state;
    restoringSnapshotRef.current = null;
    setDepth(0);
  }, [resetKey, state]);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;
    if (restoringSnapshotRef.current !== null) {
      if (restoringSnapshotRef.current === mathematicalSnapshot(state)) {
        restoringSnapshotRef.current = null;
        return;
      }
      restoringSnapshotRef.current = null;
    }
    const next = recordMathUndoEntry(stackRef.current, previous, state, { limit });
    if (next === stackRef.current) return;
    stackRef.current = next;
    setDepth(mathUndoDepth(next));
  }, [state, limit]);

  const undo = useCallback(() => {
    const { stack, restored, changed } = undoMathUndoEntry(stackRef.current);
    if (!changed) return false;
    stackRef.current = stack;
    restoringSnapshotRef.current = mathematicalSnapshot(restored);
    setDepth(mathUndoDepth(stack));
    restoreRef.current?.(restored);
    return true;
  }, []);

  const clear = useCallback(() => {
    stackRef.current = EMPTY_MATH_UNDO_STACK;
    setDepth(0);
  }, []);

  const canUndo = enabled && depth > 0;

  useEffect(() => {
    if (!register) return undefined;
    register({ canUndo, onUndo: undo, label, depth });
    return () => register(null);
  }, [register, canUndo, undo, label, depth]);

  // The shell renders whichever Undo descriptor reaches it. Handing back a ready
  // capability keeps the tool call sites from each inventing a label and a
  // disabled rule for the same control.
  const capability = useMemo(
    () => ({ label: '↶ Undo', title: label, onAction: undo, disabled: !canUndo, studentState: true }),
    [label, undo, canUndo],
  );

  return { canUndo, undo, clear, depth, capability };
}
