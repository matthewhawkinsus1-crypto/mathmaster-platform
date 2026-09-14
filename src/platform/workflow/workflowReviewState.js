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

const safeJson = (value) => {
  try { return JSON.stringify(value ?? null); } catch { return String(value ?? ''); }
};

export const parseSubmittedWorkflowResponses = (responseKey) => {
  if (typeof responseKey !== 'string' || !responseKey.trim()) return {};
  try {
    const parsed = JSON.parse(responseKey);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const buildWorkflowReviewState = ({
  stages = [],
  responses = {},
  review = null,
} = {}) => {
  const submitted = parseSubmittedWorkflowResponses(review?.responseKey);
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

    if (safeJson(responses?.[id]) !== safeJson(submitted[id])) {
      return { id, index, status: 'changed', part: partsById.get(id) || null };
    }

    const part = partsById.get(id);
    if (!part || part.graded === false) {
      return { id, index, status: 'reviewed', part: part || null };
    }

    return {
      id,
      index,
      status: part.isCorrect === true ? 'correct' : 'incorrect',
      part,
    };
  });
};

export const firstIncorrectWorkflowIndex = (reviewState = []) => (
  (Array.isArray(reviewState) ? reviewState : []).find((entry) => entry?.status === 'incorrect')?.index ?? -1
);
