// The question engine's side of the teacher signals
// (docs/platform/SHOWING_THE_PROCESS.md, section 7): it tells one tracker what
// happened on this question and hands the host each fact the tracker raises.
//
// Nothing here reaches the grade: the engine calls `attemptSubmitted` after
// the attempt has been handed to the host's own grading, and what it returns
// goes only to `onAttemptSignal`.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ATTEMPT_SIGNAL_KIND, createAttemptSignalTracker, exemptAttemptSignalKinds } from './attemptSignalFacts.js';

// An answer box names its part (MultiAnswerGrader's boxes, TableGrader's
// cells), and says when it takes words, not mathematics.
const BOX_SELECTOR = '[data-answer-box-index]';
const MATH_FIELD_SELECTOR = 'math-field';
const NONE_EXEMPT = new Set();

/**
 * Where a paste landed: the part's index, or null when it was not a math
 * answer box.
 *   - a marked answer box: its own index, unless the box takes words (an
 *     explanation is not a math box);
 *   - a math field outside any marked box: part 1, but only on a question
 *     that is answer boxes and nothing else (`answerBoxesOnly`). On a tool
 *     (Step Algebra's move boxes, a graph's entry) a typed or pasted value is
 *     one of the tool's own checked moves, not an answer.
 */
export const pastedPartIndex = (target, { answerBoxesOnly = false } = {}) => {
  if (!target || typeof target.closest !== 'function') return null;
  const box = target.closest(BOX_SELECTOR);
  if (box) {
    if (box.getAttribute?.('data-answer-box-kind') === 'text') return null;
    const index = Number(box.getAttribute?.('data-answer-box-index'));
    return Number.isInteger(index) && index >= 0 ? index : 0;
  }
  return answerBoxesOnly && target.closest(MATH_FIELD_SELECTOR) ? 0 : null;
};

/**
 * The facts to raise once saved work is known. `savedWork` (optional) answers
 * "is there saved work on this question the engine was not told of?": a
 * scratchpad saved before a reload, or on another visit. It is asked only
 * when "no tool work" is about to be said, and a read that fails counts as
 * work: that fact is never raised on a guess.
 */
export const factsAfterSavedWork = async (facts, savedWork = null) => {
  const claimsNoWork = facts.some((fact) => fact.kind === ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY);
  if (!claimsNoWork || typeof savedWork !== 'function') return facts;
  let found = true;
  try {
    found = Boolean(await savedWork());
  } catch {
    found = true;
  }
  return found ? facts.filter((fact) => fact.kind !== ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY) : facts;
};

/**
 * @param onAttemptSignal  the host's recorder, or null: then nothing is
 *                         watched (a preview, Recovery, My Math Path).
 * @param studentProfile   the student's support profile, for the exemptions.
 * @param answerState      the engine's answer state.
 * @param attemptNumber    the attempt now being worked on (1 for the first).
 * @param open             false once the question takes no more work.
 * @param answerBoxesOnly  the question is answer boxes and nothing else.
 * @param context          the host's own note of which question this is,
 *                         handed back with each fact as it was when the fact
 *                         happened (the student may have moved on by the time
 *                         a fact is raised).
 */
export function useAttemptSignals({ onAttemptSignal = null, studentProfile = null, answerState = null, attemptNumber = 1, open = true, answerBoxesOnly = false, context = null } = {}) {
  const enabled = typeof onAttemptSignal === 'function';
  const hostRef = useRef(onAttemptSignal);
  useEffect(() => { hostRef.current = onAttemptSignal; });
  const trackerRef = useRef(null);
  if (enabled && !trackerRef.current) trackerRef.current = createAttemptSignalTracker();
  // Read only where signals are recorded at all.
  const exempt = useMemo(() => (enabled ? exemptAttemptSignalKinds(studentProfile) : NONE_EXEMPT), [enabled, studentProfile]);
  const exemptRef = useRef(exempt);
  exemptRef.current = exempt;
  const attemptRef = useRef(attemptNumber);
  attemptRef.current = attemptNumber;
  const openRef = useRef(open);
  openRef.current = open;
  const boxesRef = useRef(answerBoxesOnly);
  boxesRef.current = answerBoxesOnly;
  const contextRef = useRef(context);
  contextRef.current = context;

  const raise = useCallback((facts, at) => {
    facts.filter((fact) => !exemptRef.current.has(fact.kind)).forEach((fact) => {
      try {
        hostRef.current?.(fact, at);
      } catch {
        // A recorder that fails is not the student's problem.
      }
    });
  }, []);

  useEffect(() => {
    if (enabled) trackerRef.current.noteAnswerState(answerState || {});
  }, [enabled, answerState]);

  const onPasteCapture = useCallback((event) => {
    if (!openRef.current || !trackerRef.current) return;
    const partIndex = pastedPartIndex(event?.target, { answerBoxesOnly: boxesRef.current });
    if (partIndex === null) return;
    // Where it landed, and nothing of what it was: the clipboard is not read.
    const fact = trackerRef.current.pasteFact({ partIndex, attemptNumber: attemptRef.current });
    if (fact) raise([fact], contextRef.current);
  }, [raise]);

  const attemptSubmitted = useCallback((attempt, { savedWork = null } = {}) => {
    if (!trackerRef.current) return;
    // Which question this was, as of now: the scratchpad read below can
    // return after the student has opened the next one.
    const at = contextRef.current;
    factsAfterSavedWork(trackerRef.current.attemptSubmitted(attempt), savedWork).then((facts) => raise(facts, at));
  }, [raise]);

  const noteToolWork = useCallback(() => { trackerRef.current?.noteToolWork(); }, []);

  return { onPasteCapture: enabled ? onPasteCapture : undefined, attemptSubmitted, noteToolWork };
}
