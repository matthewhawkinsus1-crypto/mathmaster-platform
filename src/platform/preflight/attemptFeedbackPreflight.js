/*
 * PRACTICE ITEMS WITH NO ATTEMPT FEEDBACK — a Pre-Flight WARNING, never a
 * block (student pass 3, HELP-2).
 *
 * While a question can still be answered, the miss box names no move that
 * yields the answer (genericMissChecks.js), so on an item with no authored
 * `attemptFeedback` a miss says only "Not quite… Focus on: …" until the item
 * closes. In the pass-3 sample 0 of 310 real items authored it. The student
 * can now ask "What might have gone wrong?" (a hint rung), but one or two
 * sentences written by the teacher for the next try say more.
 *
 * ADVISORY, ON PURPOSE. Any warning in the readiness diagnostics turns an
 * assignment "Needs Review" and moves it out of the normal library
 * (assignmentAuthoringState.js). With nearly every Practice item lacking
 * attempt feedback, that would demote nearly every assignment that has a
 * Practice section. So these warnings are shown in their own Pre-Flight panel
 * and are not readiness diagnostics.
 */
import { buildPrivateSupport } from '../../../functions/shared/pathSolutionSupport.mjs';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);

const PRACTICE_ROLES = new Set(['practice']);

/** Does this question carry at least one authored attempt-feedback line? */
export const hasAttemptFeedback = (question) => {
  try {
    return asArray(buildPrivateSupport(question || {})?.attemptFeedback).some((entry) => clean(entry));
  } catch {
    return asArray(question?.attemptFeedback).some((entry) => clean(typeof entry === 'string' ? entry : entry?.text || entry?.message));
  }
};

export const auditAssignmentAttemptFeedback = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    if (!question || typeof question !== 'object') return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    if (!PRACTICE_ROLES.has(clean(question.activityRole).toLowerCase())) return;
    if (hasAttemptFeedback(question)) return;
    warnings.push(`Question ${index + 1} is a Practice item with no attempt feedback (attemptFeedback). While it can still be answered, a miss says only "Not quite" and what to focus on; a sentence or two for the next try tells the student what to check without giving the answer.`);
  });
  return { warnings };
};

export default auditAssignmentAttemptFeedback;
