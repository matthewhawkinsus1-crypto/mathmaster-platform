import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';

/*
 * REVIEW MY WORK — what the student sees for each question of a closed
 * assignment: their own answer, how it went, the teacher's reason when a grade
 * was changed, and the question whose worked solution to show.
 *
 * Every row comes from the server (functions/lib/reviewMyWork.js, callable
 * loadMyReviewWork), which alone decides whether this assignment is closed for
 * this student and its feedback released. The browser never builds a row from
 * its own copy of the assignment: with no server rows there is nothing to show,
 * so no solution can appear while the work can still be answered. The stored
 * question is used only to fill in a solution the server vouched for
 * (`solutionSource` other than 'unavailable').
 */

export const REVIEW_OUTCOME = Object.freeze({
  CORRECT: 'correct',
  PARTIAL: 'partial',
  INCORRECT: 'incorrect',
  NOT_ANSWERED: 'notAnswered',
  EXCUSED: 'excused',
});

// Plain, short, never alarming.
export const OUTCOME_LABEL = Object.freeze({
  [REVIEW_OUTCOME.CORRECT]: 'Correct',
  [REVIEW_OUTCOME.PARTIAL]: 'Partly correct',
  [REVIEW_OUTCOME.INCORRECT]: 'Not correct yet',
  [REVIEW_OUTCOME.NOT_ANSWERED]: 'Not answered',
  [REVIEW_OUTCOME.EXCUSED]: 'Excused',
});

export const NO_ANSWER_TEXT = 'No answer recorded';
export const RECORDED_WORK_TEXT = 'Your work on this question was saved, but it cannot be shown as text here.';
export const SOLUTION_UNAVAILABLE_TEXT = 'The worked solution for your version of this question is not available.';
export const LOAD_ERROR_TEXT = 'Your answers could not be loaded right now. Try again.';

const SECTION_ROLE_LABEL = Object.freeze({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
  quiz: 'Quiz',
  review: 'Review',
  test: 'Test',
});

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** True when a typed answer should be drawn as mathematics rather than plain text. */
export const looksLikeMath = (text) => {
  const value = String(text ?? '').trim();
  if (!value) return false;
  if (value.includes('$')) return false; // already delimited prose: MathText splits it itself
  return /\\[A-Za-z]+|[\^_{}]|\d\s*\/\s*\d|[≤≥≠√π]/.test(value);
};

const textOf = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null; // structured (a graph, a sort): not text
};

const answerLine = (value) => {
  const text = textOf(value);
  if (text === null) return { text: RECORDED_WORK_TEXT, math: false, structured: true };
  if (!text) return { text: NO_ANSWER_TEXT, math: false, empty: true };
  return { text, math: looksLikeMath(text) };
};

const fieldLabel = (question, id, position) => {
  const field = list(question?.answerFields).find((entry) => String(entry?.id) === String(id));
  const label = String(field?.label || field?.prompt || '').trim();
  return label || `Part ${position + 1}`;
};

/**
 * The student's answer for display:
 *   { kind: 'none', text }                       nothing recorded
 *   { kind: 'value', text, math, structured? }   one answer
 *   { kind: 'fields', items: [{ id, label, text, math }] }
 */
export const formatSubmittedAnswer = (response, question = null) => {
  if (!isObject(response)) return { kind: 'none', text: NO_ANSWER_TEXT };
  const fields = list(response.fields).filter((field) => isObject(field) && String(field.id ?? '').trim());
  if (fields.length) {
    const items = fields.map((field, position) => ({
      id: String(field.id),
      label: fieldLabel(question, field.id, position),
      ...answerLine(field.value),
    }));
    if (items.every((item) => item.empty)) return { kind: 'none', text: NO_ANSWER_TEXT };
    return { kind: 'fields', items };
  }
  const line = answerLine(response.value);
  if (line.empty) return { kind: 'none', text: NO_ANSWER_TEXT };
  return { kind: 'value', ...line };
};

export const teacherReasonLine = (row = {}) => {
  if (row?.teacherChanged !== true) return null;
  const reason = String(row.teacherReason || '').trim();
  return reason ? `Your teacher changed this grade: ${reason}` : 'Your teacher changed this grade.';
};

const sectionLabel = (row, stored) => {
  const title = String(row?.sectionTitle || stored?.sectionTitle || '').trim();
  if (title) return title;
  const role = String(row?.sectionRole || stored?.activityRole || '').trim().toLowerCase();
  return SECTION_ROLE_LABEL[role] || '';
};

/**
 * Merge the server's rows with the assignment's stored questions.
 * `result` is what loadMyReviewWork returned; anything else yields no rows.
 */
export const buildReviewMyWorkModel = ({ result = null, assignment = null } = {}) => {
  const rows = isObject(result) ? list(result.questions) : [];
  const stored = getStoredAssignmentQuestions(assignment || {});
  const items = rows
    .filter((row) => isObject(row) && Number.isInteger(Number(row.index)))
    .map((row, position) => {
      const storedQuestion = stored[Number(row.index)] || null;
      const solutionAllowed = row.solutionSource !== 'unavailable';
      const solutionQuestion = solutionAllowed
        ? (isObject(row.deliveredQuestion) ? row.deliveredQuestion : storedQuestion)
        : null;
      const outcome = Object.values(REVIEW_OUTCOME).includes(row.outcome) ? row.outcome : REVIEW_OUTCOME.NOT_ANSWERED;
      return {
        key: `${row.index}-${row.questionId || position}`,
        index: Number(row.index),
        number: position + 1,
        section: sectionLabel(row, storedQuestion),
        prompt: String(row.prompt || storedQuestion?.prompt || '').trim(),
        outcome,
        outcomeLabel: OUTCOME_LABEL[outcome],
        credit: Number.isFinite(Number(row.credit)) && row.credit !== null ? Number(row.credit) : null,
        answer: formatSubmittedAnswer(row.submittedResponse, solutionQuestion || storedQuestion),
        solutionQuestion,
        solutionUnavailable: !solutionQuestion,
        teacherLine: teacherReasonLine(row),
      };
    });
  const assignmentReason = String(result?.assignmentChange?.reason || '').trim();
  return {
    title: String(result?.title || assignment?.title || '').trim(),
    excused: result?.excused === true,
    assignmentLine: isObject(result?.assignmentChange)
      ? (assignmentReason ? `Your teacher changed this grade: ${assignmentReason}` : 'Your teacher changed this grade.')
      : null,
    items,
  };
};
