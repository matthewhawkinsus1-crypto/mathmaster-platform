/*
 * THE TWO DEFECTIVE DIGITAL SAT FACTOR DRAWS (GR23; H-102, D22): THE DECISIONS.
 *
 * Two Digital SAT templates offered a true factor as a "wrong" option on some
 * draws, until 08964f1c (2026-10-15) added a constraint to each
 * (docs/handoffs/STUDENT_PUSH_O2_TESTPREP_CONTENT_FIXES.md, "Stored work"):
 *
 *   mm_sat_A2_7D_factor_from_roots_cubic_v21: zeros r1, r2, r3; the distractor
 *     x − (r1 + 1) is the factor x − 5 when r1 = 4 and r2 = 5;
 *   mm_sat_A2_7D_challenge_quartic_factor_structure_v21:
 *     P(x) = (x² − a²)(x² + bx + c); the distractor x + (a + 1) is a factor
 *     when (a + 1)² − b(a + 1) + c = 0 (eight combinations).
 *
 * A student who chose that option was marked wrong for a right answer. The
 * owner chose to re-grade those answers as right (decision D22). This module
 * decides it, by the factor theorem, from what the student SAW: the prompt
 * with its numbers and the label of the option they chose. x − k is a factor
 * exactly when P(k) = 0, so no answer key, stored or current, is consulted,
 * and an option that is not a factor is never raised. Pure: no Firestore, no
 * clock. tests/platform/satFactorRegrade.test.mjs proves it over every
 * parameter combination of both templates as they were before the fix.
 *
 * Read by scripts/report-sat-factor-regrade.mjs (read-only: My Math Path
 * recaps and classroom attempts) and, for the classroom attempts it lists, by
 * scripts/apply-upward-regrade.mjs (the D8 upward-only step, through
 * scripts/lib/upwardRegrade.mjs).
 */
import { gradedQuestionFor } from './classroomRegradePlan.mjs';

export const SAT_FACTOR_TEMPLATES = Object.freeze({
  mm_sat_A2_7D_factor_from_roots_cubic_v21: Object.freeze({
    shape: 'cubic',
    fixConstraint: 'r1p!=r2',
    defect: 'r1 = 4 and r2 = 5: the option x − 5 is a factor',
  }),
  mm_sat_A2_7D_challenge_quartic_factor_structure_v21: Object.freeze({
    shape: 'quartic',
    fixConstraint: '(a+1)*(a+1)-b*(a+1)+c!=0',
    defect: '(a + 1)² − b(a + 1) + c = 0: the option x + (a + 1) is a factor',
  }),
});
export const SAT_FACTOR_TEMPLATE_IDS = Object.freeze(Object.keys(SAT_FACTOR_TEMPLATES));
export const FIXED_BY = '08964f1c (2026-10-15)';
export const isSatFactorTemplateId = (id) => SAT_FACTOR_TEMPLATE_IDS.includes(String(id ?? '').trim());

