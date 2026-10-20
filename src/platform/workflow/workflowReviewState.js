// Visual review state for composed multi-step questions.
//
// "Answered" and "correct" are deliberately different states. A response may
// unlock the next step before the student submits the whole question, but the UI
// must not imply that the response has been checked until an actual submission
// has been graded.
//
// After a submission, each stage keeps the verdict for the exact response that
// was submitted. If the student edits that stage, the old verdict becomes
// "changed" until the next whole-question check.

import { hasStageResponse } from './questionWorkflow.js';
import { composedWorkflowStageWork } from '../../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { boundToolWork } from '../../../functions/shared/serverGrading/toolResponseContract.mjs';
import { stableStringify } from '../../../functions/shared/idUtils.mjs';

const safeJson = (value) => {
  try { return JSON.stringify(value ?? null); } catch { return String(value ?? ''); }
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/*
 * A submitted responseKey comes in two shapes. A question marked by the shared
 * grader submits its canonical work, `{"responses":{...}}` — each stage's
 * response as student work, bounded and key-sorted (composedWorkflowContract
 * .mjs). A question still marked on the device submits the raw map of stage
 * responses. Both are read; each is compared in its own form.
 */
const readSubmittedWorkflow = (responseKey) => {
  if (typeof responseKey !== 'string' || !responseKey.trim()) return { responses: {}, canonical: false };
  try {
    const parsed = JSON.parse(responseKey);
    if (!isPlainObject(parsed)) return { responses: {}, canonical: false };
    const keys = Object.keys(parsed);
    if (keys.length === 1 && keys[0] === 'responses' && isPlainObject(parsed.responses)) {
      return { responses: parsed.responses, canonical: true };
    }
    return { responses: parsed, canonical: false };
  } catch {
    return { responses: {}, canonical: false };
  }
};

export const parseSubmittedWorkflowResponses = (responseKey) => readSubmittedWorkflow(responseKey).responses;

// One stage's response in the form the shared grader received it, so a live
// response compares equal to its own submitted copy.
const canonicalStageJson = (value) => {
  try {
    return stableStringify(boundToolWork(composedWorkflowStageWork(value ?? null)).work);
  } catch {
    return safeJson(value);
  }
};

export const buildWorkflowReviewState = ({
  stages = [],
  responses = {},
  review = null,
} = {}) => {
  const { responses: submitted, canonical } = readSubmittedWorkflow(review?.responseKey);
  const sameResponse = (live, sent) => (canonical
    ? canonicalStageJson(live) === canonicalStageJson(sent)
    : safeJson(live) === safeJson(sent));
  const partsById = new Map(
    (Array.isArray(review?.parts) ? review.parts : [])
      .filter((part) => part?.id)
      .map((part) => [String(part.id), part]),
  );

  return (Array.isArray(stages) ? stages : []).map((stage, index) => {
    const id = String(stage?.id || '');
    const answered = Boolean(id) && hasStageResponse(responses?.[id]);
    if (!answered) {
      return { id, index, status: 'unanswered', part: partsById.get(id) || null };
    }

    const submittedOwnResponse = Object.prototype.hasOwnProperty.call(submitted, id);
    if (!review || !submittedOwnResponse) {
      return { id, index, status: 'draft', part: partsById.get(id) || null };
    }

    if (!sameResponse(responses?.[id], submitted[id])) {
      return { id, index, status: 'changed', part: partsById.get(id) || null };
    }

    const part = partsById.get(id);
    if (!part || part.graded === false) {
      return { id, index, status: 'reviewed', part: part || null };
    }

    // Why it missed (student pass 3, wave 7): only for a stage marked wrong
    // on the exact response that was checked. A review exists only where the
    // activity shows outcome feedback (QuestionEngine passes none on an exit
    // ticket, quiz or test before release), so neither does a reason.
    const reason = part.isCorrect === true ? '' : String(review?.stageReasons?.[id] || '').trim();
    return {
      id,
      index,
      status: part.isCorrect === true ? 'correct' : 'incorrect',
      part,
      ...(reason ? { reason } : {}),
    };
  });
};

export const firstIncorrectWorkflowIndex = (reviewState = []) => (
  (Array.isArray(reviewState) ? reviewState : []).find((entry) => entry?.status === 'incorrect')?.index ?? -1
);

/*
 * The outcome box's line about the red steps, completed when the steps say
 * why (wave 7): " Each one says what to check." only when every red step
 * shows its reason, " Some of them say what to check." when some do (a
 * feature step never says why, review B1), and nothing when none does. Read
 * from the same review the steps are drawn from.
 */
export const composedReasonsNote = (review) => {
  const failed = (Array.isArray(review?.parts) ? review.parts : [])
    .filter((part) => part?.id && part.graded !== false && part.isCorrect !== true);
  if (!failed.length) return '';
  const reasons = review?.stageReasons || {};
  const explained = failed.filter((part) => String(reasons[part.id] || '').trim()).length;
  if (!explained) return '';
  return explained === failed.length ? ' Each one says what to check.' : ' Some of them say what to check.';
};
