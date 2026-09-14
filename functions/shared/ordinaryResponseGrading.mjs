/*
 * THE ORDINARY MATHMASTER GRADING CONTRACT.
 *
 * One definition of "is this student response correct", used by three callers:
 *
 *   1. the browser grader components, while the student works;
 *   2. the Cloud Functions deadline finalizer, with no browser open;
 *   3. the tests.
 *
 * That shared-ness is the whole point. A response checkpoint carries the
 * student's RAW response and nothing about correctness, so the only thing that
 * can make a deadline auto-submit agree with a manual Submit is both of them
 * running this file against the same authoritative question.
 *
 * NOTHING HERE MAY READ A CLIENT VERDICT. Every function takes the authored
 * question (which holds the answer key) and the student's raw response. If a
 * caller has an `isCorrect` in hand, it is an output of this module or it is
 * not authoritative.
 */
import {
  compareMathAnswer,
  compareOrderedPair,
  matchesAnyAnswer,
  matchesFieldAnswer,
  parseOrderedPair,
} from './answerUtils.mjs';

const text = (value) => String(value ?? '');
const filled = (value) => text(value).trim() !== '';
const list = (value) => (Array.isArray(value) ? value : []);

/*
 * WHICH QUESTIONS THE SERVER CAN MARK WITHOUT THE BROWSER.
 *
 * A deadline finalizer has the STORED question, not the question the student
 * actually saw. Those are the same document only while delivery is an identity
 * transform. They stop being the same as soon as the question is generated,
 * has variants to choose between, or carries auto-differentiation band
 * profiles that can replace the answer key — so those are excluded rather than
 * guessed at. See docs/handoffs/RESPONSE_CHECKPOINT_COMPATIBILITY.md.
 */
export const SERVER_GRADEABLE_QUESTION_TYPES = Object.freeze([
  'literal',
  'multiAnswer',
  'orderedPair',
  'system',
  'table',
]);

/** Types this module can mark at all, including ones only the browser uses. */
export const ORDINARY_GRADEABLE_QUESTION_TYPES = Object.freeze([
  ...SERVER_GRADEABLE_QUESTION_TYPES,
  'fraction',
  'numberLine',
]);

const hasAnswerKey = (question = {}) => {
  switch (question?.type) {
    case 'literal':
      return list(question.acceptedAnswers).length > 0;
    case 'multiAnswer':
      return list(question.answerFields).some((field) => field?.id);
    case 'orderedPair':
      return Array.isArray(question.answer || question.solution);
    case 'system':
      return Array.isArray(question.solution);
    case 'table':
      return Object.keys(question?.table?.answers || {}).length > 0;
    default:
      return false;
  }
};

/**
 * Can the deadline finalizer mark this authored question on the server?
 *
 * Fails closed with a machine-readable reason, which the checkpoint writer
 * records and the compatibility matrix documents.
 */
export const serverGradingSupport = (question) => {
  if (!question || typeof question !== 'object') return { supported: false, reason: 'missing-question' };
  if (question.secure === true) return { supported: false, reason: 'secure-question' };
  if (question.teacherExcluded === true) return { supported: false, reason: 'teacher-excluded' };
  const type = text(question.type);
  if (!SERVER_GRADEABLE_QUESTION_TYPES.includes(type)) return { supported: false, reason: `unsupported-type:${type || 'unknown'}` };
  // A generated question is instantiated per student from a seed the server
  // does not re-run. Marking the template against an instance answer is worse
  // than not marking it at all.
  if (question.generator && typeof question.generator === 'object') return { supported: false, reason: 'generated-question' };
  if (list(question.variants).length > 0) return { supported: false, reason: 'variant-selection' };
  // `auto` differentiation swaps in a band profile that may carry its own
  // answer key, so the stored question is not the delivered question.
  if (text(question?.differentiation?.mode) === 'auto') return { supported: false, reason: 'adaptive-band-profile' };
  if (!hasAnswerKey(question)) return { supported: false, reason: 'no-answer-key' };
  return { supported: true, reason: null };
};

/* ---------------------------------------------------------------------------
 * Per-type contracts. Each takes the authored question and the raw response,
 * and returns the same shape the runtime answer state uses.
 * ------------------------------------------------------------------------- */