export const FACTOR_CLASS = Object.freeze({
  WOULD_BE_CORRECT: 'would-be-correct',
  STILL_WRONG: 'still-wrong',
  ALREADY_CORRECT: 'already-correct',
  UNDETERMINABLE: 'undeterminable',
});
export const FACTOR_REASON = Object.freeze({
  PROMPT_NOT_RECOGNISED: 'prompt-not-recognised',
  CHOICE_NOT_RECORDED: 'chosen-option-not-recorded',
  CHOICE_NOT_READ: 'chosen-option-not-read',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
// The text as plain ASCII: no $…$, no \left/\right, no spaces, an ASCII minus.
const plain = (value) => String(value ?? '').replace(/\$/g, '').replace(/\\left|\\right/g, '').replace(/[−–—]/g, '-').replace(/\\[,;!]|\s+/g, '');

/**
 * The polynomial a prompt of either template describes, as the student saw
 * it: `{ shape, valueAt(k) }`, or null for any other prompt.
 */
export const polynomialOfPrompt = (prompt) => {
  const text = plain(prompt);
  const cubic = /haszeros(-?\d+),(-?\d+),and(-?\d+)\./.exec(text);
  if (cubic) {
    const zeros = cubic.slice(1, 4).map(Number);
    return { shape: 'cubic', zeros, valueAt: (k) => zeros.reduce((product, zero) => product * (k - zero), 1) };
  }
  const quartic = /P\(x\)=\(x\^\{?2\}?-(\d+)\)\(x\^\{?2\}?\+(\d+)x\+(\d+)\)/.exec(text);
  if (quartic) {
    const [square, b, c] = quartic.slice(1, 4).map(Number);
    return { shape: 'quartic', square, b, c, valueAt: (k) => (k * k - square) * (k * k + b * k + c) };
  }
  return null;
};

/** The zero of a linear factor as an option shows it: x − 5 → 5, x + 3 → −3; null otherwise. */
export const linearFactorZero = (label) => {
  const match = /^x([+-])\(?(-?\d+)\)?$/.exec(plain(label));
  if (!match) return null;
  const value = Number(match[2]);
  return match[1] === '-' ? value : -value;
};

/**
 * One recorded answer: `{ classification, reason, zero }`. `chosen` is the
 * label of the option the student picked; `recordedCorrect` the verdict on
 * record.
 */
export const classifyFactorAnswer = ({ prompt, chosen, recordedCorrect }) => {
  if (recordedCorrect === true) return { classification: FACTOR_CLASS.ALREADY_CORRECT, reason: null, zero: null };
  const polynomial = polynomialOfPrompt(prompt);
  if (!polynomial) return { classification: FACTOR_CLASS.UNDETERMINABLE, reason: FACTOR_REASON.PROMPT_NOT_RECOGNISED, zero: null };
  if (chosen === undefined || chosen === null || String(chosen).trim() === '') {
    return { classification: FACTOR_CLASS.UNDETERMINABLE, reason: FACTOR_REASON.CHOICE_NOT_RECORDED, zero: null };
  }
  const zero = linearFactorZero(chosen);
  // Every option of both templates is x ± k; one this cannot read is left
  // undecided, never called wrong.
  if (zero === null) return { classification: FACTOR_CLASS.UNDETERMINABLE, reason: FACTOR_REASON.CHOICE_NOT_READ, zero: null };
  return {
    classification: polynomial.valueAt(zero) === 0 ? FACTOR_CLASS.WOULD_BE_CORRECT : FACTOR_CLASS.STILL_WRONG,
    reason: null,
    zero,
  };
};

/**
 * A My Math Path recap entry (functions/shared/pathSessionRecap.mjs, stored
 * on pathSubmissions/{id}.recapJson for an item's FINAL attempt): the prompt
 * as shown, and the chosen option as its label (an id that matched no option
 * was not recorded).
 */
export const classifyPathRecapEntry = (entry) => {
  const chosen = list(entry?.response?.entries).find((item) => typeof item?.value === 'string')?.value ?? null;
  return {
    ...classifyFactorAnswer({ prompt: entry?.question?.prompt, chosen, recordedCorrect: entry?.grading?.isCorrect === true }),
    chosen,
  };
};

/** Is this assignment question one of the two templates (as the audited bank placed it)? */
export const satFactorTemplateOfQuestion = (question) => {
  const ids = [question?.ccmrSource?.documentId, question?.questionId, question?.sourceQuestionId];
  return ids.map((id) => String(id ?? '').trim()).find(isSatFactorTemplateId) || null;
};

/** A stored copy of a template made before the fix can still serve the defective draws. */
export const servesDefectiveDraws = (question) => {
  const template = satFactorTemplateOfQuestion(question);
  if (!template) return false;
  const constraints = list(question?.generator?.constraints).map((constraint) => plain(constraint));
  return !constraints.includes(plain(SAT_FACTOR_TEMPLATES[template].fixConstraint));
};

const submittedValue = (submitted, fieldId) => {
  if (!isObject(submitted)) return null;
  if (submitted.kind === 'fields') {
    const fields = list(submitted.fields);
    const field = fields.find((entry) => String(entry?.id) === String(fieldId)) || (fields.length === 1 ? fields[0] : null);
    return field?.value ?? null;
  }
  return submitted.value ?? null;
};

const optionLabel = (option) => (isObject(option) ? option.label ?? option.text ?? option.value ?? option.id : option);

/*
 * A classroom attempt, judged by the factor theorem on the instance the
 * student was served (rebuilt as the platform's replay rebuilds it) and the
 * option the evidence recorded. It answers in the shape of
 * responseInspector.replayStoredResponse, so the D8 upward planner
 * (scripts/lib/upwardRegrade.mjs) can take it in place of the replay: an
 * option that is a factor is right (100), any other option is not.
 */
export const judgeClassroomFactorAttempt = ({ question, record, gradingEvidence, assignment, questionIndex, studentId, classId } = {}) => {
  if (!satFactorTemplateOfQuestion(question)) return { available: false, adapter: 'sat-factor-theorem', reason: 'not-a-sat-factor-question' };
  const submitted = gradingEvidence?.submittedResponse;
  if (!submitted) return { available: false, adapter: 'sat-factor-theorem', reason: 'no-submitted-response' };
  const graded = gradedQuestionFor({ question, record, evidence: gradingEvidence, assignment, questionIndex, studentId, classId });
  if (!graded.question) return { available: false, adapter: 'sat-factor-theorem', reason: 'served-instance-not-rebuilt' };
  const fields = list(graded.question.answerFields);
  const field = fields.find((entry) => String(entry?.inputProfile || entry?.type || '').toLowerCase() === 'choice') || fields[0] || null;
  const raw = submittedValue(submitted, field?.id ?? 'answer');
  const options = list(field?.options).map(optionLabel).map((label) => String(label ?? ''));
  // The value a choice field records is the option's text; an id or index names one.
  const chosen = options.find((label) => plain(label) === plain(raw))
    ?? options[Number.isInteger(Number(raw)) ? Number(raw) : -1]
    ?? (raw === null ? null : String(raw));
  const decision = classifyFactorAnswer({ prompt: graded.question.prompt, chosen, recordedCorrect: false });
  if (decision.classification === FACTOR_CLASS.UNDETERMINABLE) {
    return { available: false, adapter: 'sat-factor-theorem', reason: decision.reason };
  }
  const right = decision.classification === FACTOR_CLASS.WOULD_BE_CORRECT;
  return {
    available: true,
    adapter: 'sat-factor-theorem',
    questionSource: graded.source,
    originalScore: Number.isFinite(Number(gradingEvidence.automaticScore)) ? Number(gradingEvidence.automaticScore) : null,
    currentResult: { isCorrect: right, chosen, zero: decision.zero },
    currentScore: right ? 100 : 0,
  };
};
