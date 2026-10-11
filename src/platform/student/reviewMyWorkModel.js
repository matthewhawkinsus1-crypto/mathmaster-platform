import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { getIncludedQuestionIndices } from '../../assignmentLifecycle.js';

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
 * (`solutionSource` 'delivered', 'family' or 'assignment').
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
  // The assignment is closed: there is no "yet" (release-candidate QA m9).
  [REVIEW_OUTCOME.INCORRECT]: 'Not correct',
  [REVIEW_OUTCOME.NOT_ANSWERED]: 'Not answered',
  [REVIEW_OUTCOME.EXCUSED]: 'Excused',
});

export const NO_ANSWER_TEXT = 'No answer recorded';
export const RECORDED_WORK_TEXT = 'Your work on this question was a graph or a diagram, so it is not repeated here. It was saved with your answer.';
export const SOLUTION_UNAVAILABLE_TEXT = 'The worked solution for your version of this question is not available.';
export const LOAD_ERROR_TEXT = 'Your answers could not be loaded right now. Try again.';

// functions/lib/reviewMyWork.js SOLUTION_SOURCE, minus 'unavailable'.
const SOLUTION_SOURCES_SHOWN = new Set(['delivered', 'family', 'assignment']);

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

const primitiveText = (value) => (typeof value === 'string' ? value.trim()
  : typeof value === 'number' || typeof value === 'boolean' ? String(value) : null);

const textOf = (value) => {
  if (value === null || value === undefined) return '';
  const plain = primitiveText(value);
  if (plain !== null) return plain;
  // A list of plain values (a sequence's terms, a set): written as a list.
  if (Array.isArray(value) && value.length && value.every((entry) => primitiveText(entry) !== null)) {
    return value.map(primitiveText).filter(Boolean).join(', ');
  }
  // A wrapped plain value ({ value }, { text }, { latex }, { answer }).
  if (isObject(value)) {
    for (const key of ['text', 'value', 'latex', 'answer']) {
      const inner = primitiveText(value[key]);
      if (inner) return inner;
    }
  }
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

const promptText = (question) => {
  const text = typeof question?.prompt === 'string' ? question.prompt
    : typeof question?.question === 'string' ? question.question
      : typeof question?.title === 'string' ? question.title : '';
  return text.trim();
};

/*
 * The wording the student was shown. A delivered instance (generated, adaptive
 * or Question Family) is the only source of it when the server sent one: the
 * stored question is the TEMPLATE, with different values or placeholders, so
 * it is never used in that case. Without a delivered instance the server's
 * prompt comes first, then the stored question's.
 */
const rowPrompt = (row, storedQuestion) => {
  if (isObject(row?.deliveredQuestion)) return promptText(row.deliveredQuestion) || String(row.prompt || '').trim();
  return String(row?.prompt || '').trim() || promptText(storedQuestion);
};

/**
 * Merge the server's rows with the assignment's stored questions.
 * `result` is what loadMyReviewWork returned; anything else yields no rows.
 */
export const buildReviewMyWorkModel = ({ result = null, assignment = null } = {}) => {
  const rows = isObject(result) ? list(result.questions) : [];
  const stored = getStoredAssignmentQuestions(assignment || {});
  const included = getIncludedQuestionIndices(stored);
  /*
   * The number the student knows this question by: the server's stable
   * `number` (position among non-excluded questions), else the same position
   * computed from the stored questions — never the row's position in this
   * list, which shifts when rows (a withheld Warm-Up) are left out.
   */
  const questionNumber = (row, position) => {
    const fromServer = Number(row.number);
    if (Number.isInteger(fromServer) && fromServer > 0) return fromServer;
    const includedPosition = included.indexOf(Number(row.index));
    return includedPosition >= 0 ? includedPosition + 1 : position + 1;
  };
  const items = rows
    .filter((row) => isObject(row) && Number.isInteger(Number(row.index)))
    .map((row, position) => {
      const storedQuestion = stored[Number(row.index)] || null;
      // Fail closed: only a source the server named vouches for a solution.
      // A row with no source (or one this browser does not know) shows none,
      // rather than falling back to the stored template.
      const solutionAllowed = SOLUTION_SOURCES_SHOWN.has(row.solutionSource);
      const solutionQuestion = solutionAllowed
        ? (isObject(row.deliveredQuestion) ? row.deliveredQuestion : storedQuestion)
        : null;
      const outcome = Object.values(REVIEW_OUTCOME).includes(row.outcome) ? row.outcome : REVIEW_OUTCOME.NOT_ANSWERED;
      return {
        key: `${row.index}-${row.questionId || position}`,
        index: Number(row.index),
        number: questionNumber(row, position),
        section: sectionLabel(row, storedQuestion),
        prompt: rowPrompt(row, storedQuestion),
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
    // The server left the Warm-Up out because a teacher has reopened it.
    warmupWithheld: result?.warmupWithheld === true,
    assignmentLine: isObject(result?.assignmentChange)
      ? (assignmentReason ? `Your teacher changed this grade: ${assignmentReason}` : 'Your teacher changed this grade.')
      : null,
    items,
  };
};