export const gradeLiteralResponse = (question = {}, rawAnswer) => {
  const answer = text(rawAnswer);
  const accepted = list(question.acceptedAnswers);
  const isComplete = answer.trim() !== '';
  const isCorrect = isComplete && matchesAnyAnswer(answer, accepted);
  return {
    isComplete,
    isCorrect,
    parts: [{
      id: 'literal',
      label: `Expression for ${question.solveFor}`,
      isComplete,
      isCorrect,
      response: answer,
    }],
  };
};

export const gradeFractionResponse = (question = {}, rawAnswer) => {
  const answer = text(rawAnswer);
  const expectedLatex = `\\frac{${question.ansNum}}{${question.ansDen}}`;
  const isComplete = answer !== '';
  const isCorrect = isComplete && compareMathAnswer(answer, expectedLatex);
  return {
    isComplete,
    isCorrect,
    parts: [{ id: 'fraction', label: 'Fraction answer', isComplete, isCorrect, response: answer }],
  };
};

export const gradeOrderedPairResponse = (question = {}, rawAnswer) => {
  const expectedPair = question.answer || question.solution;
  const parsed = parseOrderedPair(rawAnswer);
  const isComplete = Boolean(parsed);
  const xCorrect = Boolean(parsed) && Math.abs(parsed[0] - Number(expectedPair?.[0])) <= 1e-9;
  const yCorrect = Boolean(parsed) && Math.abs(parsed[1] - Number(expectedPair?.[1])) <= 1e-9;
  const isCorrect = compareOrderedPair(rawAnswer, expectedPair);
  return {
    isComplete,
    isCorrect,
    parsed,
    expectedPair,
    parts: [
      { id: 'ordered-x', label: 'x-coordinate', isComplete, isCorrect: xCorrect, response: parsed?.[0] ?? text(rawAnswer) },
      { id: 'ordered-y', label: 'y-coordinate', isComplete, isCorrect: yCorrect, response: parsed?.[1] ?? text(rawAnswer) },
    ],
  };
};

export const gradeSystemResponse = (question = {}, rawAnswer) => {
  const solution = question.solution;
  const parsed = parseOrderedPair(rawAnswer);
  const isComplete = Boolean(parsed);
  const xCorrect = Boolean(parsed) && Math.abs(parsed[0] - Number(solution?.[0])) <= 1e-9;
  const yCorrect = Boolean(parsed) && Math.abs(parsed[1] - Number(solution?.[1])) <= 1e-9;
  const isCorrect = compareOrderedPair(rawAnswer, solution);
  return {
    isComplete,
    isCorrect,
    parsed,
    parts: [
      { id: 'system-x', label: 'x-coordinate', isComplete, isCorrect: xCorrect, response: parsed?.[0] ?? text(rawAnswer) },
      { id: 'system-y', label: 'y-coordinate', isComplete, isCorrect: yCorrect, response: parsed?.[1] ?? text(rawAnswer) },
    ],
  };
};

export const gradeNumberLineResponse = (question = {}, selectedPoint) => {
  const selected = selectedPoint === null || selectedPoint === undefined || selectedPoint === '' ? null : Number(selectedPoint);
  const isComplete = selected !== null && Number.isFinite(selected);
  const isCorrect = isComplete && selected === Number(question.target);
  return {
    isComplete,
    isCorrect,
    parts: [{ id: 'number-line', label: 'Selected point', isComplete, isCorrect, response: selected ?? '' }],
  };
};

/** The authored fields of a multi-answer question, in authored order. */
export const multiAnswerFields = (question = {}) => list(question.answerFields).filter((field) => field?.id);

export const gradeMultiAnswerResponse = (question = {}, responsesById = {}) => {
  const fields = multiAnswerFields(question);
  const parts = fields.map((field) => {
    const response = text(responsesById?.[field.id]);
    const isCorrect = response.trim() !== '' && matchesFieldAnswer(response, field);
    return {
      id: field.id,
      label: field.label || field.id,
      isComplete: response.trim() !== '',
      // Expression equivalence is deliberately opt-in at the field level.
      // That fixes MathLive serialization differences without making
      // form-sensitive tasks (factoring, vertex form, etc.) overly permissive.
      isCorrect,
      credit: isCorrect ? 1 : 0,
      weight: Number.isFinite(Number(field.scoreWeight)) && Number(field.scoreWeight) > 0
        ? Math.min(20, Number(field.scoreWeight))
        : 1,
      response,
    };
  });
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  return { isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect), parts };
};

/**
 * Every cell of a table a student may type in.
 *
 * A cell can be editable without being graded HERE: when a student fills a
 * table from the function they themselves wrote, there is no key at this level.
 * `answers` means "editable and graded here", `blanks` means "editable, graded
 * elsewhere".
 */
