/*
 * WHAT A WRONG RADICAL-EQUATION SOLVE SAYS (walkthrough 2026-10-23, Solving
 * Radical Equations CW 1).
 *
 * Every miss got "Not yet — fix the steps marked below." over a ✓/✗ list. A
 * slip in step 1 (√(y − 2) = 4 for √(y − 2) − 1 = 5) marked steps 1, 2, 3 and
 * 5 wrong although the student squared and solved their own equation
 * correctly: each step is checked against the key, so one early slip crosses
 * out everything after it. The message names the first wrong step, the one
 * to fix first, in the order the steps are done. Read from the grader's parts;
 * it never states a value. Where the method is withheld (a DOL, quiz or test,
 * useMethodWithheld) it only points at the marks.
 */
const STEP_ORDER = ['isolate', 'raise', 'candidates', 'check', 'final'];

export const RADICAL_SOLVE_RETRY = 'Not yet. Fix the first step marked ✗ below; the steps after it follow from it.';

export const radicalSolveMissMessage = ({ parts = [], variable = 'x', methodWithheld = false } = {}) => {
  if (methodWithheld) return RADICAL_SOLVE_RETRY;
  const wrong = new Set(parts.filter((part) => part && part.isCorrect === false).map((part) => part.id));
  const first = STEP_ORDER.find((id) => wrong.has(id));
  const later = first ? STEP_ORDER.slice(STEP_ORDER.indexOf(first) + 1).some((id) => wrong.has(id)) : false;
  const then = later ? ' The steps after it follow from it, so fix this one first.' : '';
  switch (first) {
    case 'isolate': return `Start with step 1, isolating the radical: undo what is done outside it, in reverse order.${then}`;
    case 'raise': return `Check step 2: raise both sides to the root's index. The radical raised to its index is just what is under it.${then}`;
    case 'candidates': return `Check step 3: solve the raised equation for ${variable}. Every solution of it is a candidate.${then}`;
    case 'check': return `Check step 4: substitute each candidate into the ORIGINAL equation and compare the two sides.${then}`;
    case 'final': return 'Your steps are right. The solution is every candidate that solves the original equation; if none does, choose No real solution.';
    default: return RADICAL_SOLVE_RETRY;
  }
};
