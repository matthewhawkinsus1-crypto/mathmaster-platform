// The question engine's side of the teacher signals
// (docs/platform/SHOWING_THE_PROCESS.md, section 7): it tells one tracker what
// happened on this question and hands the host each fact the tracker raises.
//
// Nothing here reaches the grade: the engine calls `attemptSubmitted` after
// the attempt has been handed to the host's own grading, and what it returns
// goes only to `onAttemptSignal`.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createAttemptSignalTracker, exemptAttemptSignalKinds } from './attemptSignalFacts.js';

// A math answer field: the math box itself, or a plain box inside a part.
const MATH_FIELD_SELECTOR = 'math-field';
// Each answer box names its part (MultiAnswerGrader fieldBox).
const PART_SELECTOR = '[data-answer-box-index]';
const PLAIN_FIELD_SELECTOR = 'input, textarea';
const NONE_EXEMPT = new Set();

/** Where a paste landed: the part's index, or null when it was not an answer field. */
export const pastedPartIndex = (target) => {
  if (!target || typeof target.closest !== 'function') return null;
  const part = target.closest(PART_SELECTOR);
  const mathField = target.closest(MATH_FIELD_SELECTOR);
  if (!mathField && !(part && target.closest(PLAIN_FIELD_SELECTOR))) return null;
  const index = Number(part?.getAttribute?.('data-answer-box-index'));
  return Number.isInteger(index) && index >= 0 ? index : 0;
};

/**
 * @param onAttemptSignal  the host's recorder, or null: then nothing is
 *                         watched (a preview, Recovery, My Math Path).
 * @param studentProfile   the student's support profile, for the exemptions.
 * @param answerState      the engine's answer state.
 * @param attemptNumber    the attempt now being worked on (1 for the first).
 * @param open             false once the question takes no more work.
 */
export function useAttemptSignals({ onAttemptSignal = null, studentProfile = null, answerState = null, attemptNumber = 1, open = true } = {}) {
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

  const raise = useCallback((facts) => {
    facts.filter((fact) => !exemptRef.current.has(fact.kind)).forEach((fact) => {
      try {
        hostRef.current?.(fact);
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
    const partIndex = pastedPartIndex(event?.target);
    if (partIndex === null) return;
    // Where it landed, and nothing of what it was: the clipboard is not read.
    raise([trackerRef.current.pasteFact({ partIndex, attemptNumber: attemptRef.current })]);
  }, [raise]);

  const attemptSubmitted = useCallback((attempt) => {
    if (trackerRef.current) raise(trackerRef.current.attemptSubmitted(attempt));
  }, [raise]);

  const noteToolWork = useCallback(() => { trackerRef.current?.noteToolWork(); }, []);

  return { onPasteCapture: enabled ? onPasteCapture : undefined, attemptSubmitted, noteToolWork };
}