export const tableEditableKeys = (question = {}) => {
  const table = question?.table && typeof question.table === 'object' && !Array.isArray(question.table) ? question.table : {};
  const answers = table.answers || {};
  const blanks = list(table.blanks).map((key) => String(key));
  const seen = new Set();
  return [...Object.keys(answers), ...blanks].filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const gradeTableResponse = (question = {}, responsesByKey = {}) => {
  const table = question?.table && typeof question.table === 'object' && !Array.isArray(question.table) ? question.table : {};
  const answers = table.answers || {};
  const parts = tableEditableKeys(question).map((key) => {
    const response = text(responsesByKey?.[key]);
    const graded = Object.prototype.hasOwnProperty.call(answers, key);
    return {
      id: key,
      label: `Table blank ${key}`,
      graded,
      isComplete: response.trim() !== '',
      isCorrect: graded && response.trim() !== '' && compareMathAnswer(response, answers[key]),
      response,
    };
  });
  const gradedParts = parts.filter((part) => part.graded);
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  // Correctness is claimed only for the cells this contract holds a key for.
  // A table with no keys reports itself complete and stays silent about
  // correct, rather than reporting a filled-in table as wrong.
  return {
    isComplete,
    isCorrect: isComplete && gradedParts.length > 0 && gradedParts.every((part) => part.isCorrect),
    gradedHere: gradedParts.length > 0,
    parts,
  };
};

/* ---------------------------------------------------------------------------
 * The normalized checkpoint response.
 *
 * This is what crosses the durable boundary. It is the student's raw work and
 * the structure needed to reproduce marking — never an answer key, never a
 * verdict. `fields` keeps the part identity multipart questions need; it holds
 * the response only.
 * ------------------------------------------------------------------------- */

const SCALAR_TYPES = new Set(['literal', 'fraction', 'orderedPair', 'system', 'numberLine']);
const FIELD_TYPES = new Set(['multiAnswer', 'table']);

export const normalizeOrdinaryResponse = ({ question, answerState } = {}) => {
  const type = text(question?.type);
  const parts = list(answerState?.parts);
  if (FIELD_TYPES.has(type)) {
    return {
      kind: 'fields',
      type,
      value: '',
      fields: parts.map((part, index) => ({
        id: text(part?.id ?? `part-${index + 1}`),
        value: text(part?.response).slice(0, 240),
        isComplete: part?.isComplete === true,
      })),
    };
  }
  return {
    kind: SCALAR_TYPES.has(type) ? 'scalar' : 'opaque',
    type,
    value: text(answerState?.responseKey).slice(0, 2000),
    fields: [],
  };
};

const responsesFromFields = (response = {}) => Object.fromEntries(
  list(response.fields).map((field) => [text(field?.id), text(field?.value)]),
);

/** True when a normalized response carries no student work at all. */
export const responseIsBlank = (response) => {
  if (!response || typeof response !== 'object') return true;
  if (response.kind === 'fields') return !list(response.fields).some((field) => filled(field?.value));
  return !filled(response.value);
};

/**
 * Mark a checkpointed response against the AUTHORITATIVE question.
 *
 * The single entry point the deadline finalizer uses. It never consults any
 * field the student could have written other than the response itself.
 */
export const gradeOrdinaryResponse = ({ question, response } = {}) => {
  const support = serverGradingSupport(question);
  if (!support.supported) return { graded: false, reason: support.reason, isComplete: false, isCorrect: false, parts: [] };
  if (responseIsBlank(response)) return { graded: false, reason: 'blank-response', isComplete: false, isCorrect: false, parts: [] };

  const type = text(question.type);
  let outcome;
  if (type === 'literal') outcome = gradeLiteralResponse(question, response.value);
  else if (type === 'orderedPair') outcome = gradeOrderedPairResponse(question, response.value);
  else if (type === 'system') outcome = gradeSystemResponse(question, response.value);
  else if (type === 'multiAnswer') outcome = gradeMultiAnswerResponse(question, responsesFromFields(response));
  else if (type === 'table') outcome = gradeTableResponse(question, responsesFromFields(response));
  else return { graded: false, reason: `unsupported-type:${type}`, isComplete: false, isCorrect: false, parts: [] };

  if (!outcome.isComplete) return { graded: false, reason: 'incomplete-response', isComplete: false, isCorrect: false, parts: outcome.parts };
  return { graded: true, reason: null, ...outcome };
};
