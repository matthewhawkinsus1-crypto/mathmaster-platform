import { useEffect, useRef, useState } from 'react';
import { editorPreflightFindings } from '../../platform/preflight/questionPreflightFindings.js';

/*
 * PRE-FLIGHT'S FINDINGS IN THE QUESTION EDITOR, KEPT UP TO DATE, NEVER IN THE WAY.
 *
 * The findings come from the whole assignment's Pre-Flight model, which costs
 * tens of milliseconds a run on a desktop and several times that on a
 * Chromebook for a large assignment (docs/handoffs/NOVEMBER_BUILD_2026-11.md,
 * section 2). Run on every change, a teacher typing a grade weight would pay
 * that on every keystroke. So it runs just after the editor opens, and then
 * only once the questions have stopped changing for
 * PREFLIGHT_FINDINGS_DELAY_MS. Typing the title or a repair request changes
 * no question and runs nothing. The findings already shown stay until the new
 * ones are ready, so nothing on screen jumps while the teacher types, and
 * nothing is announced.
 *
 * The findings live in a small store the regions subscribe to
 * (PreflightFindings.jsx), not in the editor's state: a keystroke draws the
 * editor once, as it always did, and new findings draw only the regions whose
 * findings changed, never the editor's other cards.
 */
export const PREFLIGHT_FINDINGS_DELAY_MS = 500;

const sameFindings = (before, after) => Boolean(before && after)
  && before.warnings.length === after.warnings.length
  && before.notes.length === after.notes.length
  && before.warnings.every((text, index) => text === after.warnings[index])
  && before.notes.every((text, index) => text === after.notes[index]);

// Each question's findings keep the object they had when nothing in them
// changed, so the region drawn from them is not drawn again.
const keepUnchanged = (previous, next) => {
  if (!previous || !next) return next;
  next.byQuestionId.forEach((entry, questionId) => {
    const before = previous.byQuestionId.get(questionId);
    if (sameFindings(before, entry)) next.byQuestionId.set(questionId, before);
  });
  if (sameFindings(previous.assignment, next.assignment)) next.assignment = previous.assignment;
  return next;
};

/**
 * { snapshot, subscribe, publish }: `snapshot()` is { findings, basis }, the
 * findings and the { source, questions, classSize } they were computed for.
 */
export const createPreflightFindingsStore = () => {
  let snapshot = { findings: null, basis: null };
  const listeners = new Set();
  return {
    snapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (findings, basis) => {
      snapshot = { findings: keepUnchanged(snapshot.findings, findings), basis };
      listeners.forEach((listener) => listener());
    },
  };
};

export default function useQuestionPreflightFindings({ source, questions, classSize = null, delayMs = PREFLIGHT_FINDINGS_DELAY_MS }) {
  const [store] = useState(createPreflightFindingsStore);
  // The first run waits for nothing: the editor has just opened.
  const ranRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      ranRef.current = true;
      let findings = null;
      try {
        findings = editorPreflightFindings({ source, questions, classSize });
      } catch {
        // A candidate the model cannot read at all: Save says why.
        findings = null;
      }
      store.publish(findings, { source, questions, classSize });
    }, ranRef.current ? delayMs : 0);
    return () => clearTimeout(timer);
  }, [store, source, questions, classSize, delayMs]);
  return store;
}
